/**
 * A transparent cross-encoder score cache, for the eval only.
 *
 * Reranking costs one forward pass per candidate, so a depth-100 run is ~198,000
 * passes — about 25 minutes. Yet the score for a given (query, document) pair never
 * changes while the model is fixed, and the loop we actually iterate in is *fusion
 * and depth*, which reshuffles those pairs without creating new ones.
 *
 * Unlike the vector cache there is no precision round-trip to worry about: SQLite
 * REAL and a JS number are both float64, so a stored score reads back bit-identical.
 *
 * Deliberately not in `src/`. Real users ask novel questions; there would be nothing
 * to reuse.
 */
import { Database } from "bun:sqlite";
import type { Reranker } from "../src/reranker.ts";

/** SHA-256, not a fast hash: a collision would return a confidently wrong score. */
const hash = (text: string): string => new Bun.CryptoHasher("sha256").update(text).digest("hex");

const CREATE = `
  CREATE TABLE IF NOT EXISTS scores (
    model TEXT NOT NULL,
    query TEXT NOT NULL,
    doc   TEXT NOT NULL,
    score REAL NOT NULL,
    PRIMARY KEY (model, query, doc)
  )`;

export interface CachedReranker extends Reranker {
  stats(): { hits: number; misses: number };
  close(): void;
}

export function cachedReranker(base: Reranker, dbPath: string): CachedReranker {
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(CREATE);

  const read = db.prepare<{ score: number }, [string, string, string]>(
    "SELECT score FROM scores WHERE model = ? AND query = ? AND doc = ?",
  );
  const write = db.prepare(
    "INSERT OR REPLACE INTO scores (model, query, doc, score) VALUES (?, ?, ?, ?)",
  );

  let hits = 0;
  let misses = 0;

  return {
    id: base.id,

    async score(query, documents) {
      if (documents.length === 0) return [];
      const qh = hash(query);
      const out = Array.from<number | undefined>({ length: documents.length });

      // Dedupe by document hash: a fused shortlist can repeat a turn across sources,
      // and the same pair must not be scored twice inside one call.
      const wanted = new Map<string, { text: string; slots: number[] }>();

      documents.forEach((doc, i) => {
        const dh = hash(doc);
        const cached = read.get(base.id, qh, dh);
        if (cached !== null) {
          out[i] = cached.score;
          hits++;
          return;
        }
        const entry = wanted.get(dh);
        if (entry === undefined) wanted.set(dh, { text: doc, slots: [i] });
        else entry.slots.push(i);
        misses++;
      });

      const pending = [...wanted.entries()];
      if (pending.length > 0) {
        const scores = await base.score(
          query,
          pending.map(([, e]) => e.text),
        );
        db.transaction(() => {
          pending.forEach(([dh, entry], j) => {
            const score = scores[j];
            if (score === undefined)
              throw new Error("reranker returned fewer scores than documents");
            write.run(base.id, qh, dh, score);
            for (const slot of entry.slots) out[slot] = score;
          });
        })();
      }

      return out.map((s, i) => {
        if (s === undefined) throw new Error(`no score for document at index ${i}`);
        return s;
      });
    },

    stats: () => ({ hits, misses }),
    close: () => db.close(),
  };
}
