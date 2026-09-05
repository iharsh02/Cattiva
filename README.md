# Cattiva

A terminal agent shell

| Part                       | Package            | What it is                                                                     |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| [`apps/cli`](apps/cli)     | `@cattiva/cli`     | A terminal chat UI with persistent, resumable sessions. Early, in development  |
| [`mcp/memory`](mcp/memory) | `@cattiva/ltm-mcp` | Long-term memory over [MCP](https://modelcontextprotocol.io). Published to npm |

The two are independent — the CLI does not use the memory server, and the memory server needs
nothing from this repo. The memory half is the more finished one: installable in one line, no
database, no API key, and its retrieval quality is [measured](#retrieval-quality) rather than
asserted. If that is what you came for, skip to [Long-term memory](#long-term-memory).

---

## The CLI

A single-window terminal chat: you type, the reply streams in below it, and the conversation
stays in the same view. Sessions are written to Postgres, so you can close the CLI and pick a
conversation back up later.

**What works today:** streaming replies, session persistence and resume, the model's thinking
shown as it happens and kept with the transcript, switching model, reasoning and effort
mid-session, 32 themes.

**What does not, yet:** the model has no tools — it cannot read or edit files, run commands,
or take any action. This is a chat shell with good session handling, not yet a coding agent.
Tool-call events already stream from the server but nothing renders them, and the `BUILD`/`PLAN`
mode in the schema is unused.

### Setup

Requires [Bun](https://bun.com), Docker (for Postgres), and an API key for whichever provider
you use. Gemini has a [free tier](https://aistudio.google.com/apikey).

```bash
bun install
cp .env.example .env          # then fill in an API key
docker run --name cattiva-postgres -e POSTGRES_PASSWORD=mysecretpassword \
  -p 5432:5432 -d postgres
bun db:init                   # create the schema from the contract
```

Then run the server and the CLI in two terminals:

```bash
bun run server:dev            # session + chat API on :3000
bun run cli:start             # the terminal UI
```

### Commands

Type `/` in the prompt to open the menu. Every command in it works — one that does nothing
yet is a broken feature, not a missing one, so it is not listed.

| Command      | What it does                                 |
| ------------ | -------------------------------------------- |
| `/new`       | Clear the conversation and start fresh       |
| `/session`   | Switch to a saved session, loaded in place   |
| `/model`     | Choose the model this session runs against   |
| `/reasoning` | Turn the model's internal thinking on or off |
| `/effort`    | Set how hard the model works the turn        |
| `/theme`     | Switch the colour theme                      |
| `/exit`      | Quit                                         |

`ctrl+r` opens up the thinking behind every reply in the transcript, and closes it again.
While a reply is still being thought about, the thinking shows itself.

### Models

| Model               | Provider  | Key                            |
| ------------------- | --------- | ------------------------------ |
| `gemini-2.5-flash`  | Google    | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `claude-sonnet-4-6` | Anthropic | `ANTHROPIC_API_KEY`            |
| `claude-opus-4-6`   | Anthropic | `ANTHROPIC_API_KEY`            |
| `claude-opus-5`     | Anthropic | `ANTHROPIC_API_KEY`            |

Two separate settings, because the providers treat them separately:

- **Reasoning** (`on` / `off`) is whether the model thinks internally before it answers.
  Turning it off removes the several seconds a thinking model spends before its first word.
- **Effort** (`low`, `medium`, `high`, `xhigh`, `max`) is how hard it works the turn —
  thoroughness, how much it says, and, once there are tools, how many calls it makes.

Each model declares which of these it actually offers, and only those appear — a setting the
provider does not have is not invented for it. `xhigh` arrived with Opus 4.7, so the 4.6-era
models do not list it; Google has no effort parameter of any kind, so on Gemini there is no
effort control at all and `/effort` says so. Where both exist they are resolved together, since
Opus 5 refuses to answer without thinking above `high` effort.

Replies are re-cut into words before they leave the server. Providers hand back whole
sentences at a time — Gemini answers a short question in about five chunks — which arrives as
visible slabs rather than streaming text.

---

## Long-term memory

Facts stored in one session are retrievable in the next, in a different process, days later.

### Install

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
memory downloads a ~34MB embedding model and the first search a ~23MB reranker, then it works
offline. Nothing you store leaves the machine.

By default memories live in `~/.cattiva/memory.db`. Set `CATTIVA_MEMORY_DB` to keep them
per-project instead. Four tools — `add_memory`, `retrieve_memory`, `update_memory`,
`delete_memory` — are documented in the [server README](mcp/memory/README.md), along with
every configuration variable and how retrieval works.

### Retrieval quality

Retrieval is measured, not asserted. The [eval](mcp/memory/eval) runs against
[LoCoMo](https://github.com/snap-research/locomo) — 10 multi-session conversations, 5,882
turns, 1,977 questions with hand-labelled evidence:

| stage                      | hit@1     | hit@3 | recall@3 | hit@10 | recall@10 | MRR   |
| -------------------------- | --------- | ----- | -------- | ------ | --------- | ----- |
| dense vectors only         | 0.282     | 0.452 | 0.407    | 0.637  | 0.582     | 0.389 |
| \+ hybrid lexical search   | 0.337     | 0.536 | 0.484    | 0.713  | 0.655     | 0.455 |
| \+ cross-encoder reranking | **0.496** | 0.662 | 0.604    | 0.772  | **0.718** | 0.590 |

**The right memory comes back first 50% of the time, up from 28%.** Three decisions came out
of the measurements:

- **Hybrid retrieval.** Dense vectors cannot match a name the model has never seen, so SQLite
  FTS5 runs alongside them and the two rankings are fused.
- **Reranking is on by default.** A ~23MB cross-encoder re-reads the top 30 candidates and
  reorders them, worth +0.16 `hit@1` for roughly 200ms per retrieval. `CATTIVA_RERANK=0`
  turns it off.
- **`retrieve_memory` returns `top_k=10`**, not the 3 the paper uses — hosts here have the
  context to spare, and it is worth 11 points of recall.

Measured and _not_ taken: widening the candidate pool. Fetching 4x more candidates moved the
top answer for one question in 1,977, which is how we know the cross-encoder's judgement —
not the size of the search — is what limits this now.

Run it yourself with `bun run memory:eval`. See the [eval README](mcp/memory/eval/README.md)
for the method, the per-category breakdown, and what the numbers do not cover.

### Skills

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

---

## Repository layout

```
apps/cli          @cattiva/cli        terminal UI (opentui + React)
packages/server   @cattiva/server     session + chat API (Hono, SSE)
packages/database @cattiva/database   Prisma 8 ORM over Postgres
packages/shared   @cattiva/shared     model registry and wire schemas
mcp/memory        @cattiva/ltm-mcp    the memory server, published
skills/                               optional agent skills
```

`mcp/` holds MCP servers, one publishable package each. `packages/` holds libraries the CLI
and servers draw on. Each has its own README.

## Development

```bash
bun install
bun run typecheck    # root: packages + mcp. apps/ is checked separately
bun run lint
bun run format
```

`typecheck` at the root deliberately skips `apps/` — the CLI needs its own JSX and path
aliases, so it is checked through its own config:

```bash
cd apps/cli && bun run typecheck
```

Other useful scripts:

```bash
bun run server:dev   # session API with hot reload
bun run cli:dev      # CLI with hot reload
bun run memory:dev   # memory server directly on stdio
bun run memory:eval  # run the LoCoMo eval
bun db:verify        # check the live schema matches the contract
```

[`.mcp.json`](.mcp.json) is checked in and points at the **local source**, so opening this
repo in Claude Code connects the memory server you're editing rather than the published
package.

## License

[GPL-3.0-or-later](LICENSE). Copyright © 2026 iharsh02.

Cattiva is free software: you may use, study, share and modify it. If you distribute a
modified version, or software that incorporates it, that work must also be GPL-3.0-or-later
and its source made available.
