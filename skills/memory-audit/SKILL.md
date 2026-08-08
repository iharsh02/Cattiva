---
name: memory-audit
description: Audit the Cattiva memory store for quality problems — entries that are not self-contained, bundled facts, near-duplicates, contradictions — and fix them on approval.
disable-model-invocation: true
---

Find quality problems in the memory store. Propose fixes. Apply only what the user approves.

## 1. Read the store

Resolve the path, first match wins: `$CATTIVA_MEMORY_DB`, `.memory/memory.db`, `~/.cattiva/memory.db`.

```bash
sqlite3 -readonly "$DB" -json "SELECT id, memory_type, metadata, created_at, updated_at, content FROM memories ORDER BY created_at;"
```

If the store is empty, say so and stop.

## 2. Classify

Read every memory. Report only problems actually present.

**Not self-contained** — the check that matters most. A memory is retrieved into a future
conversation where the original context is gone, so an unresolved reference makes it
useless. Flag pronouns and demonstratives with no antecedent: "he prefers X", "this uses
Y", "the deadline moved to June".

**Bundled facts** — more than one fact in one entry. Its embedding is an average of
several meanings, so it matches many queries weakly and none strongly.

**Near-duplicates** — two entries asserting the same thing.

**Contradictions** — two entries that disagree. One is stale.

**Inconsistent `memory_type`** — one-off values. Types are only useful for filtering when
they repeat.

**Trivial** — entries carrying no durable information.

## 3. Propose

A numbered list. For each: the id, the problem, and the concrete fix — the rewritten
content for an update, or which of a duplicate pair to keep and why.

Group by action: **update**, **delete**, **merge** (update one, delete the other).

State the count of clean entries too, so the user knows what was checked.

## 4. Apply

Wait for the user to name which items to apply. Then use the MCP tools:

- `update_memory` with `memory_id` and the rewritten content
- `delete_memory` with `memory_id` and `confirmation: true`

**Never write to the database with SQL.** The tools re-embed changed content and keep the
vector index in sync. A direct `UPDATE` leaves the stored vector matching the old text, so
retrieval keeps matching the old meaning — silently, with no error.

Report what changed.
