---
name: memory-review
description: Show everything currently in the Cattiva memory store, grouped by type. Read-only.
disable-model-invocation: true
allowed-tools: Bash
---

Show the contents of the memory store. Do not modify anything.

## 1. Locate the store

First match wins:

- `$CATTIVA_MEMORY_DB`
- `.memory/memory.db` in the current repo
- `~/.cattiva/memory.db`

If none exist, say the store has not been created yet and stop.

## 2. Read it

```bash
sqlite3 -readonly "$DB" "SELECT memory_type, count(*) FROM memories GROUP BY memory_type ORDER BY 2 DESC;"
sqlite3 -readonly "$DB" "SELECT id, memory_type, created_at, updated_at, content FROM memories ORDER BY memory_type, created_at;"
```

## 3. Report

- Total count, and the breakdown by `memory_type`
- Each memory under its type heading: content first, then its id
- Mark any row where `updated_at` differs from `created_at` as edited

Keep it scannable. Do not propose fixes — that is `/memory-audit`.
