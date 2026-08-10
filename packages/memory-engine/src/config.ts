/**
 * Everything a user can configure, in one place.
 *
 * Two environment variables and one model registry — kept apart from the code that
 * consumes them so that changing a default, or adding a model, never means reading
 * the embedder or the store.
 *
 * Tuning constants that only make sense next to the algorithm they tune (the store's
 * overfetch window, its rebuild batch size) deliberately stay in `store.ts`.
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
export const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";

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

// ------------------------------------------------------------------- store

/** `~/.cattiva/` is shared across toolkits; each owns its own file inside it. */
export const defaultDbPath = (): string =>
  process.env.CATTIVA_MEMORY_DB ?? join(homedir(), ".cattiva", "memory.db");
