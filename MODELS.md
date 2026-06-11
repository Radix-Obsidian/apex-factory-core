# MODELS.md — Apex factory model lineup (official audit)

Audited live from `platform.claude.com` on **2026-06-11** (8-agent workflow: research → Opus synthesis →
3 adversarial verifiers; 37/37 facts confirmed against source). Founder mandate: **stop defaulting to
Opus**; right model for the right task; cost-effective at a **≥10× ROI** bar.

## Official models & pricing (verified)

| Model | API id | Context | Max out | Input $/M | Output $/M | Cache-W 5m | Cache-R | Tier |
|-------|--------|---------|---------|-----------|------------|-----------|---------|------|
| Fable 5 | `claude-fable-5` | 1M | 128k | 10 | 50 | 12.5 | 1.0 | flagship (most capable GA) |
| Opus 4.8 | `claude-opus-4-8` | 1M | 128k | **5** | **25** | 6.25 | 0.5 | flagship Opus |
| Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 64k | 3 | 15 | 3.75 | 0.3 | balanced (workhorse) |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | 200k | 64k | 1 | 5 | 1.25 | 0.1 | fast (3× cheaper than Sonnet) |

- **Opus 4.8 is $5/$25 — not the legacy $15/$75.** Cache read is always 0.1× input; 1h cache-write is 2× input. Batch API = flat 50% off both directions.
- `claude-mythos-5` exists but is **invitation-only** (Project Glasswing) — not usable here.
- **Fable 5 is the capability ceiling but not selectable on this box**: the factory runs on the Max **subscription** OAuth token (no API key), and Fable 5 is standard/API-tier. Treat it as a future option, not an assignment.

## The lineup — role → model

| Factory role | Model | Why | Fallback |
|---|---|---|---|
| Loop-operator planning | **Sonnet 4.6** | High-depth but bounded (read PRD, do next checkbox); Opus is overkill | Haiku (mechanical iters) |
| TDD sub-agents (build/test/green) | **Sonnet 4.6** | Best coding model; highest cumulative volume → biggest cost lever, keep off Opus | Haiku (fixed-design refactor) |
| Hardest TDD / novel architecture | **Opus 4.8** *(escalation only)* | Reserve premium reasoning for outcome-changing decisions; `usage.mjs` flags if >80% weekly | Sonnet (drop back when bounded) |
| Copywriter-auditor hook | **none (pure code)** | Deterministic regex gate on the blocking path; an LLM adds cost+latency+nondeterminism | n/a — fix regex, not add a model |
| Eval tier-1 (regex measurer) | **none (pure code)** | It *is* the live gate logic; must stay code to measure the code | n/a |
| Eval tier-2 (LLM judge ×2) | **OpenRouter free** ($0) | Founder-gated offline grading, tiny volume; keep entirely off the Max allowance | Haiku if free tier too weak |
| 6h heartbeat narration | **OpenRouter free** ($0) | ~20-line status to Telegram, ~4×/day — textbook cheap high-freq | Haiku |
| Phase 1 trend/market discovery | **Haiku 4.5** | PRD literally says "cheap model"; web-scan + synth, 3× savings | Sonnet if synthesis needs sharper judgment |
| Phase 3 copywriting injection | **Sonnet 4.6** | Revenue-load-bearing persuasion copy; strong first-pass beats cheap retries | Haiku (low-stakes microcopy) |
| Media prompt enhancement | **Haiku 4.5** | Just crafting short gen prompts; Higgsfield credits are the real constraint | OpenRouter free |
| Checkout-abandonment rewrite (HEARTBEAT §2) | **Sonnet 4.6** | The one string that moves money; spend on conversion | Haiku trivial / Opus if stays broken |

**Policy:** Sonnet = default build/codegen/copy workhorse · Haiku = cheap/bounded/high-frequency · OpenRouter-free = eval + heartbeat narration ($0, off the Max pool) · Opus = rationed escalation only · two deterministic gates stay pure code (zero token, zero latency).

## How it's wired
- `loop.sh` runs `claude -p --model "${LOOP_MODEL:-claude-sonnet-4-6}"`. Default Sonnet; escalate a hard build with `LOOP_MODEL=claude-opus-4-8 make launch`.
- `usage.mjs` carries the corrected rates and flags when Opus exceeds 80% of weekly consumption.
- ECC sub-agents inherit their own per-agent model configs; the `--model` flag sets the operator's default.

## ROI logic (the 10× bar)
The two highest-volume roles (operator + TDD) run on Sonnet, not Opus — that holds the dominant cost
line at $3/$15 while keeping the best coding quality. Haiku ($1/$5) cuts discovery and media-prompt work
another 3×. The entire measure-and-monitor layer (evals + heartbeat narration) is OpenRouter-free at $0,
so it never competes with build work for the allowance. The two gates cost literally nothing. Opus is
fenced behind explicit escalation — spent only where a better decision changes what ships. The only spend
biased *up* is conversion-critical copy, because that's the lever that produces the revenue the 10× is
measured against.

## Auth facts (verified, high confidence)
- Factory agents authenticate via **`CLAUDE_CODE_OAUTH_TOKEN`** (in gitignored `.env`) — a `claude setup-token` one-year OAuth token. Bills against the **subscription** (Pro/Max/Team/Enterprise), **$0 per-token**; from **June 15 2026** `claude -p` draws on a new monthly "Agent SDK credit" separate from interactive limits (still subscription, not API credits).
- **Precedence:** `ANTHROPIC_API_KEY` (and `ANTHROPIC_AUTH_TOKEN`) **outrank** the OAuth token — if either is set, it silently wins. `loop.sh` `unset`s both before calling `claude` so the factory token always takes effect. Never pass `--bare` (it ignores `CLAUDE_CODE_OAUTH_TOKEN`).
- The one-year token does not appear to auto-refresh (reasonable inference, not explicitly documented) — re-run `claude setup-token` to rotate before expiry.

Sources: `platform.claude.com/docs/.../models/overview`, `/pricing`, `code.claude.com/docs/en/authentication`.
