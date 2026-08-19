/**
 * A transparent embedding cache, for the eval only.
 *
 * Every run re-embeds the same 5,882 turns and 1,977 questions. Nothing about them
 * changes when we change *ranking* — hybrid search, reranking, recency weighting all
 * leave the vectors identical — so the eval was paying ~2 minutes per iteration for a
 * result it already had.
 *
 * It wraps an `Embedder` and reports the same `id`, so the store's `embedder_id`
 * bookkeeping and the per-model baselines are unaffected: a cached run must produce
 * byte-identical vectors to an uncached one.
 *
 * Deliberately not in `src/`. A user's `add_memory` calls are near-always novel text,
 * so this would be disk cost for nothing; it earns its keep only against a fixed corpus
 * queried over and over.
 */
import { Database } from "bun:sqlite";
import type { Embedder } from "../src/embedder.ts";

/** Measured on a Ryzen 4800H: throughput peaks at 64 and falls off by 128. */
const BATCH = 64;

/**
 * Queries and documents are cached apart. BGE-family models prefix the query and not
 * the document, so the same string embeds to two different vectors depending on which
 * side it arrived on.
 */
type Kind = "doc" | "query";

const CREATE = `
  CREATE TABLE IF NOT EXISTS vectors (
    model  TEXT NOT NULL,
    kind   TEXT NOT NULL,
    hash   TEXT NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (model, kind, hash)
  )`;

/**
 * SHA-256, not `Bun.hash`. A 64-bit collision here would not error — it would hand back
 * a confidently wrong vector and quietly move the score.
 */
const hash = (text: string): string => new Bun.CryptoHasher("sha256").update(text).digest("hex");

const toBlob = (v: number[]): Uint8Array => new Uint8Array(new Float32Array(v).buffer);

/** `.slice()` copies, which also guarantees the 4-byte alignment Float32Array needs. */
const fromBlob = (b: Uint8Array): number[] =>
  Array.from(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));

export interface CachedEmbedder extends Embedder {
  stats(): { hits: number; misses: number };
  close(): void;
}

export function cachedEmbedder(base: Embedder, dbPath: string): CachedEmbedder {
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(CREATE);

  const read = db.prepare<{ vector: Uint8Array }, [string, string, string]>(
    "SELECT vector FROM vectors WHERE model = ? AND kind = ? AND hash = ?",
  );
  const write = db.prepare(
    "INSERT OR REPLACE INTO vectors (model, kind, hash, vector) VALUES (?, ?, ?, ?)",
  );

  let hits = 0;
  let misses = 0;

  async function lookup(kind: Kind, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const out = Array.from<number[] | undefined>({ length: texts.length });

    // Dedupe by hash: a corpus repeats itself ("Sure!", "Haha yeah"), and within one
    // call the same text must not be embedded twice.
    const wanted = new Map<string, { text: string; slots: number[] }>();

    texts.forEach((text, i) => {
      const h = hash(text);
      const cached = read.get(base.id, kind, h);
      if (cached !== null) {
        out[i] = fromBlob(cached.vector);
        hits++;
        return;
      }
      const entry = wanted.get(h);
      if (entry === undefined) wanted.set(h, { text, slots: [i] });
      else entry.slots.push(i);
      misses++;
    });

    const pending = [...wanted.entries()];
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const values = chunk.map(([, e]) => e.text);
      const vectors = kind === "query" ? await base.embedQuery(values) : await base.embed(values);

      db.transaction(() => {
        chunk.forEach(([h, entry], j) => {
          const vector = vectors[j];
          if (vector === undefined) throw new Error("embedder returned fewer vectors than texts");
          const blob = toBlob(vector);
          write.run(base.id, kind, h, blob);
          // Hand back the float32 round-trip, not `vector` — otherwise a miss returns
          // more precision than the hit that replaces it next run, and a cold run and a
          // warm run of the same eval disagree. Free for ONNX (already float32), not for
          // a backend that returns JSON floats.
          const stored = fromBlob(blob);
          for (const slot of entry.slots) out[slot] = stored;
        });
      })();
    }

    return out.map((v, i) => {
      if (v === undefined) throw new Error(`no vector for text at index ${i}`);
      return v;
    });
  }

  return {
    id: base.id,
    dimensions: base.dimensions,
    embed: (texts) => lookup("doc", texts),
    embedQuery: (queries) => lookup("query", queries),
    stats: () => ({ hits, misses }),
    close: () => db.close(),
  };
}
