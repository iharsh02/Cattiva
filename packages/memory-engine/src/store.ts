import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { embedder } from "./embedder.ts";
import {
  CREATE_MEMORIES,
  CREATE_STORE_META,
  CREATE_VEC_MEMORIES,
  DROP_VEC_MEMORIES,
  contentHash,
  rowToMemory,
  type Memory,
  type MemoryId,
  type MemoryMetadata,
  type MemoryRow,
} from "./memory.ts";

export type SearchHit = { memory: Memory; similarity: number };

export interface MemoryStore {
  add(
    content: string,
    opts?: { memoryType?: string; metadata?: MemoryMetadata },
  ): Promise<MemoryId>;
  /** Ordered most-similar first. */
  search(query: string, topK: number, filter?: MemoryMetadata): Promise<SearchHit[]>;
  get(id: MemoryId): Memory | undefined;
  /** Returns false if `id` does not exist. */
  update(id: MemoryId, content: string, metadata?: MemoryMetadata): Promise<boolean>;
  /** Returns false if `id` does not exist. */
  remove(id: MemoryId): Promise<boolean>;
  /** Returns the number of rows re-embedded. */
  rebuildIndex(): Promise<number>;
  count(): number;
  close(): void;
}

/** Window multiplier when a metadata filter can't be pushed into the KNN. */
const OVERFETCH = 5;

const REBUILD_BATCH = 64;

/** stdout is the JSON-RPC channel — writing there corrupts the protocol. */
const warn = (msg: string) => console.error(`[memory-engine] ${msg}`);

const newId = (): MemoryId => `mem_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;

export const defaultDbPath = (): string =>
  process.env.MEMORY_ENGINE_DB ?? join(homedir(), ".memory-engine", "memory.db");

/**
 * The paper is ambiguous: `Add_memory` takes a top-level `memory_type`, but its
 * `metadata_filter` example spells it `{'type': ...}`. Both route to the vec0 column
 * so the two stay consistent without duplicating the value.
 */
const TYPE_KEYS = new Set(["type", "memory_type"]);

function splitFilter(filter?: MemoryMetadata) {
  let typeFilter: string | undefined;
  const rest: MemoryMetadata = {};
  for (const [k, v] of Object.entries(filter ?? {})) {
    if (TYPE_KEYS.has(k)) typeFilter = String(v);
    else rest[k] = v;
  }
  return { typeFilter, rest, hasRest: Object.keys(rest).length > 0 };
}

const matchesMetadata = (actual: MemoryMetadata, wanted: MemoryMetadata) =>
  Object.entries(wanted).every(([k, v]) => actual[k] === v);

export function openStore(path: string = defaultDbPath()): MemoryStore {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path, { create: true });
  sqliteVec.load(db);

  if (path !== ":memory:") {
    // Without WAL a second client (Codex alongside Claude Code) gets SQLITE_BUSY.
    db.run("PRAGMA journal_mode = WAL");
  }
  db.run("PRAGMA busy_timeout = 5000");

  db.run(CREATE_MEMORIES);
  db.run(CREATE_STORE_META);
  db.run(CREATE_VEC_MEMORIES);

  const readMeta = db.prepare<{ value: string }, [string]>(
    "SELECT value FROM store_meta WHERE key = ?",
  );
  const writeMeta = db.prepare(
    "INSERT INTO store_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  const insertMemory = db.prepare(
    `INSERT INTO memories (id, content, memory_type, metadata, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectMemory = db.prepare<MemoryRow, [string]>("SELECT * FROM memories WHERE id = ?");

  const insertVec = (id: string, vector: number[], memoryType: string | null) =>
    db.run("INSERT INTO vec_memories (memory_id, embedding, memory_type) VALUES (?, ?, ?)", [
      id,
      new Float32Array(vector),
      memoryType,
    ]);
  const deleteVec = (id: string) => db.run("DELETE FROM vec_memories WHERE memory_id = ?", [id]);

  async function rebuildIndex(): Promise<number> {
    db.run(DROP_VEC_MEMORIES);
    db.run(CREATE_VEC_MEMORIES);

    const rows = db
      .prepare<{ id: string; content: string; memory_type: string | null }, []>(
        "SELECT id, content, memory_type FROM memories ORDER BY created_at",
      )
      .all();

    for (let i = 0; i < rows.length; i += REBUILD_BATCH) {
      const batch = rows.slice(i, i + REBUILD_BATCH);
      const vectors = await embedder.embed(batch.map((r) => r.content));
      db.transaction(() => {
        batch.forEach((r, j) => insertVec(r.id, vectors[j]!, r.memory_type));
      })();
    }

    writeMeta.run("embedder_id", embedder.id);
    if (rows.length > 0) warn(`rebuilt vector index for ${rows.length} memories`);
    return rows.length;
  }

  /** Deferred: the model takes ~5s to load cold, which would stall the MCP handshake. */
  let indexChecked = false;
  async function ensureIndex(): Promise<void> {
    if (indexChecked) return;
    indexChecked = true;

    const storedEmbedder = readMeta.get("embedder_id")?.value;
    const memoryCount = db.prepare<{ c: number }, []>("SELECT count(*) c FROM memories").get()!.c;
    const vectorCount = db
      .prepare<{ c: number }, []>("SELECT count(*) c FROM vec_memories")
      .get()!.c;

    if (storedEmbedder === undefined) {
      writeMeta.run("embedder_id", embedder.id);
      if (memoryCount > vectorCount) await rebuildIndex();
      return;
    }
    if (storedEmbedder !== embedder.id) {
      warn(`embedder changed (${storedEmbedder} -> ${embedder.id}); rebuilding index`);
      await rebuildIndex();
      return;
    }
    if (memoryCount !== vectorCount) {
      warn(`index out of sync (${memoryCount} memories, ${vectorCount} vectors); rebuilding`);
      await rebuildIndex();
    }
  }

  return {
    async add(content, opts) {
      await ensureIndex();
      // Outside the transaction: embedding is slow and would hold the write lock.
      const [vector] = await embedder.embed([content]);
      if (!vector) throw new Error("embedder returned no vector");

      const id = newId();
      const now = new Date().toISOString();
      const memoryType = opts?.memoryType ?? null;

      db.transaction(() => {
        insertMemory.run(
          id,
          content,
          memoryType,
          JSON.stringify(opts?.metadata ?? {}),
          contentHash(content),
          now,
          now,
        );
        insertVec(id, vector, memoryType);
      })();

      return id;
    },

    async search(query, topK, filter) {
      await ensureIndex();
      const [queryVector] = await embedder.embed([query]);
      if (!queryVector) return [];

      const { typeFilter, rest, hasRest } = splitFilter(filter);
      const k = hasRest ? topK * OVERFETCH : topK;

      const rows = db
        .prepare<MemoryRow & { distance: number }, never[]>(
          `SELECT m.*, v.distance
             FROM vec_memories v
             JOIN memories m ON m.id = v.memory_id
            WHERE v.embedding MATCH ? AND v.k = ?
              ${typeFilter === undefined ? "" : "AND v.memory_type = ?"}
            ORDER BY v.distance`,
        )
        .all(
          ...([
            new Float32Array(queryVector),
            k,
            ...(typeFilter === undefined ? [] : [typeFilter]),
          ] as never[]),
        );

      let hits: SearchHit[] = rows.map((row) => ({
        memory: rowToMemory(row),
        similarity: 1 - row.distance,
      }));

      if (hasRest) {
        hits = hits.filter((h) => matchesMetadata(h.memory.metadata, rest));
        if (hits.length < topK && rows.length === k) {
          warn(
            `metadata filter exhausted the ${k}-row window; returning ${hits.length}/${topK}. Raise OVERFETCH if this recurs.`,
          );
        }
      }

      return hits.slice(0, topK);
    },

    get(id) {
      const row = selectMemory.get(id);
      return row === null ? undefined : rowToMemory(row);
    },

    async update(id, content, metadata) {
      await ensureIndex();
      const existing = selectMemory.get(id);
      if (existing === null) return false;

      // Re-embed: skipping this leaves the vector matching the old content silently.
      const [vector] = await embedder.embed([content]);
      if (!vector) throw new Error("embedder returned no vector");
      const now = new Date().toISOString();

      db.transaction(() => {
        db.run(
          "UPDATE memories SET content = ?, metadata = ?, content_hash = ?, updated_at = ? WHERE id = ?",
          [
            content,
            metadata === undefined ? existing.metadata : JSON.stringify(metadata),
            contentHash(content),
            now,
            id,
          ],
        );
        deleteVec(id);
        insertVec(id, vector, existing.memory_type);
      })();

      return true;
    },

    async remove(id) {
      return db.transaction(() => {
        const result = db.run("DELETE FROM memories WHERE id = ?", [id]);
        deleteVec(id);
        return result.changes > 0;
      })();
    },

    rebuildIndex,

    count() {
      return db.prepare<{ c: number }, []>("SELECT count(*) c FROM memories").get()!.c;
    },

    close() {
      db.close();
    },
  };
}
