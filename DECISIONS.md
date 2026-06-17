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

## D13 — durability gate: Thiel's 7 questions (2026-06-17)
The 5 kill-pass bars ask *"is the code good?"*; they do **not** ask *"is the BUSINESS durable?"* — the gap that let a
ground-truth-injected brutal bar (Thiel's *Zero to One* definition) KILL our own consumer thesis at ~3/7 and confirm
H\RNESS owns 0 of Thiel's 4 durability sources. So every Tier-2 build candidate now also clears **Thiel's 7 questions**
(*Engineering* — ≥10x tech not marginal · *Timing* · *Monopoly* — big share of a small market · *People* · *Distribution*
· *Durability* — defensible 10–20 yrs · *Secret*), **≥6 of 7** to be build-eligible. Mechanized exactly like the kill-pass
bars: tested pure fn `scoreSevenQuestions` (R18) in `recycled-scan.mjs` (source of truth) + inline mirror in `workflow.js`
(Durability phase, judged against the live ground-truth packet, default-to-fail) + a required condition in
`evaluateGreenlight` (R20). Scorecards persist to `runs/recycled/<id>/08-durability.jsonl` (also the seed of the
learning corpus — see [[factory-product-thesis]]). The bar is meant to LOWER greenlight yield; that's kill-first working.

## D14 — first-principles gate + the 5-step build algorithm: Elon (2026-06-17)
Thiel says *what's worth building*; Musk's first-principles says *is it reduced to fundamental truths, or just reasoned
by analogy / "how everyone does it"* — the deeper cargo-cult/me-too test. Twin to D13, scored in the same Durability
phase: `scoreFirstPrinciples` (R19) checks `reasoned_from_fundamentals` (the **non-negotiable CORE** — an analogy-only
thesis fails outright), `requirements_questioned`, `irreducible` (deleted/simplified minimum, not bloat); pass = core +
≥2 of 3; also required in `evaluateGreenlight`. **Build-phase discipline (the Musk algorithm, applied by the build
agents):** (1) make the requirements less dumb (question every requirement, attach a name not a department) → (2) delete
the part/process (if you're not adding ≥10% back, you didn't delete enough) → (3) simplify/optimize (never optimize a
thing that shouldn't exist) → (4) accelerate cycle time → (5) **automate last**. Order matters: deleting before
optimizing, automating last. Pairs with the Toyota/jidoka ethos already in the line.

**Honest limitation (D13/D14, recorded not hidden):** the Durability phase is judged by a SINGLE agent that self-reports
each pass/why, deterministically scored — unlike Stage 4's three independent skeptics with unanimous-SURVIVE. So the gate
verifies *"the agent claims ≥6/7 / fundamentals"*, not *"N independent verifiers agree"* — the same shape-not-truth caveat
as the ground-truth gate (it can be rubber-stamped). Mitigations in place: kill-first prompt (default-to-fail), the live
ground-truth packet fed in, and a `code-reviewer` agentType. Future hardening: a 2nd independent durability agent rolled
up unanimous, mirroring the kill-pass. Not a blocker; the gate still strictly raises the bar above the 5 kill-pass bars.

## D15 — outcome-capture: the learning-loop moat SEED (2026-06-17)
The ground-truth-injected brutal bar's hardest, truest finding: our corpus is **data-access, not data-advantage** — it
stores judgments (verdicts, ground-truth sweeps, durability scorecards) but **zero records of what actually happened**.
Every rival scrapes the same public Crunchbase/Reddit; nobody has *our users' private idea → judgment → outcome pairs*.
That join, at volume, is the only **earnable** Thiel network-effect source (the product-thesis learning loop). So we wire
capture now, before there's anything to capture, so it starts compounding from observation #1.

**Shape:** a SEPARATE append-only artifact `recycled-outcomes.jsonl` at the control-plane root (tracked in this private
repo, like `recycled-candidates.jsonl` — the corpus *is* the asset), keyed by `candidate_id`. Deliberately **NOT** bolted
onto the kill-pass verdict schema (a skeptic judging in-the-moment cannot know the future; cramming outcome fields there
would be a lie about when the data exists). Pure fns `makeOutcome` (validate/normalize, fail-fast at the boundary),
`latestByCandidate` (log → current state, latest `checked_at` wins), `summarizeOutcomes` (descriptive counts) — R21/R22.
CLI: `recycled-scan.mjs outcome <candidate_id> <made_money|failed|unknown> [revenue] | list | stats`. It accepts **any**
judged `candidate_id`, not just queued greenlights — because the highest-value signal is a **KILL that someone else
shipped and monetized** (a *false kill*), which only the kills can teach us.

**Honest limitation (recorded not hidden):** this only SEEDS capture. The payoff — a kill-accuracy bake-off vs
WorthBuild/Preuve, or "of the things we killed, what fraction would have made money" — needs a verdict↔outcome join at a
volume of labeled data that **does not exist yet**. `summarizeOutcomes` therefore prints descriptive counts with an
explicit "NOT a calibration claim" disclaimer. We do not claim the corpus is a moat; we claim we started earning one.
The founder is observer #1 today (logging our own theses' fates, incl. MCPShield); users compound it once the platform ships.
