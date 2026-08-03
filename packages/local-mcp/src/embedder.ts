import { transformersJS } from "@browser-ai/transformers-js";
import { embedMany } from "ai";

const MODEL_ID = "Supabase/gte-small";
const DIMENSIONS = 384;

export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

const model = transformersJS.embedding(MODEL_ID);

export const embedder: Embedder = {
  id: MODEL_ID,
  dimensions: DIMENSIONS,

  async embed(texts) {
    if (texts.length === 0) return [];

    const { embeddings } = await embedMany({ model, values: texts });

    const width = embeddings[0]?.length;
    if (width !== DIMENSIONS) {
      throw new Error(
        `${MODEL_ID} returned ${width}-dimension vectors, expected ${DIMENSIONS}. ` +
          `Update DIMENSIONS and the vec0 table width together.`,
      );
    }

    return embeddings;
  },
};
