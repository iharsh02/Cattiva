#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4bce35749bb8c752fb2950985b5891d28338369a0110192a5f3add541216000b/contract';
import startContract from '../../snapshots/4bce35749bb8c752fb2950985b5891d28338369a0110192a5f3add541216000b/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c4d595066dd54a9704091b999f6205c7c6e9982b617cee0b63b03433d2581df1/contract';
import endContract from '../../snapshots/c4d595066dd54a9704091b999f6205c7c6e9982b617cee0b63b03433d2581df1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';

/**
 * Built against the end snapshot rather than the app's live contract: this migration must keep
 * planning the same statements after later contract edits move `src/prisma/contract.json` on.
 *
 * Only query plans are built here — this never opens a connection, and the runner executes the
 * plans over its own. The URL is a placeholder for that reason: the factory demands a non-empty
 * one, and reading the real one would imply a connection that is never made, leaving self-emit
 * to fail wherever the environment is not loaded.
 */
const db = postgres<End>({
  contractJson: endContract,
  url: 'postgresql://plan-only',
});

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'message',
        constraint: 'message_reasoning_check_448ac843',
      }),
      this.addColumn({
        schema: 'public',
        table: 'message',
        column: col('effort', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'message',
        constraint: 'message_effort_check_071ddbf9',
        expression: "\"effort\" IN ('low', 'medium', 'high', 'xhigh', 'max')",
      }),

      // `reasoning` used to carry the effort as well, so every row still holding one of the old
      // levels becomes reasoning=on plus that level as its effort. This has to land before the
      // new check below, which those rows would otherwise violate.
      //
      // Raw rather than the query builder: this moves one column's value into another, which the
      // builder's update takes no shape for, and the builder's table lane additionally wants the
      // `public` namespace materialised as a schema, which this contract does not declare.
      this.dataTransform(endContract, 'split legacy reasoning into reasoning + effort', {
        // A row here means a legacy value is still unsplit. The runner reads it as EXISTS before
        // and NOT EXISTS after, so it has to be a rowset — never a count.
        check: () =>
          db.raw.sql`SELECT "id" FROM "public"."message" WHERE "reasoning" IN ('low', 'medium', 'high') LIMIT 1`.returnsRow(
            { id: 'pg/text@1' },
          ),
        run: () =>
          db.raw.sql`UPDATE "public"."message" SET "effort" = "reasoning", "reasoning" = 'on' WHERE "reasoning" IN ('low', 'medium', 'high')`.affectedCount(),
      }),

      this.addCheckConstraint({
        schema: 'public',
        table: 'message',
        constraint: 'message_reasoning_check_350861bd',
        expression: "\"reasoning\" IN ('on', 'off')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
