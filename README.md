# Cattiva

A suite of toolkits for AI agents, exposed over [MCP](https://modelcontextprotocol.io).

Each server lives under `mcp/`, usable from Claude Code, Codex, Cursor, or anything else
that speaks MCP.

## Servers

| Server                     | Package            | What it does                                                                            |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| [`mcp/memory`](mcp/memory) | `@cattiva/ltm-mcp` | Long-term memory: store, retrieve, update and delete facts that survive across sessions |

## Install

Requires [Bun](https://bun.com). Add to your MCP config — `.mcp.json` for Claude Code,
`~/.codex/config.toml` for Codex, or the equivalent for your host:

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

Restart your agent. Nothing else to install — no database to run, no API key. The first
memory downloads a ~34MB embedding model and the first search a ~23MB reranker, then it
works offline. Nothing you store leaves the machine.

By default memories live in `~/.cattiva/memory.db`. Set `CATTIVA_MEMORY_DB` to keep them
per-project instead.

## Retrieval quality

Retrieval is measured, not asserted. The [eval](mcp/memory/eval) runs against
[LoCoMo](https://github.com/snap-research/locomo) — 10 multi-session conversations, 5,882
turns, 1,977 questions with hand-labelled evidence:

| stage                      | hit@1     | hit@3 | recall@3 | hit@10 | recall@10 | MRR   |
| -------------------------- | --------- | ----- | -------- | ------ | --------- | ----- |
| dense vectors only         | 0.282     | 0.452 | 0.407    | 0.637  | 0.582     | 0.389 |
| \+ hybrid lexical search   | 0.337     | 0.536 | 0.484    | 0.713  | 0.655     | 0.455 |
| \+ cross-encoder reranking | **0.496** | 0.662 | 0.604    | 0.772  | **0.718** | 0.590 |

**The right memory comes back first 50% of the time, up from 28%.** Three decisions came
out of the measurements:

- **Hybrid retrieval.** Dense vectors cannot match a name the model has never seen, so
  SQLite FTS5 runs alongside them and the two rankings are fused.
- **Reranking is on by default.** A ~23MB cross-encoder re-reads the top 30 candidates and
  reorders them, worth +0.16 `hit@1` for roughly 200ms per retrieval. `CATTIVA_RERANK=0`
  turns it off.
- **`retrieve_memory` returns `top_k=10`**, not the 3 the paper uses — hosts here have the
  context to spare, and it is worth 11 points of recall.

Measured and _not_ taken: widening the candidate pool. Fetching 4x more candidates moved
the top answer for one question in 1,977, which is how we know the cross-encoder's
judgement — not the size of the search — is what limits this now.

Run it yourself with `bun run memory:eval`. See the
[eval README](mcp/memory/eval/README.md) for the method, the per-category
breakdown, and what the numbers do not cover.

## Skills

Optional [skills](skills) for maintaining your memories.

| Skill                                   | What it does                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`memory-review`](skills/memory-review) | `/memory-review` — list everything stored, grouped by type. Read-only                                  |
| [`memory-audit`](skills/memory-audit)   | `/memory-audit` — find duplicates, entries that aren't self-contained, contradictions; fix on approval |

Install with [`skills`](https://github.com/vercel-labs/skills), which works across Claude
Code, Codex, and other agents:

```bash
bunx skills add -g iharsh02/cattiva          # both, in every project
```

Drop `-g` to install into the current project only, `-s memory-audit` to pick one, or
`-a claude-code` to target a specific agent. `bunx skills list` shows what's installed, and
`-l` lists what's available without installing.

Or copy a `SKILL.md` into `~/.claude/skills/` by hand — they're plain markdown with no
dependencies.

**Install the MCP server first.** The skills call `update_memory` and `delete_memory`; on
their own they have nothing to talk to.

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run format
bun run memory:dev   # run the memory server directly on stdio
```

[`.mcp.json`](.mcp.json) is checked in and points at the **local source**, so opening this
repo in Claude Code connects the server you're editing rather than the published package.

Repository layout: `mcp/` holds the MCP servers, one publishable package each; `apps/` holds
the CLI; `packages/` is for shared libraries the servers and apps draw on.

## License

[GPL-3.0-or-later](LICENSE). Copyright © 2026 iharsh02.

Cattiva is free software: you may use, study, share and modify it. If you distribute a
modified version, or software that incorporates it, that work must also be GPL-3.0-or-later
and its source made available.
