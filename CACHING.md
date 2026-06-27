# CACHING — Apex Factory prompt-caching standard (D22)

Prompt caching is a manufacturing standard, not a tuning knob. The factory caches what it reuses; every
SKU it ships does the same, by construction. This doc is the contract. Enforcement: the
`caching-auditor` PreToolUse hook (write-time), `make caching-check SKU=...` (per-SKU build gate),
`make cachingtest` (tier-1 eval). Decision record: [DECISIONS.md](DECISIONS.md) D22.

## The one rule

**Static first, varying last — and never inline a raw model call.** A cache hit requires a byte-identical
prefix. Put the stable content (system prompt, tool/schema definitions, fixed instructions, few-shot)
at the front and mark its end with a cache breakpoint; put the per-request content (the user message,
retrieved context, `JSON.stringify(data)`, timestamps) after it. Break the prefix and you pay full
freight on every call.

## Two surfaces, two obligations

The factory and the SKUs cache for different reasons. Treat them differently.

### The factory (this repo) — already cached; keep the prefix clean
The loop (`claude -p`) and the Workflow DSL (`agent()`) run on the Max **subscription** ($0/token); the
constraint is the rate-limit allowance, not cash. The Claude Code harness **already** applies prompt
caching automatically and gets real hits (transcripts routinely show six-figure `cache_read_input_tokens`).
There is no raw request here to annotate — so the factory obligation is **discipline, not wiring**:

- **Never poison the cacheable prefix.** In a workflow prompt, do not put a timestamp, run-id,
  `Math.random()`, or the varying `JSON.stringify(data)` *before* the static instruction block. Order
  every `agent()` prompt as `INSTRUCTIONS (static) → READ commands (static) → data (varying, last)`.
- **Measure it.** `make usage` reports spend; `node usage.mjs --cache` reports the **hit-rate**
  (cache-read / total input) per 5h + 7d window. A falling hit-rate means a prefix regressed — fix the
  prompt, don't shrug.

### The SKUs (shipped products) — caching is mandatory and money
SKUs run on per-token `sk-ant-api03` keys on Railway. Here caching is real cash. The obligation is
**wiring**:

- **Route every model call through a wrapper.** No inline `anthropic().messages.create(...)` and no raw
  `fetch("https://api.anthropic.com/v1/messages", ...)` scattered across routes. One wrapper per SKU
  (or the shared one below), so the caching discipline lives in exactly one place.
- **Tag the static `system` block.** The wrapper passes `system` as a content-block array with
  `cache_control` on the last static block:
  ```ts
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]
  ```
  Everything varying (the user turn, per-request JSON) stays in `messages`, after the breakpoint.
- **Use the chassis wrapper.** New SKUs inherit `chassis/lib/llm.ts` (`complete()`), which bakes in the
  cached system block + the `[ai-usage] ... cacheR=.. cacheW=..` log line. Don't reinvent it.

## The minimum-prefix floor (the honest caveat)

A prefix only caches once it crosses the model's **minimum cacheable size**. Below it, `cache_control` is a
silent no-op — no error, no saving. The floor is model-specific (Anthropic prompt-caching docs):

| Model | Min cacheable prefix |
|---|---|
| Sonnet 4.6 / Opus 4.8 | 1,024 tokens |
| Haiku 4.5 | 4,096 tokens |

Two more conditions must also hold: **≥2 requests share that exact prefix within the TTL** (no reuse, no
hit), and **no per-request variation sits ahead of the breakpoint**. Single-shot, one-per-user-action calls
satisfy neither — which is most SKU traffic today.

Measured against this, today's prompts mostly **don't** engage: heatlog brief (~475 tok) and engine (~500
tok) are far under their floor; domuschef's audit
([specs/prompt-caching-and-batch-audit.md](../domuschef-app/specs/prompt-caching-and-batch-audit.md))
measures every feature system prompt at ~416–1,053 tokens, with the Haiku-routed ones (moderation/comms
~492 tok) under the 4,096 Haiku floor and all of them single-shot. Wins are real only on large, static,
**burst-called** prefixes — none exist yet.

We therefore do **not** promise a fixed "X% saved." The standard mandates *routing through the cached
wrapper* so that (a) the discipline is uniform and (b) caching auto-engages the moment a prompt grows past
the floor or a feature becomes multi-turn — never a retrofit scramble. Tag the system block always; it's
harmless when below the floor and free money above it. (Caching is not the only lever: domuschef's audit
flags the Batch API — 50% off — as the bigger win on its one volume-scaling loop. Out of scope here, but
named so it isn't forgotten.)

## TTL

- **5-minute (default).** Bursty per-request SKU traffic and any prompt reused inside a 5-minute window.
  Refreshes free on each hit. This is almost always the right choice.
- **1-hour** (`cache_control: { type: "ephemeral", ttl: "1h" }`, billed at 2× write). Only for
  sparse-but-recurring callers — a side-agent that fires every ~10–30 min and would otherwise miss the
  5-minute window. Don't reach for it by default.

## Cost accounting (already wired)

`usage.mjs` prices cache tokens correctly: writes at 1.25× input, reads at 0.10× input
([usage.mjs](usage.mjs)). SKU wrappers log `cacheR` / `cacheW` per call (Railway-observable). When you add
caching, savings show up automatically in both — no separate meter to build.

## Enforcement (full parity with the copy gate)

| Layer | Artifact | Trigger | Verdict |
|---|---|---|---|
| Write-time hook | `hooks/caching-auditor.mjs` | PreToolUse Write/Edit | **BLOCK** a raw inline call that bypasses a wrapper; **WARN** a wrapper call missing `cache_control` |
| Per-SKU gate | `scripts/caching-check.mjs` → `make caching-check SKU=...` | SKU build (PRD Phase 2.7) | exit 0 if every call site is compliant or the SKU has no LLM calls; exit 1 lists raw-uncached sites |
| Tier-1 eval | `evals/caching-gate.mjs` → `make cachingtest` | CI / manual | F1 of the detector vs `evals/caching-corpus.jsonl`, gate at F1 ≥ 0.85 |

The hook, the gate, and the eval all import one detector — `hooks/caching-core.mjs` — so the eval measures
the **real** gate, the same way `audit-core.mjs` backs the copy hook and its eval.

## Where the SKUs stand today

`make caching-check SKU=...` is the source of truth; as of D22:

- **domuschef-app — PASS (the reference implementation).** Every product AI feature already routes through
  the `complete()` chokepoint, which tags the static system block via `withSystemCacheBreakpoint()`
  ([server/lib/claude.ts](../domuschef-app/server/lib/claude.ts)) and is enforced by its own eval. The
  chassis wrapper below mirrors this proven shape. (Caching is a no-op there *today* only because the
  prompts are under the floor — the wiring is correct and engages for free when they grow.)
- **heatlog — FAIL (the one real debt).** Two inline `fetch` calls in `app/api/{brief,engine}/route.ts`
  pass `system` as a bare string with no breakpoint. Below the floor today, so the fix is hygiene
  (consolidate into one wrapper + tag the block), not an urgent saving — the next retrofit pass.
- **dot-navigator — PASS.** No model calls; nothing to cache.

This is the D18/D19 posture: the standard and its enforcement land first; the one non-compliant instance is
named debt, not a regression.
