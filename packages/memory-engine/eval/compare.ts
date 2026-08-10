#!/usr/bin/env bun
/**
 * Run the eval across several models and print one comparison table.
 *
 *   bun run eval:compare                      every model in the registry
 *   bun run eval:compare -- --limit 2         quick pass, 2 conversations each
 *   bun run eval:compare -- --models Xenova/gte-base,Supabase/gte-small
 *   bun run eval:compare -- --report          print saved baselines, run nothing
 *   bun run eval:compare -- --sort hit1       rank by a different metric
 *
 * One subprocess per model, because `embedder` resolves CATTIVA_EMBED_MODEL once at
 * import time — a single process can only ever hold one model. Subprocesses also keep
 * memory isolated and make each run exactly what a user of that model would get.
 *
 * Each child writes its own entry to baseline.json, so a run interrupted halfway still
 * leaves every completed model recorded.
 */
import { join } from "node:path";
import { MODEL_IDS } from "../src/config.ts";
import type { Summary } from "./score.ts";

const LOCOMO = join(import.meta.dir, "locomo.ts");
const BASELINE = join(import.meta.dir, "baseline.json");

type Baselines = Record<string, { overall: Summary; byClass: Record<string, Summary> }>;

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

const models = (flag("--models") ?? "").split(",").filter(Boolean);
const targets = models.length > 0 ? models : MODEL_IDS;
const limit = flag("--limit");
const sortKey = (flag("--sort") ?? "recall10") as keyof Summary;
const reportOnly = process.argv.includes("--report");

const unknown = targets.filter((m) => !MODEL_IDS.includes(m));
if (unknown.length > 0) {
  console.error(`Unknown model(s): ${unknown.join(", ")}`);
  console.error(`Known: ${MODEL_IDS.join(", ")}`);
  process.exit(1);
}

const failures: string[] = [];

if (!reportOnly) {
  console.log(
    `\nComparing ${targets.length} model(s)${limit === undefined ? "" : `, ${limit} conversation(s) each`}\n`,
  );

  for (const [i, id] of targets.entries()) {
    const started = performance.now();
    console.log(`[${i + 1}/${targets.length}] ${id}`);

    // A --limit pass is a smoke test, not a measurement. Saving it would overwrite a
    // full baseline with a partial one and silently corrupt every later comparison.
    const proc = Bun.spawn(
      ["bun", "run", LOCOMO, ...(limit === undefined ? ["--save"] : ["--limit", limit])],
      {
        env: { ...process.env, CATTIVA_EMBED_MODEL: id },
        // Child progress goes to stderr; its report to stdout, which we discard —
        // the comparison table below is built from baseline.json instead.
        stdout: "pipe",
        stderr: "inherit",
      },
    );

    const code = await proc.exited;
    const mins = ((performance.now() - started) / 60000).toFixed(1);

    if (code === 0) {
      console.log(`      done in ${mins} min\n`);
    } else {
      failures.push(id);
      console.log(`      FAILED (exit ${code}) after ${mins} min — skipping\n`);
    }
  }
}

// ----------------------------------------------------------------- report

if (!(await Bun.file(BASELINE).exists())) {
  console.error(`No baselines at ${BASELINE}. Run without --report first.`);
  process.exit(1);
}

const saved: Baselines = await Bun.file(BASELINE).json();
const rows = Object.entries(saved)
  .map(([id, v]) => ({ id, ...v.overall }))
  .toSorted((a, b) => (b[sortKey] as number) - (a[sortKey] as number));

if (rows.length === 0) {
  console.error("No models have baselines yet.");
  process.exit(1);
}

const width = Math.max(...rows.map((r) => r.id.length));
const n3 = (x: number | undefined) =>
  typeof x === "number" && Number.isFinite(x) ? x.toFixed(3) : "  —  ";

console.log(`\n── model comparison ── (${rows[0]!.n} questions, sorted by ${String(sortKey)})\n`);
console.log(`  ${"model".padEnd(width)}  hit@1  hit@3  rec@3  hit@10  rec@10    MRR  margin`);
for (const r of rows) {
  const best = r === rows[0] ? " *" : "  ";
  console.log(
    `${best}${r.id.padEnd(width)}  ${n3(r.hit1)}  ${n3(r.hit3)}  ${n3(r.recall3)}   ${n3(r.hit10)}   ${n3(r.recall10)}  ${n3(r.mrr)}   ${n3(r.meanMargin)}`,
  );
}

// A model whose baseline predates a metric shows "—" rather than a wrong number.
const stale = rows.filter((r) => r.hit10 === undefined);
if (stale.length > 0) {
  console.log(
    `\n  ${stale.length} baseline(s) predate the @10 metrics — re-run those models to fill them in.`,
  );
}
if (failures.length > 0) {
  console.log(`\n  failed: ${failures.join(", ")}`);
}

// Comparing across question counts is meaningless, so say so rather than hide it.
const counts = new Set(rows.map((r) => r.n));
if (counts.size > 1) {
  console.log(
    `\n  WARNING: baselines cover different question counts (${[...counts].join(", ")}) — ` +
      `probably a mix of --limit and full runs. Re-run them the same way before comparing.`,
  );
}
console.log();
