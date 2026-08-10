# Retrieval eval

Measures one thing: **when you ask a question, does the right memory come back?**

It runs against [LoCoMo](https://github.com/snap-research/locomo) — 10 long multi-session
conversations, 5,882 turns, 1,986 questions whose evidence turns were labelled by hand.
Nothing here is written by us, which is the point (see [Why no hand-written
fixtures](#why-no-hand-written-fixtures)).

Read-only, and each conversation gets a throwaway `:memory:` store. Your real memories are
never touched.

## Running it

```bash
# one-time: fetch the dataset (2.8MB, gitignored)
mkdir -p packages/memory-engine/eval/data
curl -sSLo packages/memory-engine/eval/data/locomo10.json \
  https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json

bun run eval:memory-engine          # full run, ~4 min
bun run eval:memory-engine:save     # …and record it as this model's baseline

bun run packages/memory-engine/eval/locomo.ts --limit 2   # 2 conversations, ~1 min
```

Swap the embedding model with an env var:

```bash
env CATTIVA_EMBED_MODEL=Xenova/gte-base bun run eval:memory-engine
```

Baselines are **keyed by model id** — a score from a different embedder is not a comparable
number. The runner prints a delta against the saved entry for whichever model is active.
The run is deterministic, so an unchanged model reproduces its baseline exactly and any
delta is a real change.

## The files

| File | What it is |
|---|---|
| `locomo.ts` | The runner: seeds a store per conversation, queries, reports |
| `score.ts` | Metrics. Pure functions, no I/O, no store |
| `baseline.json` | Saved scores per model |
| `data/` | Downloaded dataset. Gitignored |

One store **per conversation**. Questions are scoped to their own conversation, so pooling
them would invent distractors the evidence labels never accounted for.

## The metrics

| Metric | Meaning |
|---|---|
| `hit@1` | An expected memory came back first |
| `hit@3` | An expected memory was in the top 3 |
| `recall@3` | *Fraction* of expected memories in the top 3 — this is what measures multi-hop |
| `hit@10` / `recall@10` | Same over the full search window: the ceiling ranking could reach |
| `MRR` | 1 / rank of the first expected memory. Rewards 2nd over 5th |
| `mean margin` | Gap between #1 and #2, over questions that got #1 right |

**`mean margin` covers passes only.** The gap between #1 and #2 on a question you already
got wrong is a gap between two wrong answers. Restricted to passes it answers something
useful: *how safely* did you pass? A near-zero margin is a coin flip that happened to land
right, and it will flip on the next change.

Search always runs at `top_k=10` regardless of the product default, so MRR and the @10
metrics have a full window to work with.

## Results

`Xenova/bge-small-en-v1.5` (the default), 1,977 questions scored, 9 skipped for
unresolvable evidence:

| category | n | hit@1 | hit@3 | rec@3 | hit@10 | rec@10 | MRR |
|---|---|---|---|---|---|---|---|
| **overall** | **1977** | **0.282** | **0.452** | **0.407** | **0.637** | **0.582** | **0.389** |
| `single-hop` | 841 | 0.317 | 0.493 | 0.480 | 0.679 | 0.665 | 0.427 |
| `adversarial` | 446 | 0.164 | 0.318 | 0.312 | 0.516 | 0.509 | 0.263 |
| `temporal` | 320 | 0.444 | 0.597 | 0.571 | 0.722 | 0.699 | 0.535 |
| `multi-hop` | 281 | 0.214 | 0.427 | 0.212 | 0.648 | 0.384 | 0.349 |
| `open-domain` | 89 | 0.169 | 0.281 | 0.210 | 0.517 | 0.364 | 0.255 |

`temporal` scores best because dates and event names are lexically distinctive.
`adversarial` — questions with a false premise — scores worst, which is the case where
confident retrieval does the most harm.

## What the eval found

### The bottleneck is ranking, not search

`hit@1` 0.282, `hit@10` 0.637. That splits every question into three near-equal buckets:

| | share | what happened |
|---|---|---|
| correct | 28% | right memory came back first |
| **mis-ranked** | **36%** | right memory *was found*, but sat at position 2–10 |
| not found | 36% | not in the top 10 at all |

More than half of what goes wrong is ordering. The store already has the answer and hands
back something else first.

### `top_k` was the free win

The paper's `top_k=3` default was chosen for an agent with an 8,192-token context. Measured
here it costs a lot, and raising it to 10 helps **every** category:

| category | rec@3 | rec@10 |
|---|---|---|
| overall | 0.407 | **0.582** |
| `single-hop` | 0.480 | 0.665 |
| `multi-hop` | 0.212 | **0.384** |
| `adversarial` | 0.312 | 0.509 |

`multi-hop` nearly doubles — a question needing three evidence turns cannot be satisfied by
three results unless the ranking is perfect. The default is now 10: ~600 extra tokens on a
200k-token host, and the model re-ranks what it reads anyway.

### A shipped crash

`add_memory` **without** `memory_type` threw `SQLiteError: Expected text for TEXT metadata
column memory_type, received NULL`. vec0 metadata columns reject NULL and `memory_type` is
optional in the tool schema, so the most common call an agent makes was broken in `0.1.0`.

LoCoMo turns have no type, so it failed on the first insert. Untyped memories are now
indexed under `""`; the `memories` table keeps the real NULL and `get()` still reports
`memoryType` as undefined.

### The query prefix matters more than it looks

BGE-family models are trained asymmetrically — the query takes an instruction prefix, the
stored text does not. That is why `embed()` and `embedQuery()` are separate methods on the
`Embedder` interface. Dropping the prefix costs recall and, more importantly, badly hurts
the separation between real hits and noise.

### Things a better embedder will not fix

- **Supersession.** Nothing in the pipeline knows a June memory beats a March one on the
  same subject. That is a recency signal at ranking time.
- **Entity names.** Embeddings cannot match a term the model has never seen. That is what
  lexical search (FTS5) is for, and it is the obvious attack on the 36% not-found bucket.

## Why no hand-written fixtures

There used to be a hand-written set here: 40 memories and 27 questions about an invented
developer. **It was deleted because it gave the wrong answer.**

Tested against it, `Qwen3-Embedding-0.6B` looked like a clear upgrade over `bge-small`:

| | hand-written (23 q) | LoCoMo (1,977 q) |
|---|---|---|
| `hit@1` | **+0.087** | −0.039 |
| `hit@3` | **+0.130** | −0.063 |
| `recall@3` | **+0.109** | −0.057 |
| `MRR` | **+0.083** | −0.054 |

A 0.19 swing, in the opposite direction. At 1,977 questions that gap is roughly 125
questions — not noise.

The small set wasn't merely imprecise, it was **biased**. Forty declarative sentences in one
voice, with questions phrased by the same person, is a *style* — and the model that suited
that style won. Real dialogue written by people with no stake in the outcome said the
opposite.

We came close to shipping a 614MB default on the strength of 23 questions we wrote
ourselves. If you add fixtures back, they belong beside a public dataset, never in place of
one.

## Adding a model

Add an entry to `MODELS` in [`../src/embedder.ts`](../src/embedder.ts) with its vector
width, plus a query prefix if the model is trained asymmetrically. Then run with
`CATTIVA_EMBED_MODEL` set and `--save` to record a baseline.

**Encoder models only.** Decoder-only embedders (Qwen3-Embedding and similar) need
last-token pooling rather than the mean, and the AI SDK provider only offers
`mean | cls | max` — routing one through it yields plausible-looking wrong vectors with no
error. Two traps found the hard way while testing one:

- **Pooling.** Mean-pooling a decoder-only model is silently wrong. Sanity-check the
  geometry first: unrelated sentences should score far apart. `gte-small` put two entirely
  unrelated sentences at **0.7549** — a similarity floor that high leaves no usable range.
- **Padding.** For at least one ONNX export, batching identical-length texts reproduced the
  unbatched vector exactly (cos `1.000000`), but *any* padding dropped it to ~0.93 on either
  side. Pad tokens leaked into the output. Always verify batched output against unbatched
  before trusting a throughput optimisation.

## Known limitations

- **LoCoMo indexes raw dialogue turns**, not the distilled facts `add_memory` normally
  receives — `"Hey Mel! Good to see you!"` becomes a memory. It measures the retrieval layer
  honestly but is harder than the real workload, so treat 0.582 as a floor.
- **It is conversation memory**, a different shape from the developer preferences and
  project decisions Cattiva actually stores.
- **Only the default model has a baseline.** Others were compared on the deleted fixture set
  and those numbers are not trustworthy; they need re-running here.
- **Every run re-embeds all 5,882 turns.** An embedding cache keyed by `(model, text hash)`
  would make repeat runs near-instant.
