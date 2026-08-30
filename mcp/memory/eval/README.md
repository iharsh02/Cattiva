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
mkdir -p mcp/memory/eval/data
curl -sSLo mcp/memory/eval/data/locomo10.json \
  https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json

bun run memory:eval          # ~10 sec warm, ~8 min cold
bun run memory:eval:save     # …and record it as this model's baseline

bun run mcp/memory/eval/locomo.ts --limit 2    # 2 conversations
bun run mcp/memory/eval/locomo.ts --no-cache   # ignore both caches
```

Every question goes through **`store.search()`** — the same call the MCP tool makes,
with caching decorators injected for the embedder and the cross-encoder. There is no
second copy of the search pipeline here to drift out of step with the real one.

That is also why the ablations are the product's **own environment variables** rather
than eval-only flags: a setting that scores well here is one a user can actually turn on.

```bash
env CATTIVA_EMBED_MODEL=Xenova/gte-base bun run memory:eval     # swap embedder
env CATTIVA_RERANK=0 bun run memory:eval                        # no cross-encoder
env CATTIVA_CANDIDATE_POOL=200 CATTIVA_RERANK_DEPTH=100 \
  bun run memory:eval                                           # wider pool + shortlist
```

### The caches

Two, both under `data/`:

| Cache             | Key                                   | Caches                         |
| ----------------- | ------------------------------------- | ------------------------------ |
| `embed-cache.db`  | `(model, doc\|query, sha256(text))`   | Embedding vectors              |
| `rerank-cache.db` | `(model, sha256(query), sha256(doc))` | Cross-encoder relevance scores |

Together they take a rerun from **~8 minutes to ~10 seconds**. That matters because
**changing how results are ranked does not change a single embedding or a single
cross-encoder score** — fusion weights, RRF constants, recency and `top_k` all reuse both
caches whole, and that is the loop this eval mostly runs in. Changing a _model_
invalidates its cache, since the model id is part of the key.

Both are transparent by construction. The embedder cache reports the base embedder's `id`
and returns the float32 round-trip on a miss as well as a hit, so cold and warm produce
byte-identical vectors; scores are SQLite `REAL`, which is float64 exactly like a JS
number, so they need no such care. Measured on 2 conversations:

|      | time   | hit@1 | recall@10 |
| ---- | ------ | ----- | --------- |
| cold | 117.9s | 0.488 | 0.734     |
| warm | 1.2s   | 0.488 | 0.734     |

98x faster, same numbers. `--no-cache` re-runs that check whenever you want it.

Neither belongs in `src/`. A user's `add_memory` calls are near-always novel text, so both
would be disk cost for nothing; they pay only against a fixed corpus queried repeatedly.

Baselines are **keyed by model id** — a score from a different embedder is not a comparable
number. The runner prints a delta against the saved entry for whichever model is active.
The run is deterministic, so an unchanged model reproduces its baseline exactly and any
delta is a real change.

## The files

| File              | What it is                                                    |
| ----------------- | ------------------------------------------------------------- |
| `locomo.ts`       | The runner: seeds a store per conversation, queries, reports  |
| `score.ts`        | Metrics. Pure functions, no I/O, no store                     |
| `cache.ts`        | Cross-run vector cache. Wraps an `Embedder`, keeps its `id`   |
| `rerank-cache.ts` | Cross-run score cache. Wraps a `Reranker`                     |
| `compare.ts`      | Runs the eval across every model in `MODELS` and tabulates it |
| `baseline.json`   | Saved scores per model                                        |
| `data/`           | Downloaded dataset and both caches. Gitignored                |

One store **per conversation**. Questions are scoped to their own conversation, so pooling
them would invent distractors the evidence labels never accounted for.

## The metrics

| Metric                 | Meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `hit@1`                | An expected memory came back first                                             |
| `hit@3`                | An expected memory was in the top 3                                            |
| `recall@3`             | _Fraction_ of expected memories in the top 3 — this is what measures multi-hop |
| `hit@10` / `recall@10` | Same over the full search window: the ceiling ranking could reach              |
| `MRR`                  | 1 / rank of the first expected memory. Rewards 2nd over 5th                    |
| `mean margin`          | Gap between #1 and #2, over questions that got #1 right                        |

`similarity`, and therefore `mean margin`, is **not on a fixed scale**: with reranking on
it is the cross-encoder's relevance probability, with it off a normalised rank-fusion
score. Comparing margins across those two configurations is meaningless — the jump from
0.111 to 0.357 when reranking landed is a change of unit, not of quality. The hit and
recall metrics depend only on ordering and stay comparable throughout.

**`mean margin` covers passes only.** The gap between #1 and #2 on a question you already
got wrong is a gap between two wrong answers. Restricted to passes it answers something
useful: _how safely_ did you pass? A near-zero margin is a coin flip that happened to land
right, and it will flip on the next change.

Search always runs at `top_k=10` regardless of the product default, so MRR and the @10
metrics have a full window to work with.

## Results

`Xenova/bge-small-en-v1.5` with hybrid search and reranking — the shipping default —
over 1,977 questions, 9 skipped for unresolvable evidence:

| category      | n        | hit@1     | hit@3     | rec@3     | hit@10    | rec@10    | MRR       |
| ------------- | -------- | --------- | --------- | --------- | --------- | --------- | --------- |
| **overall**   | **1977** | **0.496** | **0.662** | **0.604** | **0.772** | **0.718** | **0.590** |
| `single-hop`  | 841      | 0.558     | 0.731     | 0.717     | 0.830     | 0.818     | 0.654     |
| `adversarial` | 446      | 0.388     | 0.547     | 0.541     | 0.684     | 0.676     | 0.483     |
| `temporal`    | 320      | 0.606     | 0.725     | 0.696     | 0.813     | 0.788     | 0.675     |
| `multi-hop`   | 281      | 0.441     | 0.644     | 0.347     | 0.762     | 0.488     | 0.553     |
| `open-domain` | 89       | 0.225     | 0.404     | 0.328     | 0.551     | 0.448     | 0.331     |

How it got there, each stage measured on the same 1,977 questions:

| stage                   | hit@1     | hit@3 | rec@3 | hit@10 | rec@10    | MRR   |
| ----------------------- | --------- | ----- | ----- | ------ | --------- | ----- |
| dense only (`0.2.0`)    | 0.282     | 0.452 | 0.407 | 0.637  | 0.582     | 0.389 |
| \+ hybrid (FTS5 + RRF)  | 0.337     | 0.536 | 0.484 | 0.713  | 0.655     | 0.455 |
| \+ cross-encoder rerank | **0.496** | 0.662 | 0.604 | 0.772  | **0.718** | 0.590 |

**First-try accuracy went from 28% to 50%.** Reranking is the larger half of that and is
why it ships on by default.

`multi-hop`'s `rec@3` (0.347) sits far below its `hit@3` (0.644): the top 3 usually
contain _an_ answer but rarely _all_ of them, which is exactly what `top_k=10` is for.
`adversarial` — questions with a false premise — still scores worst, and it is the case
where confident retrieval does the most harm.

## What the eval found

### The bottleneck is ranking, not search

Dense-only scored `hit@1` 0.282 against `hit@10` 0.637, splitting every question into
three near-equal buckets:

|                | share   | what happened                                      |
| -------------- | ------- | -------------------------------------------------- |
| correct        | 28%     | right memory came back first                       |
| **mis-ranked** | **36%** | right memory _was found_, but sat at position 2–10 |
| not found      | 36%     | not in the top 10 at all                           |

More than half of what went wrong was ordering — the store already had the answer and
handed back something else first. That is what a cross-encoder is for, and attacking it
is where the +0.16 `hit@1` came from. The mis-ranked bucket is now 28%.

### More candidates do not help

Fusion cannot promote what it never fetched, so the obvious next move was a bigger net.
Measured across pool/depth pairs, cost scaling with depth:

| pool | depth | hit@1     | recall@10 | rerank cost |
| ---- | ----- | --------- | --------- | ----------- |
| 50   | 30    | **0.496** | 0.718     | 1x          |
| 100  | 50    | 0.496     | 0.731     | 1.7x        |
| 200  | 100   | 0.497     | 0.740     | 3.3x        |

Quadrupling the pool and reading 3.3x more of it moved the top answer for **one question
in 1,977**.

A separate ceiling measurement says why. Widening 50 -> 200 puts the evidence _within
reach_ 12.3 points more often (83.4% -> 95.7%), yet only 2.2 points of that reached the
results — **~18% conversion, against ~84% for the candidates already in the pool.** What
fusion buries below rank 50, the cross-encoder does not recognise either.

So the limit is the reranker's judgement, not the size of the net, and the defaults stay
at the cheapest setting. This rules out a whole family of tempting ideas — deeper fusion,
more retrievers, larger `top_k` upstream — and leaves one: a better judge.

### `top_k` was the free win

The paper's `top_k=3` default was chosen for an agent with an 8,192-token context. Measured
here it costs a lot, and raising it to 10 helps **every** category — on the shipping
pipeline as much as on the dense-only one it was first measured against:

| category      | rec@3 | rec@10    |
| ------------- | ----- | --------- |
| overall       | 0.604 | **0.718** |
| `single-hop`  | 0.717 | 0.818     |
| `multi-hop`   | 0.347 | **0.488** |
| `adversarial` | 0.541 | 0.676     |

`multi-hop` gains most — a question needing three evidence turns cannot be satisfied by
three results unless the ranking is perfect. The default is 10: ~600 extra tokens on a
200k-token host, and the model re-ranks what it reads anyway.

### A shipped crash

`add_memory` **without** `memory_type` threw `SQLiteError: Expected text for TEXT metadata
column memory_type, received NULL`. vec0 metadata columns reject NULL and `memory_type` is
optional in the tool schema, so the most common call an agent makes was broken in `0.1.0`.

LoCoMo turns have no type, so it failed on the first insert. Untyped memories are now
indexed under `""`; the `memories` table keeps the real NULL and `get()` still reports
`memoryType` as undefined.

### A second one, found by making the eval faster

`newId()` was `mem_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}` — four hex
characters, **16 bits of randomness** behind a millisecond timestamp. The birthday bound on
65,536 values is ~256, so any burst of more than a couple of hundred inserts inside one
millisecond collides on `memories.id`.

Nothing hit it while each `add` took ~20ms. The moment the vector cache made inserts
sub-millisecond, conversation 8 died on `UNIQUE constraint failed`. The suffix is now 48
bits.

Worth noting how it was found: not by a test, but by an unrelated **performance** change
moving the code into a timing regime it had never run in. Interactive `add_memory` calls
are seconds apart, and no amount of staring at that line would have made it look wrong.

### The query prefix matters more than it looks

BGE-family models are trained asymmetrically — the query takes an instruction prefix, the
stored text does not. That is why `embed()` and `embedQuery()` are separate methods on the
`Embedder` interface. Dropping the prefix costs recall and, more importantly, badly hurts
the separation between real hits and noise.

### Things a better embedder will not fix

- **Entity names.** Embeddings cannot match a term the model has never seen. This was the
  obvious attack on the not-found bucket, and it worked: FTS5 (`porter unicode61`) fused
  into the dense results with RRF is the +0.055 `hit@1` "hybrid" row above. Stopwords are
  deliberately **not** stripped from the lexical query — filtering them was measured and
  lost.
- **Supersession.** Still open. Nothing in the pipeline knows a June memory beats a March
  one on the same subject. That is a recency signal at ranking time, and it is the next
  thing worth measuring.

Both are cases where a bigger embedding model is the wrong lever — which the
`Qwen3-Embedding-0.6B` result below makes concrete.

## Why no hand-written fixtures

There used to be a hand-written set here: 40 memories and 27 questions about an invented
developer. **It was deleted because it gave the wrong answer.**

Tested against it, `Qwen3-Embedding-0.6B` looked like a clear upgrade over `bge-small`:

|            | hand-written (23 q) | LoCoMo (1,977 q) |
| ---------- | ------------------- | ---------------- |
| `hit@1`    | **+0.087**          | −0.039           |
| `hit@3`    | **+0.130**          | −0.063           |
| `recall@3` | **+0.109**          | −0.057           |
| `MRR`      | **+0.083**          | −0.054           |

A 0.19 swing, in the opposite direction. At 1,977 questions that gap is roughly 125
questions — not noise.

The small set wasn't merely imprecise, it was **biased**. Forty declarative sentences in one
voice, with questions phrased by the same person, is a _style_ — and the model that suited
that style won. Real dialogue written by people with no stake in the outcome said the
opposite.

We came close to shipping a 614MB default on the strength of 23 questions we wrote
ourselves. If you add fixtures back, they belong beside a public dataset, never in place of
one.

## Adding a model

Add an entry to `MODELS` in [`../src/config.ts`](../src/config.ts) with its vector width,
plus a query prefix if the model is trained asymmetrically. Then run with
`CATTIVA_EMBED_MODEL` set and `--save` to record a baseline.

**Encoder models only.** Decoder-only embedders (Qwen3-Embedding and similar) need
last-token pooling rather than the mean, and the AI SDK provider only offers
`mean | cls | max` — routing one through it yields plausible-looking wrong vectors with no
error. Two traps found the hard way while testing one:

- **Pooling.** Mean-pooling a decoder-only model is silently wrong. Sanity-check the
  geometry first: unrelated sentences should score far apart. `gte-small` put two entirely
  unrelated sentences at **0.7549** — a similarity floor that high leaves no usable range.
- **Padding.** For at least one ONNX export, batching identical-length texts reproduced the
  unbatched vector exactly (cos `1.000000`), but _any_ padding dropped it to ~0.93 on either
  side. Pad tokens leaked into the output. Always verify batched output against unbatched
  before trusting a throughput optimisation.

  This is **per-export, not universal**. `bge-small-en-v1.5` was re-checked when the eval
  started batching and is clean: a 37-character text padded out to 444 reproduces its
  unbatched vector at cos `1.000000`, as does the first member of a 64-batch. Re-run that
  check for any model you add rather than assuming either result.

## Known limitations

- **LoCoMo indexes raw dialogue turns**, not the distilled facts `add_memory` normally
  receives — `"Hey Mel! Good to see you!"` becomes a memory. It measures the retrieval layer
  honestly but is harder than the real workload, so treat 0.718 as a floor.
- **It is conversation memory**, a different shape from the developer preferences and
  project decisions Cattiva actually stores.
- **Only the default model's baseline is current.** The other five entries in
  `baseline.json` are dense-only numbers recorded before hybrid search and reranking
  existed, so they are not comparable to the headline table and must be re-run before
  anyone concludes anything from them.
- **A cold run is ~8 minutes**, and swapping either model makes every run cold. Batching at
  64 is only 1.7x on this CPU — the sweep across all six models wants a GPU backend, not
  more batching.
- **Latency is not scored.** Reranking costs a forward pass per candidate, roughly 200ms
  per retrieval on this CPU, and nothing in the metrics above reflects that. The
  quality-per-millisecond trade-off is a judgement call the eval does not make for you.
- **The eval says what failed, never why.** There is no attribution of a miss to a lexical
  gap, a semantic gap, a partial multi-hop, or an adversarial question that was correctly
  empty — so the ranked list of what to fix next is guesswork.
