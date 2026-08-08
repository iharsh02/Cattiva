# Cattiva

A suite of toolkits for AI agents, exposed over [MCP](https://modelcontextprotocol.io).

Each toolkit is a package under `packages/`, usable from Claude Code, Codex, Cursor, or
anything else that speaks MCP.

## Toolkits

| Package                                            | What it does                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`@cattiva/memory-engine`](packages/memory-engine) | Long-term memory: store, retrieve, update and delete facts that survive across sessions |

## Install

Requires [Bun](https://bun.com). Add to your MCP config — `.mcp.json` for Claude Code,
`~/.codex/config.toml` for Codex, or the equivalent for your host:

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

Restart your agent. Nothing else to install — no database to run, no API key. The first
memory downloads a ~25MB embedding model, then works offline.

By default memories live in `~/.cattiva/memory.db`. Set `CATTIVA_MEMORY_DB` to keep them
per-project instead.

## Skills

Optional [skills](.claude/skills) for maintaining your memories.

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
bun run dev:memory-engine   # run the memory engine directly on stdio
```

[`.mcp.json`](.mcp.json) is checked in and points at the **local source**, so opening this
repo in Claude Code connects the toolkit you're editing rather than the published package.

## License

[GPL-3.0-or-later](LICENSE). Copyright © 2026 iharsh02.

Cattiva is free software: you may use, study, share and modify it. If you distribute a
modified version, or software that incorporates it, that work must also be GPL-3.0-or-later
and its source made available.
