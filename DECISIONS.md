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

Next (deferred): run the autonomous loop in its OWN git WORKTREE + branch so parallel sessions never share a
working tree/index (the AI-native isolation primitive — Anthropic/Cursor recommend worktrees for parallel agents);
split `recycled/` into its own repo ONLY if it becomes a standalone product. The 7-agent research panel for this
was rate-limited (Max subscription session limit, resets 11:40 MST) — resolution synthesized directly; re-run the
panel later for citations if wanted. See [[concurrent-agent-git-hygiene]].
