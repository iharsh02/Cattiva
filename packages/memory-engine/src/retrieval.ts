/**
 * Pure retrieval utilities. Keeping rank fusion independent of SQLite and the
 * embedder lets every retrieval strategy share the same ordering guarantees.
 */

/**
 * Reciprocal-rank-fusion constant. 60 is the value from the original TREC work and
 * the one every later comparison uses; it flattens the head enough that a strong
 * second-place candidate in one retriever outranks a weak first place in the other.
 */
const RRF_K = 60;

export type Ranked<T> = { item: T; rank: number };

export type CandidateRanks<T> = {
  dense: Ranked<T>[];
  lexical: Ranked<T>[];
};

export type Fused<T> = {
  item: T;
  score: number;
  /** Candidate sources that contributed to this item's final score. */
  sources: Array<"dense" | "lexical">;
  /** Best rank this item reached in any source. Used to break score ties stably. */
  bestRank: number;
};

/**
 * Fuse independently ranked candidate lists without assuming their scores share
 * a scale. A cosine similarity and a BM25 value are not comparable numbers, but
 * their ranks are.
 *
 * Both retrievers count equally. A weighted variant is an obvious experiment, but
 * nothing has measured one, so there is no weight to configure yet.
 *
 * Ties break by best contributing rank, never by id. Ids carry random bits, so
 * ordering tied candidates by id makes the whole result set differ run to run —
 * which quietly cost the eval its determinism and put a +/-0.002 noise floor under
 * every measurement.
 */
export function reciprocalRankFuse<T extends { id: string }>(
  candidates: CandidateRanks<T>,
  limit: number,
): Fused<T>[] {
  const byId = new Map<string, Fused<T>>();

  for (const source of ["dense", "lexical"] as const) {
    for (const { item, rank } of candidates[source]) {
      const fused = byId.get(item.id) ?? {
        item,
        score: 0,
        sources: [],
        bestRank: Number.POSITIVE_INFINITY,
      };
      fused.score += 1 / (RRF_K + rank);
      fused.bestRank = Math.min(fused.bestRank, rank);
      fused.sources.push(source);
      byId.set(item.id, fused);
    }
  }

  return [...byId.values()]
    .toSorted((a, b) => b.score - a.score || a.bestRank - b.bestRank)
    .slice(0, limit);
}

/**
 * A 0-1 display score. An RRF score is an artefact of rank positions, not a
 * similarity, so this only says "how close to the best possible fusion" — it is not
 * comparable to a cosine distance and must not be read as a confidence.
 */
export function normaliseRrfScore(score: number): number {
  return score / (2 / (RRF_K + 1));
}

/**
 * Convert arbitrary natural-language input into a safe, recall-oriented FTS5
 * query. Quoted terms stop punctuation becoming FTS operators; OR keeps a
 * conversational question from requiring every term to be present.
 *
 * Stop words are deliberately kept. Filtering them was measured on LoCoMo: it put
 * more evidence into the candidate pool (absent 16.6% -> 15.8%) and still scored
 * worse on every metric, because those words give BM25 signal for ordering the
 * pool it already has. See eval/README.md.
 */
export function lexicalQuery(text: string): string | undefined {
  const terms = text.match(/[\p{L}\p{N}_]+/gu);
  if (terms === null || terms.length === 0) return undefined;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}
