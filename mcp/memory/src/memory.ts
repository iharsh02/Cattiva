import { embedder } from "./embedder.ts";

export type MemoryId = string;

/** Scalars only — `metadata_filter` equality-matches these. */
export type MemoryMetadata = Record<string, string | number | boolean>;

export type Memory = {
  id: MemoryId;
  content: string;
  memoryType?: string;
  metadata: MemoryMetadata;
  /** Fingerprint of the content the stored vector was built from; detects staleness. */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryRow = {
  id: string;
  content: string;
  memory_type: string | null;
  metadata: string; // JSON
  content_hash: string;
  created_at: string;
  updated_at: string;
};

export function contentHash(content: string): string {
  return Bun.hash(content).toString(36);
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    ...(row.memory_type !== null && { memoryType: row.memory_type }),
    metadata: JSON.parse(row.metadata) as MemoryMetadata,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** No indexes: filtering happens inside vec0, and scans are cheap at this scale. */
export const CREATE_MEMORIES = `
  CREATE TABLE IF NOT EXISTS memories (
    id           TEXT PRIMARY KEY,
    content      TEXT NOT NULL,
    memory_type  TEXT,
    metadata     TEXT NOT NULL DEFAULT '{}',
    content_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  )`;

/**
 * Derived — safe to DROP and rebuild from `memories`.
 * `distance_metric=cosine` is required; the default is L2. vec0 reports *distance*,
 * so similarity = 1 - distance.
 * `memory_type` is duplicated here so filters apply inside the KNN, not after it.
 */
export const CREATE_VEC_MEMORIES = `
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
    memory_id   TEXT PRIMARY KEY,
    embedding   FLOAT[${embedder.dimensions}] distance_metric=cosine,
    memory_type TEXT
  )`;

export const DROP_VEC_MEMORIES = `DROP TABLE IF EXISTS vec_memories`;

/**
 * Lexical candidate source for hybrid retrieval. Derived data, like `vec_memories`:
 * `memories` stays the source of truth and this can be rebuilt from it at any time.
 *
 * Porter stemming makes "retrieving" match "retrieve"; unicode61 keeps identifiers
 * and non-ASCII text usable without another tokenizer dependency.
 */
export const CREATE_MEMORIES_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    memory_id UNINDEXED,
    content,
    tokenize='porter unicode61'
  )`;

/** `embedder_id` is store-level, not per-row: every vector must share one embedding space. */
export const CREATE_STORE_META = `
  CREATE TABLE IF NOT EXISTS store_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;
