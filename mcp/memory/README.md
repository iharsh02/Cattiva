# @cattiva/ltm-mcp

Long-term memory for AI agents, over MCP. Facts stored in one session are retrievable in
the next, in a different process, days later.

## Tools

| Tool              | Parameters                                         |
| ----------------- | -------------------------------------------------- |
| `add_memory`      | `content`, `metadata?`, `memory_type?`             |
| `retrieve_memory` | `query`, `top_k?` (default 10), `metadata_filter?` |
| `update_memory`   | `memory_id`, `content`, `metadata?`                |
| `delete_memory`   | `memory_id`, `confirmation`                        |

`memory_id` comes from `retrieve_memory` — it is the only way to reach update and delete.

Each result comes back as one line:

```
[mem_abc123] 2026-03-04->2026-06-11 (0.83) <project_fact> The API gateway runs on Fly.io.
```

The date is when the fact was last asserted, and `first->latest` marks an entry that was
revised. Memories contradict each other as things change, and nothing in the content says
which one is current — ranking cannot settle that, so the dates are shown and the model
reading both decides.

## Install

Requires [Bun](https://bun.com).

```json
{
  "mcpServers": {
    "memory": {
      "command": "bunx",
      "args": ["-y", "@cattiva/ltm-mcp"]
    }
  }
}
```

Works in Claude Code, Codex, Cursor, or anything else that speaks MCP. Restart your agent
after adding it.

First retrieval downloads the two models (~57MB total) and caches them. Everything after
that is local.

## Configuration

| Variable                 | Default                         |
| ------------------------ | ------------------------------- |
| `CATTIVA_MEMORY_DB`      | `~/.cattiva/memory.db`          |
| `CATTIVA_EMBED_MODEL`    | `Xenova/bge-small-en-v1.5`      |
| `CATTIVA_RERANK`         | on — `0` disables the reranker  |
| `CATTIVA_RERANK_MODEL`   | `Xenova/ms-marco-MiniLM-L-6-v2` |
| `CATTIVA_RERANK_DEPTH`   | `30`                            |
| `CATTIVA_CANDIDATE_POOL` | `50`                            |

The database and its parent directory are created on first use. There is nothing to
install or run — SQLite is a file, not a server.

Changing `CATTIVA_EMBED_MODEL` is safe: the store notices the model changed and rebuilds
its vector index from the stored text on the next open.

## How it works

Text goes in `memories`. Its embedding goes in `vec_memories`, a
[sqlite-vec](https://github.com/asg017/sqlite-vec) virtual table, and its tokens go in an
FTS5 index — all three in the same file.

Retrieval runs both retrievers and reranks what they agree on:

1. **Dense** — embed the query, cosine k-NN over `vec_memories`.
2. **Lexical** — BM25 over the FTS5 index. Catches the exact names and identifiers that
   embeddings blur together.
3. **Fuse** — reciprocal rank fusion (k=60). A cosine distance and a BM25 score are not
   comparable numbers, but their ranks are, so fusion uses ranks and weights both
   retrievers equally.
4. **Rerank** — a cross-encoder reads the query and each candidate _together_ and scores
   the pair. A bi-encoder never sees both at once; this does, which is why it reorders
   much better than fusion alone.

Fusion goes deeper than `top_k` (to `CATTIVA_RERANK_DEPTH`) so the cross-encoder can
promote a memory that fusion buried, rather than merely reshuffling the final ten.

The reported score is the cross-encoder's relevance probability, or a normalised fusion
score when reranking is off. It is always consistent with the order shown, but its meaning
differs between those two modes — do not compare scores across configurations.

Embeddings come from `Xenova/bge-small-en-v1.5` (384 dimensions, 34MB) and reranking from
`Xenova/ms-marco-MiniLM-L-6-v2` (q8, ~23MB), both running locally via transformers.js — no
API key, no network after the first download.

Reranking costs a forward pass per candidate, roughly 200ms per retrieval on a CPU, and is
worth +0.16 `hit@1` on LoCoMo (0.337 -> 0.496) — the single largest measured improvement in
the engine. `CATTIVA_RERANK=0` buys the latency back at the cost of a third of the correct
first answers.

Both defaults and every constant above were chosen by measurement, not taste. The method,
the numbers, and the things that did _not_ work are in
[eval/README.md](https://github.com/iharsh02/cattiva/blob/main/mcp/memory/eval/README.md).

The vector index is **derived data**: it can be dropped and rebuilt from `memories` at any
time. Changing the embedding model is therefore a one-line change plus a rebuild, which
happens automatically when the store notices the model has changed.

## Inspecting the store

```bash
sqlite3 ~/.cattiva/memory.db "SELECT id, memory_type, content FROM memories;"
```

Worth doing regularly — reading what the agent _chose_ to store is the fastest way to tell
whether the tool descriptions are working.

## License

[GPL-3.0-or-later](LICENSE). Copyright © 2026 iharsh02.
