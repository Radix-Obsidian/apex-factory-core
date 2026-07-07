# DECISIONS — Apex Factory

Decision log. Each entry: what we chose, and why, so future runs don't relitigate it.

## D1 — ralphy is shelved (not installed)
The blueprint's outer-loop wrapper `ralphy` is **not used**. Its npm identity couldn't be verified
(registry 403'd), so it's untrusted; and `loop.sh` already runs the ECC `loop-operator` directly, so a
wrapper is YAGNI. **Revisit only** if we ever want a wrapper, and only after a sandboxed
`npx ecc-agentshield scan` clears it. Until then the loop has zero dependency on it.

## D2 — Stripe CLI deferred to gate-time
`stripe` CLI is **not installed** and `stripe login` is **not run** tonight. Build-to-PR has no live
charge surface — TEST-mode keys (or none) suffice. The CLI + interactive login are only needed when
the publish+charge gate opens. Deferring removes one interactive login from the critical path.

## D3 — heartbeat model
`heartbeat.sh` is mechanical ($0, local-only). The OpenClaw cron that runs it uses OpenClaw's **default
agent model** to narrate the result — OpenClaw's model config lives outside this control plane. That's
~4 short runs/day = negligible burn. A *true* OpenRouter-free narration path is a follow-up; not faked here.

## D4 — company ⟂ product (the standard)
`apex-factory-core` (private) is the **company/operator**. It never becomes a sellable product. Each
**product** is a separate SKU repo (`The-Native-Factory` = SKU #1) with its own Stripe + deploy. One
factory, many SKUs — the studio/holdco model. Productizing the factory itself is a possible v2, not now.

## D5 — the gate is fail-closed
`deploy-guard.sh publish` refuses unless `.env PUBLISH_APPROVAL_TOKEN` is set **and** a matching runtime
`APPROVAL` token is supplied. Empty stored token ⇒ the gate can never open. Tonight it is empty by
design: the factory physically cannot charge a customer.

## D6 — key rotation: declined (founder's call)
The 10 plaintext keys found in `~/.claude/settings.json` during AgentShield triage are **not** being
rotated — founder decided. Closed; no longer tracked.

## D7 — model routing lineup (audited 2026-06-11) — supersedes Opus-by-default
Full official audit in [MODELS.md](MODELS.md). Sonnet 4.6 = build/codegen/copy workhorse; Haiku 4.5 =
cheap/bounded/high-frequency; OpenRouter free = eval judges + heartbeat narration ($0); Opus 4.8 =
rationed escalation only; copywriter-auditor + tier-1 eval stay pure code. `loop.sh` defaults
`--model claude-sonnet-4-6` (`LOOP_MODEL` overrides). **Pricing correction:** Opus 4.8 is **$5/$25** per
MTok (not the legacy $15/$75) — `usage.mjs` rates fixed, which cut the consumption proxy ~3×.
This replaces D3's vague "OpenClaw default model" stance for the heartbeat narration target (OpenRouter free).

## D8 — factory auth: subscription OAuth token, precedence-guarded
Factory agents authenticate from `CLAUDE_CODE_OAUTH_TOKEN` in gitignored `.env` (a `claude setup-token`
one-year token; bills the subscription, $0/token). Verified: `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`
**outrank** it, so `loop.sh` `unset`s both before calling `claude`; never use `--bare` (it ignores the
token). Rotate via `claude setup-token` before the one-year expiry. From 2026-06-15 `claude -p` draws on a
monthly "Agent SDK credit" (still subscription). This is the "agentic staff" identity, separate from AJ's
interactive Max session.

## D9 — production posture: enabled, crash-recovery (not cold-start)
Per founder ("wire AND enable, real outcomes from day one"): the `apex-heartbeat` cron is **ENABLED**.
The heartbeat does **crash-recovery** — it relaunches a loop that was running and died (detected via the
`runs/loop.active` marker), but does NOT cold-start the factory on a timer. The first build is a deliberate
`make launch`. The publish+charge gate remains the one fail-closed hard stop. See [[build-for-production-from-day-one]].

## D10 — 4-rung ladder w/ Fable 5 + orchestration hardening (audited 2026-06-11)
**Fable 5 correction:** `claude-fable-5` IS callable on the factory subscription token at $0 (live probe) —
the earlier "API-only / not selectable" claim was a wrong inference, now fixed in MODELS.md. Since all four
models are $0, the constraint is rate-limit allowance + latency, not dollars. Ladder: Haiku → Sonnet
(default) → Opus 4.8 (rationed) → Fable 5 (frontier scalpel, ≤~2/run, reachable only via `factory-architect`).
Six project-scoped agents created in `.claude/agents/` (planner=Opus, architect=Fable, builder/reviewer/copy=Sonnet,
scout=Haiku); does not touch global ECC agents. Full lineup + ROI in [MODELS.md](MODELS.md). See [[anthropic-model-routing-lineup]].

**Loop hardening (P0, applied to loop.sh/heartbeat.sh):** pre-flight Haiku auth ping (catches token expiry),
per-iteration `timeout` (degrades if no `timeout`/`gtimeout`), failure backoff + circuit breaker (≥3 consecutive
fails → stop + Telegram alert), crash-marker-FIRST + EXIT-trap alert (closes the silent-death window), in-loop
`usage.mjs --claude-gate` allowance enforcement (no-op until `CLAUDE_*_BUDGET` set), anchored `ALL_DONE`
sentinel (`runs/done.flag`), log rotation (keep 5), `caffeinate` on launch.

**Now done (founder approved 2026-06-11):** (b) 30-min pure-shell crash-check launchd agent
(`crash-check.sh` + `launchd/com.apex.factory.crashcheck.plist`, `make crashcron-install`) — recovers a
crashed loop within 30 min at $0/no model calls, companion to the 6h heartbeat; (c) hard Fable per-run
counter — `hooks/fable-budget.mjs` PreToolUse(Task) hook blocks the 3rd+ `factory-architect` (Fable)
invocation per run (`FABLE_MAX_PER_RUN`, default 2), counter reset by loop.sh each run.

**Still deferred (conscious):** (a) demoting GLOBAL `~/.claude/agents/planner.md` opus→sonnet — cross-project,
needs founder OK, mitigated by the factory using its own `factory-planner`; (d) per-rung token instrumentation —
revisit once the first real run produces log data.

## D11 — concurrent-agent git hygiene: ownership-zone guard (2026-06-11)
Problem: a blind `git add -A` in this multi-session repo (factory control plane + the actively-built `recycled/`
harness + the autonomous loop committing on its own) sweeps a parallel session's in-flight files into unrelated
commits — a corruption-bug-in-waiting. Resolution (simple-but-safe, AI-native):
- `.gitzones` declares isolated subproject roots (currently `recycled/`); everything else = the "core" zone.
- `.githooks/pre-commit` (activate once with `make hooks-install` → sets `core.hooksPath`) HARD-BLOCKS any commit
  whose staged files span >1 zone, for ALL committers incl. the autonomous loop. The bug class is now structurally
  impossible, not merely avoided by discipline.
- `scripts/commit.sh [--zone <name>] [--push] "msg"` is the safe path: clears the index, stages exactly ONE zone
  (never a standing `add -A`), secret-scans the diff, commits. Use it instead of `git add -A`.

Next (DONE — see D12): run the autonomous loop in its OWN git worktree + branch. Still deferred: split
`recycled/` into its own repo ONLY if it becomes a standalone product. See [[concurrent-agent-git-hygiene]].

## D12 — autonomous loop runs in its own git worktree (AI-native session isolation, 2026-06-11)
Completes D11's deferred "next." The loop no longer shares a working tree or index with interactive founder
sessions. `make launch` (and heartbeat/crash-check recovery) runs the loop inside a dedicated git **worktree**
on branch **`loop/auto`** (default `.worktrees/loop`, gitignored; override `LOOP_WORKTREE`/`LOOP_BRANCH` for a
sibling/external checkout). Layering: ownership **zones** (D11) stop cross-subproject mixing *within* a tree;
**worktrees** (D12) stop cross-*session* clobbering. Effects, all test-verified ($0):
1. A blind `git add -A` by the loop can only touch its own worktree — founder edits on `main` are physically
   unreachable (confirmed: a worktree commit left `main` HEAD + index untouched).
2. The loop's own factory-core scratch lands on `loop/auto`, reviewable, never on `main`.
3. `ensure_worktree` fast-forwards `loop/auto` to `main` each launch **when clean & not ahead**, so the loop
   always starts from the latest harness, but preserves (and flags) divergent loop commits instead of discarding.
4. The zone guard is **inherited automatically** — worktrees share `.git/config`, so `core.hooksPath=.githooks`
   applies with no per-worktree `make hooks-install` (verified). The guard fires inside the worktree too.
5. `.env` (gitignored OAuth token) is symlinked into the worktree for headless auth; `runs/` is per-worktree, so
   `heartbeat.sh`/`crash-check.sh` resolve the loop worktree's marker (`scripts/worktree.sh`) — crash-recovery
   still fires (verified: marker present → "CRASHED — recovering"; absent → "idle").

Surfaces: `scripts/worktree.sh [ensure|path|status|remove]`; `make worktree-setup|worktree-status|worktree-remove`.
The 7-agent expert research panel for D11/D12 was rate-limited (Max session limit) — resolution synthesized
directly and proven by test rather than citation. See [[concurrent-agent-git-hygiene]].

## D13 — org operating system: one registry maps the whole company (2026-07-07)
Problem: chaos/drift — everything lived in GitHub + Cursor with no single index across *many* repos +
assets + marketing + finance + experiments, so work got lost. Resolution: an org-level **registry** in
`registry/` (built as vertical slices, mirroring the `recycled/` idioms — pure Node built-ins, $0, no deps).
- **Source of truth = `registry/*.jsonl`** (repos, assets, campaigns, finance, experiments), each governed
  by a JSON-Schema contract in `registry/schemas/`. **`ORG.md` is GENERATED** (`make org-render`) and never
  hand-edited — deterministic (no timestamps) so re-render is a no-op diff.
- **`registry.mjs`** is the deterministic floor: a JSON-Schema-subset validator + per-domain integrity
  (unique keys) + cross-domain foreign keys (asset/campaign/experiment `repo` → `repos.jsonl`; experiment
  `candidate_ref` → the existing `recycled-candidates.jsonl` salvage queue). `make org-verify` +
  `registry/registry.test.mjs` (node --test) are the guardrail floor.
- **Anti-drift:** `heartbeat.sh` §5 runs `registry.mjs render --check` each 6h ($0, no model) → OK / DRIFT.
- **Layering (company ⟂ storage):** GitHub = truth for code + structured state; **Google Drive = a
  human/phone-readable MIRROR only** (folder `Apex Factory — Org Map`, `ORG.md` as a Google Doc, domain
  drop-zone subfolders). Links recorded in `registry/drive.json` and surfaced in `ORG.md`. Node can't reach
  MCP, so the Drive sync is an **agent action** (`.claude/commands/org-sync.md`), not a `make` target.
- Adds `CLAUDE.md` — the previously-missing canonical front door (read-chain + org map pointer).
Seeded honestly with only what exists or is explicitly planned (2 repos, the build-in-public series, planned
campaigns, the SKU-1 thesis, a $0 pre-gate finance snapshot). Zero fabricated revenue/repos.
