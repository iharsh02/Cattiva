import { transformersJS } from "@browser-ai/transformers-js";
import { embedMany } from "ai";
import { MODEL, MODEL_ID } from "./config.ts";

export interface ModelSpec {
  dimensions: number;
  queryPrefix?: string;
}

export interface Embedder {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(queries: string[]): Promise<number[][]>;
}

const model = transformersJS.embedding(MODEL_ID);

async function run(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];

  const { embeddings } = await embedMany({ model, values });

  const width = embeddings[0]?.length;
  if (width !== MODEL.dimensions) {
    throw new Error(
      `${MODEL_ID} returned ${width}-dimension vectors, expected ${MODEL.dimensions}. ` +
        `Fix its entry in MODELS in config.ts.`,
    );
  }

  return embeddings;
}

export const embedder: Embedder = {
  id: MODEL_ID,
  dimensions: MODEL.dimensions,

  embed: run,

  embedQuery(queries) {
    const prefix = MODEL.queryPrefix;
    return run(prefix === undefined ? queries : queries.map((q) => prefix + q));
  },
};
