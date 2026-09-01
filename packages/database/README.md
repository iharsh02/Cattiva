# @cattiva/database

Prisma 8 ORM client for Cattiva, backed by Postgres.

```ts
import { connectDatabase, db } from "@cattiva/database";
```

## Local Postgres

`DATABASE_URL` is read from the `.env` at the repo root — see `.env.example` for the
Docker one-liner that brings up a local instance.

## Workflow

The contract (`src/prisma/contract.prisma`) is the source of truth. After editing it,
re-emit the generated artifacts, then bring the database in line:

```bash
bun db:contract:emit   # regenerate contract.json + contract.d.ts
bun db:update          # push the contract to the database
bun db:verify          # check the live schema matches
```

`contract.json` and `contract.d.ts` are generated — never edit them by hand.

For versioned changes, use migrations instead of `db:update`:

```bash
bun db:migration:plan
bun db:migrate
bun db:migration:status
```

All of these are also available unprefixed from inside this package.
