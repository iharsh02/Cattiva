import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { CANDIDATE_POOL, RERANK_DEPTH, RERANK_ENABLED, defaultDbPath } from "./config.ts";
import { embedder as defaultEmbedder, type Embedder } from "./embedder.ts";
import {
  type Reranker,
  relevanceProbability,
  rerank,
  reranker as defaultReranker,
} from "./reranker.ts";
import {
  CREATE_MEMORIES,
  CREATE_MEMORIES_FTS,
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
import {
  lexicalQuery,
  normaliseRrfScore,
  reciprocalRankFuse,
  type CandidateRanks,
} from "./retrieval.ts";

export type SearchHit = {
  memory: Memory;
  /**
   * Relevance in 0-1, descending — always consistent with the order of the results.
   *
   * Its *meaning* depends on the pipeline, so do not compare across configurations:
   * with reranking on it is the cross-encoder's relevance probability for this
   * query and memory; with it off it is a normalised rank-fusion score, which is an
   * artefact of rank positions rather than a similarity.
   */
  similarity: number;
  /** Which candidate sources contributed to this result's rank. */
  sources: Array<"dense" | "lexical">;
};

export type RetrievalCandidates = CandidateRanks<Memory>;

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
  close(): void;
}

/** Window multiplier when a metadata filter can't be pushed into the KNN. */
const OVERFETCH = 5;

/** Candidates fetched per retriever, as a multiple of topK. The floor is CANDIDATE_POOL. */
const CANDIDATE_MULTIPLIER = 5;

const REBUILD_BATCH = 64;

/** stdout is the JSON-RPC channel — writing there corrupts the protocol. */
const warn = (msg: string) => console.error(`[cattiva:memory] ${msg}`);

/**
 * Time prefix keeps ids roughly sortable; the suffix is 48 bits of randomness because
 * the timestamp only has millisecond resolution. It used to take 4 hex chars — 16 bits
 * — which collides at ~256 inserts inside one millisecond. Interactive `add_memory`
 * calls are seconds apart so it never showed, but a bulk import trips it immediately.
 */
const newId = (): MemoryId =>
  `mem_${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

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

const candidateCount = (topK: number) => Math.max(CANDIDATE_POOL, topK * CANDIDATE_MULTIPLIER);

/**
 * `embedder` and `scorer` are injectable so a harness can wrap them — the eval swaps in
 * caching decorators, which is the only reason it can re-measure a ranking change in
 * seconds instead of minutes. Injecting them here rather than reimplementing the search
 * pipeline is what keeps the eval measuring *this* code and not a copy of it.
 *
 * The embedder must report the same `id` and `dimensions` as the default, or the
 * index-rebuild bookkeeping below is comparing across embedding spaces.
 */
export function openStore(
  path: string = defaultDbPath(),
  embedder: Embedder = defaultEmbedder,
  scorer: Reranker = defaultReranker,
): MemoryStore {
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
  db.run(CREATE_MEMORIES_FTS);

  // Derived data, so it can be rebuilt rather than migrated. This upgrades stores
  // created before lexical retrieval existed without a migration step.
  const memoryTotal = db.prepare<{ c: number }, []>("SELECT count(*) c FROM memories");
  const ftsTotal = db.prepare<{ c: number }, []>("SELECT count(*) c FROM memories_fts");
  if (memoryTotal.get()!.c !== ftsTotal.get()!.c) {
    db.transaction(() => {
      db.run("DELETE FROM memories_fts");
      db.run("INSERT INTO memories_fts(memory_id, content) SELECT id, content FROM memories");
    })();
  }

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
  const insertFts = db.prepare("INSERT INTO memories_fts(memory_id, content) VALUES (?, ?)");
  const deleteFts = db.prepare("DELETE FROM memories_fts WHERE memory_id = ?");

  const insertVec = (id: string, vector: number[], memoryType: string | null) =>
    db.run("INSERT INTO vec_memories (memory_id, embedding, memory_type) VALUES (?, ?, ?)", [
      id,
      new Float32Array(vector),
      memoryType ?? "",
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

  /**
   * Candidate ranks from each retriever, before fusion or reranking. Split out from
   * `search` because the two answer different questions: this one is "what could
   * plausibly match", `search` is "what is the best order". Fusion cannot promote what
   * this never returned, so `limit` is the hard ceiling on recall.
   */
  async function candidates(
    query: string,
    limit: number,
    filter?: MemoryMetadata,
  ): Promise<RetrievalCandidates> {
    await ensureIndex();
    const [queryVector] = await embedder.embedQuery([query]);
    if (!queryVector) return { dense: [], lexical: [] };

    const { typeFilter, rest, hasRest } = splitFilter(filter);
    const window = hasRest ? limit * OVERFETCH : limit;

    const denseRows = db
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
          window,
          ...(typeFilter === undefined ? [] : [typeFilter]),
        ] as never[]),
      );

    const fts = lexicalQuery(query);
    const lexicalRows =
      fts === undefined
        ? []
        : db
            .prepare<MemoryRow & { lexical_rank: number }, never[]>(
              `SELECT m.*, f.rank AS lexical_rank
                 FROM memories_fts f
                 JOIN memories m ON m.id = f.memory_id
                WHERE memories_fts MATCH ?
                  ${typeFilter === undefined ? "" : "AND m.memory_type = ?"}
                ORDER BY f.rank
                LIMIT ?`,
            )
            .all(...([fts, ...(typeFilter === undefined ? [] : [typeFilter]), window] as never[]));

    const keep = (rows: MemoryRow[]) => {
      const memories = rows.map(rowToMemory);
      const filtered = hasRest
        ? memories.filter((memory) => matchesMetadata(memory.metadata, rest))
        : memories;
      return filtered.slice(0, limit).map((item, index) => ({ item, rank: index + 1 }));
    };

    const dense = keep(denseRows);
    const lexical = keep(lexicalRows);

    if (hasRest && (dense.length < limit || lexical.length < limit)) {
      if (denseRows.length === window || lexicalRows.length === window) {
        warn(
          `metadata filter exhausted a candidate window; dense=${dense.length}/${limit}, lexical=${lexical.length}/${limit}. Raise OVERFETCH if this recurs.`,
        );
      }
    }

    return { dense, lexical };
  }

  const store: MemoryStore = {
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
        insertFts.run(id, content);
        insertVec(id, vector, memoryType);
      })();

      return id;
    },

    async search(query, topK, filter) {
      const pool = await candidates(query, candidateCount(topK), filter);

      // Fuse deeper than topK when reranking, so the cross-encoder can promote a
      // memory fusion buried. Reranking only the final ten could reorder them but
      // never rescue an eleventh.
      const depth = RERANK_ENABLED ? Math.max(topK, RERANK_DEPTH) : topK;
      const fused = reciprocalRankFuse(pool, depth);

      const hits: SearchHit[] = fused.map(({ item, score, sources }) => ({
        memory: item,
        similarity: normaliseRrfScore(score),
        sources: [...new Set(sources)],
      }));

      if (!RERANK_ENABLED) return hits.slice(0, topK);

      // Re-label with the cross-encoder's own score. Keeping the fusion score here
      // would print numbers that contradict the order they are printed in, and the
      // MCP response shows that number to the model.
      const reordered = await rerank(query, hits, (hit) => hit.memory.content, scorer);
      return reordered
        .slice(0, topK)
        .map(({ item, score }) => ({ ...item, similarity: relevanceProbability(score) }));
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
        deleteFts.run(id);
        insertFts.run(id, content);
        deleteVec(id);
        insertVec(id, vector, existing.memory_type);
      })();

      return true;
    },

    async remove(id) {
      return db.transaction(() => {
        const result = db.run("DELETE FROM memories WHERE id = ?", [id]);
        deleteFts.run(id);
        deleteVec(id);
        return result.changes > 0;
      })();
    },

    close() {
      db.close();
    },
  };

  return store;
}
