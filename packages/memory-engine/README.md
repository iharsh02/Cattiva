# @cattiva/memory-engine

Long-term memory for AI agents, over MCP. Facts stored in one session are retrievable in
the next, in a different process, days later.

## Tools

| Tool              | Parameters                                        |
| ----------------- | ------------------------------------------------- |
| `add_memory`      | `content`, `metadata?`, `memory_type?`            |
| `retrieve_memory` | `query`, `top_k?` (default 3), `metadata_filter?` |
| `update_memory`   | `memory_id`, `content`, `metadata?`               |
| `delete_memory`   | `memory_id`, `confirmation`                       |

`memory_id` comes from `retrieve_memory` — it is the only way to reach update and delete.

## Install

Requires [Bun](https://bun.com).

```json
{
  "mcpServers": {
    "memory": {
      "command": "bunx",
      "args": ["-y", "@cattiva/memory-engine"]
    }
  }
}
```

Works in Claude Code, Codex, Cursor, or anything else that speaks MCP. Restart your agent
after adding it.

## Configuration

| Variable            | Default                |
| ------------------- | ---------------------- |
| `CATTIVA_MEMORY_DB` | `~/.cattiva/memory.db` |

The database and its parent directory are created on first use. There is nothing to
install or run — SQLite is a file, not a server.

## How it works

Text goes in `memories`; its embedding goes in `vec_memories`, a
[sqlite-vec](https://github.com/asg017/sqlite-vec) virtual table in the same file.
Retrieval embeds the query and runs a cosine k-NN, joining back to the text in one query.

Embeddings come from `Supabase/gte-small` (384 dimensions), running locally via
transformers.js — no API key, no network.

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
