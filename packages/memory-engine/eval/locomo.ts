#!/usr/bin/env bun
/**
 * The same harness against LoCoMo — 10 long multi-session conversations,
 * 5,882 turns, 1,986 questions with human-labelled evidence turns.
 *
 *   curl -sSLo packages/memory-engine/eval/data/locomo10.json \
 *     https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
 *
 *   bun run packages/memory-engine/eval/locomo.ts
 *   bun run packages/memory-engine/eval/locomo.ts --limit 2   first 2 conversations
 *   bun run packages/memory-engine/eval/locomo.ts --save
 *
 * It measures the shipping pipeline, not a copy of it: every question goes through
 * `store.search()` exactly as the MCP tool does, with caching embedder and reranker
 * injected. Ablations are the product's own env vars, so a setting that scores well
 * here is a setting a user can actually turn on:
 *
 *   CATTIVA_RERANK=0                                        no cross-encoder
 *   CATTIVA_CANDIDATE_POOL=200 CATTIVA_RERANK_DEPTH=100     wider pool and shortlist
 *
 * One store per conversation — questions are scoped to their own conversation,
 * so pooling them would invent distractors the labels never accounted for.
 *
 * Caveat worth remembering when reading the score: memories here are raw dialogue
 * turns, not the distilled facts `add_memory` normally receives. It measures the
 * retrieval layer honestly; it does not measure the whole product.
 */
import { join } from "node:path";
import { embedder, type Embedder } from "../src/embedder.ts";
import { CANDIDATE_POOL, RERANK_DEPTH, RERANK_ENABLED, RERANK_MODEL } from "../src/config.ts";
import { reranker } from "../src/reranker.ts";
import { openStore } from "../src/store.ts";
import { cachedEmbedder } from "./cache.ts";
import { cachedReranker } from "./rerank-cache.ts";
import {
  byClass,
  scoreQuestion,
  summarise,
  type Result,
  type Scored,
  type Summary,
} from "./score.ts";

const TOP_K = 10;
const DATA = join(import.meta.dir, "data", "locomo10.json");
const BASELINE = join(import.meta.dir, "baseline.json");
const CACHE = join(import.meta.dir, "data", "embed-cache.db");
const RERANK_CACHE = join(import.meta.dir, "data", "rerank-cache.db");

/** LoCoMo's numeric categories, per the paper. */
const CATEGORY: Record<number, string> = {
  1: "multi-hop",
  2: "temporal",
  3: "open-domain",
  4: "single-hop",
  5: "adversarial",
};

interface Turn {
  speaker: string;
  dia_id: string;
  text: string;
  blip_caption?: string;
}
interface QA {
  question: string;
  evidence?: string[];
  category: number;
}
interface Conversation {
  sample_id: string;
  qa: QA[];
  conversation: Record<string, Turn[] | string>;
}

const n3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "  —  ");
const delta = (now: number, before: number | undefined): string => {
  if (before === undefined || !Number.isFinite(before)) return "";
  const d = now - before;
  return Math.abs(d) < 0.0005 ? "   —" : `  ${d > 0 ? "+" : ""}${d.toFixed(3)}`;
};

if (!(await Bun.file(DATA).exists())) {
  console.error(
    `\nLoCoMo not found at ${DATA}\n\nDownload it with:\n  mkdir -p ${join(import.meta.dir, "data")}\n  curl -sSLo ${DATA} \\\n    https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json\n`,
  );
  process.exit(1);
}

const dataset: Conversation[] = await Bun.file(DATA).json();

const limitArg = process.argv.indexOf("--limit");
const conversations =
  limitArg === -1
    ? dataset
    : dataset.slice(0, Number(process.argv[limitArg + 1] ?? dataset.length));

/** Image turns carry their meaning in the caption, so fold it into the text. */
const turnText = (t: Turn): string =>
  `${t.speaker}: ${t.text}${t.blip_caption === undefined ? "" : ` [photo: ${t.blip_caption}]`}`;

const sessionTurns = (c: Conversation): Turn[] =>
  Object.entries(c.conversation)
    .filter(([k, v]) => k.startsWith("session_") && !k.includes("date") && Array.isArray(v))
    .flatMap(([, v]) => v as Turn[]);

/**
 * Vectors are cached across runs, keyed by (model, doc|query, sha256(text)). Changing
 * how results are *ranked* does not change a single embedding, and that is the loop
 * this eval mostly runs in. `--no-cache` forces a cold run.
 */
const noCache = process.argv.includes("--no-cache");

/**
 * Cross-encoder scores are cached too, keyed by (model, sha256(query), sha256(doc)).
 * Reranking is by far the slowest stage — a full uncached run is ~400s against ~10s
 * warm — and, like the vectors, none of it changes when only the ranking does.
 */
const rerankCache = noCache ? undefined : cachedReranker(reranker, RERANK_CACHE);
const cache = noCache ? undefined : cachedEmbedder(embedder, CACHE);
const active: Embedder = cache ?? embedder;

const scored: Scored[] = [];
let skipped = 0;
const startedAt = Bun.nanoseconds();

for (const [i, conv] of conversations.entries()) {
  const turns = sessionTurns(conv);
  const known = new Set(turns.map((t) => t.dia_id));
  const texts = turns.map(turnText);

  // A handful of evidence ids point at turns the dataset does not ship.
  const asks = conv.qa.map((qa) => ({
    qa,
    expect: (qa.evidence ?? []).filter((e) => known.has(e)),
  }));
  const askable = asks.filter((a) => a.expect.length > 0);
  skipped += asks.length - askable.length;

  // One batched pass over each side, purely to fill the cache — measured, batch 64 is
  // ~1.7x batch 1 on CPU. The store keeps its one-at-a-time API and every call below
  // is then a cache hit.
  if (cache !== undefined) {
    await cache.embed(texts);
    await cache.embedQuery(askable.map((a) => a.qa.question));
  }

  const store = openStore(":memory:", active, rerankCache ?? reranker);
  const keyById = new Map<string, string>();
  for (const [j, t] of turns.entries()) {
    keyById.set(await store.add(texts[j]!), t.dia_id);
  }

  for (const { qa, expect } of askable) {
    const hits = await store.search(qa.question, TOP_K);
    const results: Result[] = hits.slice(0, TOP_K).map((h) => ({
      key: keyById.get(h.memory.id) ?? "?",
      similarity: h.similarity,
    }));
    scored.push(
      scoreQuestion(
        { q: qa.question, expect, class: CATEGORY[qa.category] ?? `cat${qa.category}` },
        results,
      ),
    );
  }

  store.close();
  console.error(
    `  [${i + 1}/${conversations.length}] ${conv.sample_id}: ${turns.length} turns, ${conv.qa.length} questions`,
  );
}

const elapsed = (Bun.nanoseconds() - startedAt) / 1e9;

// ----------------------------------------------------------------- report

const overall = summarise(scored);
const classes = byClass(scored);

type Baselines = Record<string, { overall: Summary; byClass: Record<string, Summary> }>;
const saved: Baselines = (await Bun.file(BASELINE).exists()) ? await Bun.file(BASELINE).json() : {};
const prev = saved[embedder.id];

console.log(`\nLoCoMo retrieval eval`);
console.log(`model: ${embedder.id} (${embedder.dimensions}d)`);
console.log(
  `${conversations.length} conversations, ${scored.length} questions scored, ${skipped} skipped (no resolvable evidence), top_k=${TOP_K}`,
);
if (cache === undefined) {
  console.log(`${elapsed.toFixed(1)}s, cache disabled`);
} else {
  const { hits, misses } = cache.stats();
  const total = hits + misses;
  const rate = total === 0 ? 0 : hits / total;
  console.log(
    `${elapsed.toFixed(1)}s, cache ${(rate * 100).toFixed(0)}% hit (${hits} hit, ${misses} embedded)`,
  );
}
if (RERANK_ENABLED) {
  const rs = rerankCache?.stats() ?? { hits: 0, misses: 0 };
  console.log(
    `reranker: ${RERANK_MODEL}, pool=${CANDIDATE_POOL}, depth=${RERANK_DEPTH}, ` +
      `cache ${rs.hits} hit / ${rs.misses} scored`,
  );
} else {
  console.log(`reranker: off (CATTIVA_RERANK=0)`);
}
if (prev === undefined) console.log(`no baseline for this model — run with --save to record one`);

console.log(`\n── overall ──\n`);
for (const [label, key] of [
  ["hit@1      ", "hit1"],
  ["hit@3      ", "hit3"],
  ["recall@3   ", "recall3"],
  ["hit@10     ", "hit10"],
  ["recall@10  ", "recall10"],
  ["MRR        ", "mrr"],
  ["mean margin", "meanMargin"],
] as const) {
  console.log(`  ${label}  ${n3(overall[key])}${delta(overall[key], prev?.overall[key])}`);
}

console.log(`\n── by category ──\n`);
console.log(`  category        n   hit@1  hit@3  rec@3  hit@10  rec@10    MRR`);
for (const [cls, s] of [...classes].toSorted((a, b) => b[1].n - a[1].n)) {
  console.log(
    `  ${cls.padEnd(12)} ${String(s.n).padStart(4)}   ${n3(s.hit1)}  ${n3(s.hit3)}  ${n3(s.recall3)}   ${n3(s.hit10)}   ${n3(s.recall10)}  ${n3(s.mrr)}`,
  );
}

if (process.argv.includes("--save")) {
  const next: Baselines = {
    ...saved,
    [embedder.id]: { overall, byClass: Object.fromEntries(classes) },
  };
  await Bun.write(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nbaseline for ${embedder.id} written to ${BASELINE}`);
}
cache?.close();
rerankCache?.close();
console.log();
