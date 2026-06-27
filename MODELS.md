# MODELS.md — Apex factory model lineup (official audit)

Audited live from `platform.claude.com` (2026-06-11) and a 6-agent orchestration workflow (research →
Fable-5 synthesis → adversarial verify). Founder mandate: **right model for the right task, not Opus/Fable
by default**, cost-effective at a **≥10× ROI** bar.

## Official models & pricing (verified)

| Model | API id | Context | Max out | Input $/M | Output $/M | Cache-R | Tier |
|-------|--------|---------|---------|-----------|------------|---------|------|
| Fable 5 | `claude-fable-5` | 1M | 128k | 10 | 50 | 1.0 | **flagship — most capable GA (2026-06-09)** |
| Opus 4.8 | `claude-opus-4-8` | 1M | 128k | 5 | 25 | 0.5 | heavy, fast |
| Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 64k | 3 | 15 | 0.3 | balanced (workhorse) |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 200k | 64k | 1 | 5 | 0.1 | fast (3× cheaper than Sonnet) |

- `claude-mythos-5` is **invitation-only** (Project Glasswing) — not usable here.
- **Fable 5 IS callable under the factory subscription OAuth token at $0/token** — confirmed by live CLI probe 2026-06-11. (An earlier draft of this file wrongly said it wasn't selectable; that was an unverified inference, now corrected.)
- **Because all four are $0 on the subscription, dollars are not the constraint — rate-limit allowance and latency are.** Heavier models (Fable, Opus) burn the allowance faster and are slower. So: lightest model that achieves the outcome; escalate only where a better decision changes what ships.
- **Prompt caching stretches that allowance** (cache reads bill at the Cache-R column ≈ 0.1× input) and cuts SKU per-token $. The loop/DSL cache automatically; SKU calls route through the chassis `llm` wrapper. Standard + measurement: [CACHING.md](CACHING.md) (D22) and `node usage.mjs --cache`.

## The ladder — 4 rungs

| Rung | Model | Use for | Climb up when… |
|---|---|---|---|
| 1 | **Haiku 4.5** | reads, routing, lookups, scaffolding, test stubs, media prompts, low-stakes text | task needs real reasoning / multi-file awareness / a judgement call |
| 2 | **Sonnet 4.6** *(default)* | feature dev, TDD build/test/green, module review, integration tests, docs, conversion copy | task is open-ended across many files, or Sonnet failed twice on the same task |
| 3 | **Opus 4.8** *(rationed)* | clear-scope multi-file refactors, heavy TDD with known shape, long-context synthesis, brief decomposition; the retry layer before Fable | task is genuinely novel, or Opus produced a weak result on a 2nd attempt |
| 4 | **Fable 5** *(frontier scalpel)* | novel architecture (no pattern to follow), hardest long-horizon TDD, unknown-shape problems where being wrong costs major rework | nothing is above it — if Fable fails, **decompose and re-enter at Rung 2** |

**Fable is the scalpel, not the chainsaw.** It carries ~85–108s time-to-first-token and the heaviest allowance burn, so a few calls can saturate an overnight run. Hard rules: reachable **only** via the `factory-architect` agent (or an explicit founder `LOOP_MODEL=claude-fable-5`); **cap ~2 invocations per overnight run**; never a default.

## The agent roster (project-scoped — `factory-core/.claude/agents/`)

Each agent is pinned to its rung with least-privilege tools. Clean-slate; does not touch global ECC agents.

| Agent | Model | Role | Tools |
|---|---|---|---|
| `factory-planner` | Opus 4.8 | decompose briefs, own architecture before code | Read, Grep, Glob, Write |
| `factory-architect` | **Fable 5** | the single Fable home — novel architecture, hardest reasoning | Read, Grep, Glob, Write |
| `factory-builder` | Sonnet 4.6 | coding workhorse — implement, integrate, TDD, fix | Read, Write, Edit, Bash, Grep, Glob |
| `factory-scout` | Haiku 4.5 | read-only research, trend discovery (PRD Phase 1) | Read, Grep, Glob, WebSearch, WebFetch |
| `factory-reviewer` | Sonnet 4.6 | post-commit review; Opus-flag for auth/payments/gate | Read, Grep, Glob, Bash |
| `factory-copy` | Sonnet 4.6 | customer/conversion copy (Godin/Hormozi/Enns) | Read, Write, Edit |

The two deterministic gates stay **pure code, no model**: the copywriter-auditor hook and the tier-1 regex eval.
Eval tier-2 judges + the 6h heartbeat narration run on **OpenRouter free** ($0, off the Max allowance).

## Escalation & guards
- **Failure-driven climb:** Sonnet fails twice → Opus; Opus fails twice or task genuinely novel → Fable; Fable fails → decompose, re-enter at Sonnet. Never retry Fable on the same undivided task.
- **Allowance gate:** `usage.mjs --claude-gate` runs each loop iteration; if a `CLAUDE_*_BUDGET` (set in `.env`) is exceeded, the loop cools down instead of burst-firing. `usage.mjs` flags when Opus exceeds 80% of weekly consumption.
- **Demotion watch:** Opus 4.8 is kept for speed/throughput and as a warm hedge while Fable (released 2026-06-09) proves its failure modes. If per-rung instrumentation later shows Fable unconstrained overnight, collapse Opus out of the ladder.

## How it's wired
- `loop.sh` runs `claude -p --model "${LOOP_MODEL:-claude-sonnet-4-6}"` and instructs the operator to delegate to the `factory-*` agents (each runs on its pinned model). Escalate a whole run with `LOOP_MODEL=claude-opus-4-8 make launch` (or `claude-fable-5` for the hardest).
- Hardening: pre-flight auth ping, per-iteration `timeout`, failure backoff + circuit breaker, crash marker + immediate Telegram alert, log rotation, anchored `ALL_DONE` sentinel.

## Auth facts (verified, high confidence)
- **Two-key model (2026-06-21):** the factory runs on its OWN dedicated Claude credentials, split by role —
  **`CLAUDE_CODE_OAUTH_TOKEN` (sk-ant-oat01-…) = the FACTORY** (build/design/test), and the **Anthropic API key (sk-ant-api03-…) = SKUs ONLY** (per-token, in each SKU's Railway env — never the factory).
- Factory agents authenticate via **`CLAUDE_CODE_OAUTH_TOKEN`** (gitignored `.env`) — a `claude setup-token` one-year token. Bills the **subscription**, **$0/token**; from **2026-06-15** `claude -p` draws on a monthly "Agent SDK credit" (still subscription, not API credits).
- **`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` OUTRANK** the OAuth token — `loop.sh` `unset`s both before calling `claude`. Never pass `--bare` (it ignores the token). Re-run `claude setup-token` to rotate before the one-year expiry.
- **`auth-guard.sh` enforces the invariant** (fail-closed, loud): the loop pre-flight stops + Telegram-alerts if a SKU API key sits in `factory-core/.env`, if the OAuth token is missing, or if it isn't an `sk-ant-oat01-` token. Run standalone via `make auth-guard`; fixtures in `tests/auth-guard.test.sh` (`make guard-test`).

Sources: `platform.claude.com/docs/.../models/overview` & `/pricing`; `code.claude.com/docs/en/authentication`; benchmark/positioning from Anthropic + independent outlets (the-decoder, TechCrunch, VentureBeat, Artificial Analysis).
