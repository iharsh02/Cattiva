#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  addMemoryInput,
  deleteMemoryInput,
  retrieveMemoryInput,
  updateMemoryInput,
} from "./schema.ts";
import type { Memory } from "./memory.ts";
import { openStore, type MemoryStore, type SearchHit } from "./store.ts";

const text = (body: string) => ({ content: [{ type: "text" as const, text: body }] });
const failure = (body: string) => ({ ...text(body), isError: true });

let store: MemoryStore | undefined;
const getStore = (): MemoryStore => (store ??= openStore());

/**
 * Two significant figures, not two decimal places. Cross-encoder relevance spans
 * orders of magnitude and is small in absolute terms even for good matches, so
 * fixed decimals print `0.00` for every result and hide the ranking entirely.
 */
const formatScore = (n: number): string => (n >= 0.01 ? n.toFixed(2) : n.toPrecision(2));

/**
 * When the fact was last asserted, and when it was first stored if those differ.
 *
 * Memories contradict each other as things change — a database chosen in March and
 * replaced in June — and nothing in the content says which one is current. The dates
 * are stored either way; omitting them made the stale memory look exactly as current
 * as the true one. Ranking cannot settle this and should not try: the model reading
 * both is the thing that knows March precedes June.
 */
const formatDate = (memory: Memory): string => {
  const created = memory.createdAt.slice(0, 10);
  const updated = memory.updatedAt.slice(0, 10);
  return created === updated ? created : `${created}->${updated}`;
};

/** Each line carries the id, because update and delete are unreachable without it. */
const formatHits = (hits: SearchHit[]): string => {
  if (hits.length === 0) return "No memories matched.";
  const lines = hits.map(
    (h) =>
      `[${h.memory.id}] ${formatDate(h.memory)} (${formatScore(h.similarity)})${h.memory.memoryType === undefined ? "" : ` <${h.memory.memoryType}>`} ${h.memory.content}`,
  );
  return `${hits.length} ${hits.length === 1 ? "memory" : "memories"}:\n${lines.join("\n")}`;
};

function createServer(): McpServer {
  const server = new McpServer(
    { name: "memory-engine", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "add_memory",
    {
      title: "Add memory",
      description:
        "Store a single fact in long-term memory so it survives into later, separate conversations. Use this for durable information — preferences, decisions, project conventions, identities — not for details that only matter right now.",
      inputSchema: addMemoryInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ content, metadata, memory_type }) => {
      const id = await getStore().add(content, {
        ...(memory_type === undefined ? {} : { memoryType: memory_type }),
        ...(metadata === undefined ? {} : { metadata }),
      });
      return text(`Stored as ${id}`);
    },
  );

  server.registerTool(
    "retrieve_memory",
    {
      title: "Retrieve memory",
      description:
        "Search long-term memory and bring relevant entries into the conversation. Call this before answering anything that may depend on facts established earlier. Each result is `[memory_id] date (score) <type> content`; update_memory and delete_memory need the memory_id. Two results may contradict each other because the fact changed — prefer the later date, and a date shown as `first->latest` means that entry was revised.",
      inputSchema: retrieveMemoryInput,
      annotations: { readOnlyHint: true },
    },
    async ({ query, top_k, metadata_filter }) => {
      const hits = await getStore().search(query, top_k, metadata_filter);
      return text(formatHits(hits));
    },
  );

  server.registerTool(
    "update_memory",
    {
      title: "Update memory",
      description:
        "Replace the content of an existing memory. Use this when a stored fact has changed, rather than adding a second contradictory memory. Requires a memory_id from a previous retrieve_memory call.",
      inputSchema: updateMemoryInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ memory_id, content, metadata }) => {
      const updated = await getStore().update(memory_id, content, metadata);
      return updated
        ? text(`Updated ${memory_id}`)
        : failure(`No memory with id ${memory_id}. Call retrieve_memory to get valid ids.`);
    },
  );

  server.registerTool(
    "delete_memory",
    {
      title: "Delete memory",
      description:
        "Permanently remove a memory. Use this when a stored fact is wrong or obsolete. Requires a memory_id from a previous retrieve_memory call and explicit confirmation.",
      inputSchema: deleteMemoryInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ memory_id, confirmation }) => {
      // A false confirmation is a well-formed call we decline, distinct from a
      // malformed one — the model's correct next step differs between the two.
      if (!confirmation) {
        return failure(`Not deleted: confirmation was false. Set confirmation to true to delete.`);
      }
      const removed = await getStore().remove(memory_id);
      return removed
        ? text(`Deleted ${memory_id}`)
        : failure(`No memory with id ${memory_id}. Call retrieve_memory to get valid ids.`);
    },
  );

  return server;
}

serveStdio(createServer);
