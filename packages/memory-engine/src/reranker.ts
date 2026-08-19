/**
 * Second-stage reranking with a cross-encoder.
 *
 * A bi-encoder embeds the query and the memory separately, so nothing in the
 * scoring ever sees both at once. A cross-encoder reads the pair together and
 * judges whether this memory answers *this* question — much better ordering, at
 * the cost of one forward pass per candidate instead of one per store.
 *
 * That cost is why it reorders a fused shortlist rather than the whole store.
 */
import { RERANK_MODEL, RERANK_MODEL_SPEC } from "./config.ts";

export interface Reranker {
  readonly id: string;
  /** Relevance scores aligned with `documents`. Higher is more relevant. */
  score(query: string, documents: string[]): Promise<number[]>;
}

/**
 * Measured, not assumed: q8 scores drift by up to ~0.7 on a ~17-wide logit range
 * between batched and one-at-a-time. Equal-length batches drift too, so it is
 * quantisation noise rather than pad leakage, and the top-10 order is unchanged —
 * which is all retrieval consumes.
 *
 * Do not raise this without re-checking that last claim. The embedder hit the same
 * class of bug the other way round (see eval/README.md), where batching silently
 * corrupted vectors for one model and not another.
 */
const BATCH = 16;

async function build() {
  const { AutoModelForSequenceClassification, AutoTokenizer } =
    await import("@huggingface/transformers");
  const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL);
  const model = await AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, {
    dtype: RERANK_MODEL_SPEC.dtype,
  });

  return async (query: string, documents: string[]): Promise<number[]> => {
    const inputs = tokenizer(
      Array.from({ length: documents.length }, () => query),
      { text_pair: documents, padding: true, truncation: true },
    );
    const { logits } = await model(inputs);
    const [rows, labels] = logits.dims as [number, number];
    const data = logits.data as Float32Array;

    // One label is a relevance score; two is an (irrelevant, relevant) pair whose
    // difference is the log-odds. Both reduce to "higher is better".
    return Array.from({ length: rows }, (_, i) =>
      labels === 1 ? data[i]! : data[i * labels + 1]! - data[i * labels]!,
    );
  };
}

let pipeline: ReturnType<typeof build> | undefined;

export const reranker: Reranker = {
  id: RERANK_MODEL,

  async score(query, documents) {
    if (documents.length === 0) return [];
    const run = await (pipeline ??= build());

    const out: number[] = [];
    for (let i = 0; i < documents.length; i += BATCH) {
      out.push(...(await run(query, documents.slice(i, i + BATCH))));
    }
    return out;
  },
};

/**
 * Map a cross-encoder score to a 0-1 relevance probability.
 *
 * The raw output is log-odds on an unbounded, model-specific scale — fine for
 * ordering, meaningless to show anyone. Sigmoid is strictly monotonic, so this
 * never reorders anything; it only makes the number readable.
 */
export const relevanceProbability = (logOdds: number): number => 1 / (1 + Math.exp(-logOdds));

/**
 * Reorder `items` by cross-encoder relevance, most relevant first. Ties keep their
 * incoming order, so candidates the reranker cannot separate fall back to whatever
 * fusion decided.
 */
export async function rerank<T>(
  query: string,
  items: T[],
  text: (item: T) => string,
  scorer: Reranker = reranker,
): Promise<Array<{ item: T; score: number }>> {
  const scores = await scorer.score(query, items.map(text));
  return items
    .map((item, index) => ({ item, score: scores[index] ?? Number.NEGATIVE_INFINITY, index }))
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item, score }) => ({ item, score }));
}
