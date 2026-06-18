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

## D16 — manufacturing-paradigm standard (TPS / Tesla / SpaceX), mapped to mechanism, measured honestly (2026-06-17)
We name the manufacturing standard the factory already runs by — Toyota Production System, Tesla vertical-integration,
SpaceX first-principles+reusability — so every agent reasons inside it, and we make it **bulletproof by measuring it**,
not by asserting it. The process is the asset (the thing whose POWER we sell); this is its written constitution.
Companion doc: [METHOD.md](METHOD.md) (citable, principles-only). The measurement instrument: `make recycled-metrics`.

**Principle → real mechanism → NEW vs ARTICULATION.** Almost all of this already exists — D16 *names* it, it does not
build it (the one new mechanism is the metrics instrument below):
- **Pull / just-in-time (TPS)** → `candidates next` over `recycled-candidates.jsonl`; PRD Phase-1 pulls before trend-discovery. *Articulation.*
- **Jidoka / stop-the-line + andon cord (TPS)** → fail-closed `rollupVerdict`/`rollupVerdictGrounded` (R4/R17), ground-truth gate (R16), durability gate (R18–R20), publish+charge HARD STOP (D5), zone guard (D11). *Articulation* (D14:136 already named the jidoka ethos).
- **Genchi genbutsu / "go and see" (TPS)** → ground-truth gate judges market bars against the live landscape, never self-claims (R16/R17). *Articulation* — the strongest real instance.
- **Kaizen / continuous improvement (TPS)** → outcome-capture (D15) + 6h heartbeat + build-in-public; **+ the new cross-run metrics instrument** (the missing kaizen *gauge*). *Articulation + the one NEW mechanism.*
- **Waste elimination / muda (TPS+Tesla)** → Musk 5-step (D14), default-to-kill, `dedupeBuildSpecs` (R5, ≤1 build/repo), never-delete reversible archive (R7), `salvage_cheaper_than_rebuild` bar. *Articulation.*
- **Reusability (SpaceX)** → the whole Recycled harness + the salvage-cheaper bar (Falcon-9-booster analog). *Articulation.*
- **First-principles (SpaceX/Musk)** → `scoreFirstPrinciples` (R19) + the Musk 5-step build algorithm (D14). *Articulation* (the algorithm is agent discipline, not mechanically enforced — honest gap).
- **Vertical integration (Tesla)** → one control plane → many SKU repos (D4) + in-house model ladder (D7/D10) + own gates/hooks/eval. *Articulation, partly aspirational* — the **structure** exists; "~95% control" is unmeasured and **NOT claimed.**

**Fidelity, blunt, once (the real run data via `recycled-metrics`, 2026-06-17, 9 runs):** **60 decisions — 59 KILL /
1 SURVIVE; 1 greenlight ever (the old durability-blind line's MCPShield, since RE-KILLED by the strengthened line in
rev2 → 0 standing); 0 SKUs shipped; $0 revenue; 0 outcomes captured.** Fidelity today = **"the gates fire honestly,"
NOT "the output is excellent."** We have the discipline designed in; we have not yet produced a profitable SKU.

**Grok-inflation rejection (explicit):** a Grok briefing claimed "Toyota-level operational excellence," "~95%
control," "80–85% in-house," "10× SpaceX speed." Those are unmeasured or contradicted by the run data above. We do NOT
carry one of them forward. A manufacturing standard you can't measure is a slogan; ours prints its own numbers.

**Dual-purpose frameworks (the learning loop):** the Thiel-7 (D13) + Elon-first-principles (D14) gates are also the
**seed of the user-facing Socratic question set** — the questions the factory will ask users (like Claude's clarifying
questions) once it's a product; their answers compound into the outcome corpus (D15) = the data-network-effect moat.
The YC idea-evaluation frameworks (Friedman's 4-mistakes/10-questions/3-makers; Xu's "could you run your customer's
business for a day?") extend that question set. **Honest correction baked in (YC: Xu, Alströmer):** the AI kill-pass is
a cheap PRE-FILTER, not validation — surviving it means "not an obvious commodity loser," not "a real business." Real
validation = real customers + charging early. The gate kills cheap losers; customers + dollars validate survivors. The
gate must never become the "waiting for the perfect idea / overthinking" failure mode.

**The new mechanism — cross-run metrics (R23–R27):** pure fns `killRate` / `failureReasonDistribution` (bar keys read
DYNAMICALLY — bar sets drift across runs, e.g. `ai_native_not_feature`→`real_demand`) / `greenlightYield` (null on 0
candidates, no fake denominator) / `durabilityPassRate` (n:0 on empty) / `aggregateRuns` / `buildMetricsReport`, surfaced
by `make recycled-metrics` (human + `--json`). It aggregates the siloed `runs/recycled/*/` artifacts; reports zeros and
`n/a` honestly; this is also the **seed of the factory digital twin** (it *measures* the line; the twin will *simulate*
it forward). See [recycled/RECYCLED-SPEC.md](recycled/RECYCLED-SPEC.md).

**Honest limitation (recorded not hidden):** cycle/takt time, time-to-preview, per-SKU build cost, parts-bin reuse,
Day-45 profitable yield are **not yet measurable** (no run timestamps / no shipped SKU / parts-bin backlogged) — the
metrics tool labels each `n/a` with the reason rather than faking it. Adding a `run.meta.json`
(`{run_id, started_at, finished_at}`) at persist would unlock cycle-time on *future* runs (a separate decision; no
historical backfill). The B (fundable digital twin) / C (FaaS "dollar" trial) / robotics-digital-first arc is
**direction, not built** — gated on the demand probe earning C's promise first; see METHOD.md "Direction."

**Physical→digital principle (founder's reframe):** we re-engineer any future *physical* layer as a *digital* precursor
first (digital twin → prove → fund → build physical), using first-principles to find each layer's buildable digital
form. No speculative physical-abstraction code enters the line now (YAGNI / .cursorrules); the design is a dedicated
future pass.

## D17 — net-new IDEATION engine + ship/preview wiring: dogfood the promise (ideate→preview) on ourselves (2026-06-17)
The challenge-GTM reward ("we build it free") and the C "dollar" promise both assume a build-and-ship we have **never
done once** (0 SKUs / $0). So before offering the promise to anyone we **deliver it to ourselves**: generate one idea,
run it through the *real* gate, build it, ship it to a live preview. This pass proves **ideate→preview**; Stripe /
first-dollar is the NEXT pass (bar = a real external customer pays). The publish+charge gate (D5) is **untouched**.

**The gap this closes.** The kill-pass was **salvage-only** — it judges dead repos; there was no net-new ideation
(the PRD "trend discovery" fallback was documented, never built), and 0 ideas stand. The factory could KILL but not
GENERATE. D17 builds the missing **generator** and reuses the existing **judge** wholesale (reuse-first).

**What's new vs reused.**
- **Reused (the judge):** ground-truth gate (R16/R17), kill-pass rollup, durability + first-principles (R18–R20),
  `persistRun`/`evaluateGreenlight`, the candidates queue, D16 metrics. Untouched.
- **New (the generator):** `recycled/ideate.workflow.js` — I1 demand-mine (Sales-Safari + JTBD, cited real demand,
  boring-B2B by default) → I2 synthesize specific zero-to-one candidates → I3 ground-truth → I4 kill-pass → I4.5
  durability → I5 net-new BuildSpec. Methodology, not infra: GPT-Researcher/Reddit-MCP are named as the **scale-up**
  path, NOT adopted now (Python, off the Anthropic ladder, duplicates our ground-truth stage).
- **New (the net-new bar):** `IDEATION_BARS` swaps `salvage_cheaper_than_rebuild` → `reuse_over_rebuild`. A net-new
  idea has no repo to salvage, so the salvage bar would **auto-fail** it — feeding net-new through the salvage set
  unchanged would be a **rigged kill, not honesty**. `reuse_over_rebuild` keeps the same cost discipline (orchestrate
  proven components, don't heavy-lift from scratch) at the same brutality (R28–R29). `rollupVerdict`/`rollupVerdictGrounded`
  are parameterized with a `bars` set (default = salvage `BARS`; backward-compatible, the 48 prior tests stay green).

**The gate is NOT weakened (the dogfood-integrity rule).** Net-new is judged exactly as hard. `evaluateGreenlight`
(R31) skips ONLY the two salvage-SPECIFIC gates (`hours_saved_vs_rebuild`, extract-path verification — N/A with no
repo); kill-pass survival, true-zero-to-one, Thiel durability, and first-principles all apply unchanged. If our own
idea dies, it dies — **0 survivors is a valid, honest result** (the gap stays open; refine, don't force a build).

**The seam.** Workflow result → `node recycled/recycled-scan.mjs ideate ingest <run-id>` (deterministic, $0): persists
artifacts (auditable + feeds D16; `reuse_over_rebuild` counts via R24's dynamic bar keys) AND projects greenlights into
`recycled-candidates.jsonl` — the SAME queue `loop.sh` Phase-1 already consumes (net-new carries `net_new` + `wrap_plan`;
the loop builds from `wrap_plan`, not an extract_list). Tests R28–R32; surfaced by `make recycled-ideate`.

**Ship/preview wiring.** `deploy-guard.sh preview` runs `DEPLOY_CMD` (now documented in `.env.example`) and still
refuses any `sk_live_` key. **Vercel** is the default preview host for a Next.js SKU (zero-config, free tier); Railway
is the alternative. The SKU is its own repo (D4). This pass takes a survivor to a **live preview URL** and HALTS at the
sealed publish+charge gate — no Stripe, no charge.

**Honest limitation.** A 98%-kill gate may yield 0 survivors even with good ideation — expected, not a bug; it becomes
a documented gap (refine domain/sources or the net-new bar), not a forced build. Distribution (how a shipped preview
reaches people) is a later pass: make-people-aware via pull + cold-awareness + organic, gated by honest/value-first/
opt-out/hands-off/legal — NOT permission-first, NOT the Higgsfield dark-pattern. See METHOD.md "Direction."
