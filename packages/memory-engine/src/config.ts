/**
 * Everything a user can configure, in one place.
 *
 * Two environment variables and one model registry — kept apart from the code that
 * consumes them so that changing a default, or adding a model, never means reading
 * the embedder or the store.
 *
 * Tuning constants that only make sense next to the algorithm they tune (the store's
 * overfetch window, its rebuild batch size) deliberately stay in `store.ts`. The
 * candidate pool is the exception: it is meaningless apart from the rerank depth it
 * feeds, so the two live side by side below.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelSpec } from "./embedder.ts";

// ------------------------------------------------------------------ models

const BGE_QUERY = "Represent this sentence for searching relevant passages: ";

/**
 * Encoder models only. Decoder-only embedders (Qwen3-Embedding and similar) need
 * last-token pooling rather than the mean, which the provider cannot do — routing one
 * through it yields plausible-looking wrong vectors and no error. See eval/README.md.
 */
export const MODELS: Record<string, ModelSpec> = {
  "Supabase/gte-small": { dimensions: 384 },
  "Xenova/all-MiniLM-L6-v2": { dimensions: 384 },
  "Xenova/bge-small-en-v1.5": { dimensions: 384, queryPrefix: BGE_QUERY },
  "Xenova/gte-base": { dimensions: 768 },
  "Xenova/bge-base-en-v1.5": { dimensions: 768, queryPrefix: BGE_QUERY },
  "mixedbread-ai/mxbai-embed-large-v1": { dimensions: 1024, queryPrefix: BGE_QUERY },
};

/** Every model the eval can compare. */
export const MODEL_IDS = Object.keys(MODELS);

/**
 * Chosen on measured evidence — see eval/README.md. Best scores on LoCoMo of the
 * models tried, at the smallest size (34MB, 384d), and it works with no setup.
 */
const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";

/** CATTIVA_EMBED_MODEL swaps the model; the store rebuilds its index on the next open. */
export const MODEL_ID = process.env.CATTIVA_EMBED_MODEL ?? DEFAULT_MODEL;

const spec = MODELS[MODEL_ID];
if (spec === undefined) {
  throw new Error(
    `Unknown embedding model ${MODEL_ID}. Add it to MODELS in config.ts with its vector width. ` +
      `Known: ${MODEL_IDS.join(", ")}`,
  );
}

/** The active model's spec, already validated — consumers need no undefined check. */
export const MODEL: ModelSpec = spec;

// --------------------------------------------------------------- reranking

export interface RerankModelSpec {
  /** Quantisation to load. Cross-encoders are small, so q8 keeps the download modest. */
  dtype: "q8" | "fp16" | "fp32";
  approxSizeMb: number;
}

const RERANK_MODELS: Record<string, RerankModelSpec> = {
  "Xenova/ms-marco-MiniLM-L-6-v2": { dtype: "q8", approxSizeMb: 23 },
  "Xenova/ms-marco-MiniLM-L-12-v2": { dtype: "q8", approxSizeMb: 34 },
  "mixedbread-ai/mxbai-rerank-xsmall-v1": { dtype: "q8", approxSizeMb: 71 },
  "Xenova/bge-reranker-base": { dtype: "q8", approxSizeMb: 278 },
};

const RERANK_MODEL_IDS = Object.keys(RERANK_MODELS);

const DEFAULT_RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";

/** CATTIVA_RERANK_MODEL swaps the cross-encoder. */
export const RERANK_MODEL = process.env.CATTIVA_RERANK_MODEL ?? DEFAULT_RERANK_MODEL;

const rerankSpec = RERANK_MODELS[RERANK_MODEL];
if (rerankSpec === undefined) {
  throw new Error(
    `Unknown rerank model ${RERANK_MODEL}. Add it to RERANK_MODELS in config.ts. ` +
      `Known: ${RERANK_MODEL_IDS.join(", ")}`,
  );
}

export const RERANK_MODEL_SPEC: RerankModelSpec = rerankSpec;

/**
 * How many fused candidates the cross-encoder reorders.
 *
 * Measured on LoCoMo across pool/depth pairs, cost scaling with depth:
 *
 *   pool  depth   hit@1   recall@10   rerank cost
 *     50     30   0.496       0.718           1x
 *    100     50   0.496       0.731         1.7x
 *    200    100   0.497       0.740         3.3x
 *
 * `hit@1` is flat — quadrupling the pool moved the top result for **one question in
 * 1,977**. Everything the cross-encoder is going to get right, it gets right from the
 * first 50 candidates. The wider pools buy a little `recall@10` and nothing else.
 *
 * That is the ceiling measurement's verdict too: going 50 -> 200 puts the evidence in
 * the pool 12.3 points more often, and only 2.2 points of that reach the results —
 * ~18% conversion, against ~84% for the candidates already there. What fusion buries
 * below rank 50, the reranker cannot recognise either. So the limit is the reranker's
 * judgement, not the size of the net, and depth stays at the cheapest setting.
 */
export const RERANK_DEPTH = Number(process.env.CATTIVA_RERANK_DEPTH ?? 30);

/**
 * Floor on candidates fetched per retriever before fusion. Fusion cannot promote what
 * was never fetched, so this is the true ceiling on recall — but see the table above:
 * raising it without raising `RERANK_DEPTH` does nothing, and raising both barely does
 * either. `CATTIVA_CANDIDATE_POOL` exists so that sweep can be re-run cheaply against a
 * future reranker, not because the current one rewards turning it up.
 */
export const CANDIDATE_POOL = Number(process.env.CATTIVA_CANDIDATE_POOL ?? 50);

/**
 * On by default: it is worth +0.16 `hit@1` (0.337 -> 0.496), which is the single
 * largest measured improvement in the engine. The price is a ~23MB one-time download
 * and a forward pass per candidate — roughly 200ms per retrieval on a CPU.
 *
 * `CATTIVA_RERANK=0` turns it off for latency-sensitive hosts, which costs a third of
 * the correct first answers.
 */
export const RERANK_ENABLED = !/^(0|false|off|no)$/i.test(process.env.CATTIVA_RERANK ?? "");

// ------------------------------------------------------------------- store

/** `~/.cattiva/` is shared across toolkits; each owns its own file inside it. */
export const defaultDbPath = (): string =>
  process.env.CATTIVA_MEMORY_DB ?? join(homedir(), ".cattiva", "memory.db");
