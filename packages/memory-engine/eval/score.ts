/**
 * Metrics. Pure functions over (question, ranked results) — no store, no I/O, so
 * they can be checked against a hand-made ranking without touching the embedder.
 */

/** A query and the memory keys that should answer it. */
export interface Askable {
  q: string;
  expect: string[];
  /** Group label for the by-category breakdown. */
  class: string;
}

/** One search result, mapped back from store id to dataset key. */
export interface Result {
  key: string;
  similarity: number;
}

export interface Scored {
  question: Askable;
  results: Result[];
  /** An expected key came back first. */
  hit1: boolean;
  /** An expected key was in the top 3 — what `retrieve_memory` used to return. */
  hit3: boolean;
  /** Fraction of expected keys in the top 3. This is what measures multi-hop. */
  recall3: number;
  /** Same over the whole search window: the ceiling ranking could reach. */
  hit10: boolean;
  recall10: number;
  /** 1 / rank of the first expected key; 0 if it never appeared. */
  rr: number;
  /** similarity[0] - similarity[1]. NaN when fewer than two results came back. */
  margin: number;
}

export function scoreQuestion(question: Askable, results: Result[]): Scored {
  const expect = new Set(question.expect);
  const top3 = results.slice(0, 3);
  const firstRank = results.findIndex((r) => expect.has(r.key)) + 1;

  return {
    question,
    results,
    hit1: results[0] !== undefined && expect.has(results[0].key),
    hit3: top3.some((r) => expect.has(r.key)),
    recall3: top3.filter((r) => expect.has(r.key)).length / expect.size,
    hit10: results.some((r) => expect.has(r.key)),
    recall10: results.filter((r) => expect.has(r.key)).length / expect.size,
    rr: firstRank === 0 ? 0 : 1 / firstRank,
    margin: results.length >= 2 ? results[0]!.similarity - results[1]!.similarity : Number.NaN,
  };
}

export interface Summary {
  n: number;
  hit1: number;
  hit3: number;
  recall3: number;
  hit10: number;
  recall10: number;
  mrr: number;
  /** Mean gap between #1 and #2, over questions that got #1 right. A near-zero gap is
   *  a pass that only just happened and will flip on the next change. */
  meanMargin: number;
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarise(scored: Scored[]): Summary {
  const margins = scored
    .filter((s) => s.hit1)
    .map((s) => s.margin)
    .filter(Number.isFinite);

  return {
    n: scored.length,
    hit1: mean(scored.map((s) => (s.hit1 ? 1 : 0))),
    hit3: mean(scored.map((s) => (s.hit3 ? 1 : 0))),
    recall3: mean(scored.map((s) => s.recall3)),
    hit10: mean(scored.map((s) => (s.hit10 ? 1 : 0))),
    recall10: mean(scored.map((s) => s.recall10)),
    mrr: mean(scored.map((s) => s.rr)),
    meanMargin: mean(margins),
  };
}

export function byClass(scored: Scored[]): Map<string, Summary> {
  const groups = new Map<string, Scored[]>();
  for (const s of scored) {
    groups.set(s.question.class, [...(groups.get(s.question.class) ?? []), s]);
  }
  return new Map([...groups].map(([cls, xs]) => [cls, summarise(xs)]));
}
