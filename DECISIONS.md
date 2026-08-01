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

**Addendum (2026-06-21) — dedicated factory token + two-key split, guard-enforced.** The factory now runs
on its OWN dedicated Claude credentials (no longer shared with the other projects), and the model is two keys
with non-overlapping roles: **`CLAUDE_CODE_OAUTH_TOKEN` (sk-ant-oat01-…) = the FACTORY** (its own build/design/
test work), and **the Anthropic API key (sk-ant-api03-…) = SKUs ONLY** (per-token, injected per-repo via
Railway — never the factory). The `unset` in `loop.sh` enforced this *silently*; now `auth-guard.sh` makes it
LOUD and fail-closed — the loop pre-flight refuses to start (and Telegram-alerts) if a SKU API key is found in
`factory-core/.env`, if `CLAUDE_CODE_OAUTH_TOKEN` is absent, or if it isn't an `sk-ant-oat01-` OAuth token.
Wired into `make auth-guard` / `make guard-test` / `make verify`; fixtures in `tests/auth-guard.test.sh`.

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

## D18 — design-system baking: every SKU ships an intentional brand kit (Claude Design / DesignSync) as a standard step (2026-06-18)
The first shipped preview (DOT Navigator, D17) graded a **"B"** — a clean dossier, but template-flat. Routing it through
**Anthropic's Claude Design** (via the `/design-sync` skill) lifted it to a pass ("Carrier's Almanac": layered ink-on-paper,
brass/steel semantics, a signature compliance-spine hero, designed states). The founder's call: **bake that workflow as a
standard** so every SKU ships an *intentional, opinionated* brand kit — never a template — the design analog of the copy gate.

**The gap this closes.** The factory had **no design step**. Phase 2 generated *visual assets* (Higgsfield logo/loops) but
never a *design system* (tokens, foundations, components, a brand voice). The copy gate (Phase 3, copywriter-auditor) had no
design counterpart, so visual quality was ad-hoc — exactly why preview #1 came out "B". `web/design-quality.md` already
forbids template UI; nothing in the line *enforced* that a brand kit even exists.

**What's new vs reused (reuse-first).**
- **Reused:** the `design-system/` + first-line `<!-- @dsCard group="..." -->` convention and the `/design-sync` skill
  (sync local cards ↔ claude.ai/design); the `web/design-quality.md` anti-template rules; DOT Navigator's own kit (4 cards,
  synced to the "DOT Navigator Design System" project); per-SKU repo ownership (D4).
- **New (thin glue only):** `scripts/design-check.mjs` — a deterministic, **$0, no-model** structural validator; PRD
  **Phase 2.5** (author/refresh kit via Claude Design → export tokens into the app → validate); `make design-check SKU=…`;
  a one-line `.env.example` pointer. **No new agent.**

**Not a blocker, by design.** Unlike the copywriter-auditor (which can fail the build), `design-check` is **non-blocking and
structural**: it verifies a brand kit *exists, is well-formed (valid @dsCard cards, ≥1 foundation + ≥1 component), and is
wired (`--color-*` tokens in app CSS)* — it does **not** auto-judge aesthetics. Judging beauty stays **Claude-the-model's**
job via Claude Design; mechanizing a taste score risks a flaky gate (same shape-not-truth caveat as the durability gate,
D13/D14). An aesthetic-scoring `factory-design` agent is **named as a future option**, not built.

**The seam.** Design runs **after Phase 2 (core-eng + media), before Phase 3 (copy)** so copy is written *inside* the brand
voice, not bolted on after. Deterministic + $0, so it's free to run every build. **Dogfooded:** `make design-check
SKU=../dot-navigator` passes against the SKU that motivated it.

**Honest limitation (recorded not hidden).** Claude Design has **no generation API yet** — authorship is a human/Claude
handoff via `/design-sync` (the API is "coming weeks" per Anthropic; when it ships, Phase 2.5 becomes a fully automated
stage). The validator proves *structure, not quality*: a SKU can pass `design-check` and still look mediocre — beauty is
**trusted to Claude Design**, not gated. Proven on **one** SKU (DOT Navigator); the standard generalizes the workflow we
just ran, it has not yet run unattended inside `loop.sh`.

## D19 — does-it-for-you / closed-loop: every SKU owns the outcome, NOT horizontal-SaaS-with-AI (2026-06-20)
DOT Navigator shipped and charged (D17/charge-pass), and the founder, staring at the live paid packet, named the gap:
it *tells* a carrier what's due, then makes them go do the hardest part themselves — the exact thing they avoided. "Cool,
not a moat." Three lenses agree: **Hu** (YC) — open-loop *informs*, closed-loop *monitors → acts → keeps you in the loop*;
**Thiel** — own a small market completely by owning the outcome, not selling a feature; **Thomas AI** (YC) — sell the
*outcome that makes/saves money*, not another tool. So we promote "does-it-for-you" from a soft plus to a **hard gate**,
on both the judge and the build sides.

**The gap this closes.** The kill-pass had no closed-loop bar, and `ai_native_test` was explicitly *"a scored plus, NOT a
gate"* (recycled-scan.mjs) — so the factory could (and did) bless an *open-loop, informational* product. Nothing required
a SKU to **do the work** and **keep the user in the loop**.

**Orthogonal to `ai_native_test` (the key nuance).** D19 is NOT "must it use AI?" — that stays a plus (a great non-AI
vertical tool is fine). D19 is "does it **own the outcome / close the loop**, or hand the user another tool to operate with
AI bolted on?" Different axis; both honest. A horizontal dashboard-with-AI now FAILS the gate even though `ai_native_test`
would PASS.

**What's new vs reused.**
- **Reused:** the kill-pass unanimity rollup (R4/R17) — a new bar flows through it for free; the D18 `design-check`
  deterministic-checker pattern; METHOD's existing closed-loop language (which described the *factory*; D19 extends it to
  the *SKUs the factory ships*).
- **New (judge side):** `does_it_for_you` added to BOTH `BARS` and `IDEATION_BARS` — every idea, salvage or net-new, must
  clear it (3 skeptics, unanimous, default-to-kill). Baked into `ideate.workflow.js`: a synthesis filter
  (`does_it_for_you === 'PASS'`) and a 6th skeptic bar. Tests R33 (green; 63/63).
- **New (build side):** `scripts/closed-loop-check.mjs` + `make closed-loop-check` + PRD **Phase 2.6** — the SKU must
  declare its loop in `CLOSED-LOOP.md` (outcome / does / state / keep-in-loop); deterministic, $0, non-blocking by policy
  (the bar judges substance; the check confirms the build *committed* to the loop).

**Honest limitation (recorded not hidden).** Same shape-not-truth caveat as the other bars: `does_it_for_you` is
skeptic-judged, and the build check is *structural* (it verifies the loop was DECLARED, not that it's excellent). And —
pointedly — **DOT Navigator itself FAILS `closed-loop-check` today** (it's open-loop; no `CLOSED-LOOP.md`). That's not a
bug; it's the standard defined *ahead* of the instance (define-then-build): the next pass rebuilds DOT Navigator to clear
the bar (accounts + true-state tracking + pre-filled documents + a next-action engine + proactive reminders — the honest
"does-it-for-you," since FMCSA legally requires the carrier's own signature to file, so we prepare/track/remind/one-click,
never silently auto-submit). The factory now ships moats by construction, not by luck.

## D20 — post-launch operations layer: the agents OPERATE each shipped SKU, not just build it (2026-06-22)

**The gap.** The line was all *pre-launch* — ideate → kill → build → eval → gate → ship → notify → heartbeat — and
stopped the moment a SKU went live. There was no loop that **operates** what shipped, and no registry of what *had*
shipped. IDENTITY.md promises "agents manage, operate, and scale each SKU and track revenue / customer support";
METHOD §6 honestly labelled that future "NAMED, not built." This builds it.

**The decision.** Add a post-launch half to the line, same shape as the rest of the factory: deterministic `.mjs`
cores ($0, no LLM, never hang) with judgment layered on as agents, honest-to-`n/a`, irreversible actions founder-gated.

**What's new.**
- **The registry** (`skus/registry.json` + `skus/schema/sku.schema.json`) — the portfolio object the loop iterates;
  one entry per shipped SKU (repo, live URL, deploy, billing, support source, owning agents, `pending_founder_actions`).
  `secret_env` holds the env-var NAME of a **read-only restricted** Stripe key, never the key (validator rejects a raw key).
- **The operators** (`ops/`): `canary.mjs` (health → OK/SLOW/DEGRADED/DOWN), `revenue.mjs` (Stripe subscription read →
  paying MRR with trials excluded — the honest dollar), `support.mjs` (triage + the irreversible-action andon cord),
  `operate.mjs` (one tick = all three over every live SKU; appends `runs/operate.jsonl`).
- **The agents**: `factory-operator` (Sonnet) drives the tick, narrates, delegates, escalates; `factory-support` (Haiku)
  drafts replies grounded in the SKU's docs. Neither sends money or data; both stop at the founder.
- **Wiring**: `make sku-list|sku-validate|canary|portfolio|support-triage|operate|ops-verify`; `ops-verify` folded into
  `make verify`; a deterministic `operate --brief` snapshot folded into the 6h `heartbeat.sh`.

**Reused.** The deterministic-core-then-LLM-agent split (recycled/*), the $0/`--json`/graceful-degrade conventions
(`usage.mjs`), the founder-gate discipline (D5) applied to refunds/cancellations/data-deletion, the model ladder (MODELS.md).

**Honest limitation (recorded, not hidden).** Revenue is `n/a` until the founder wires a read-only key — **0 paying
customers / $0 today**, reported as exactly that, never fabricated (METHOD §5). Support triage is keyword-deterministic
(default-to-escalate on anything irreversible); the prose draft is the agent's. The first registered SKU, dot-navigator,
is `staged` (TEST mode, not charging) — the loop already watches its live health; it will report real dollars the moment
the founder completes GO-LIVE and flips the D5 gate. The standard is defined ahead of the instance (define-then-build),
same as D18/D19.

## D21 — the chassis: a reusable SKU framework, so SKU #2 is a domain-pack swap (2026-06-22)

**The gap.** "One factory, many products" (D4) was true at the repo level but not the *code* level: DOT Navigator was a
one-off. A second SKU would have been a fork-and-rewrite — no shared spine, no manufacturing-floor scaffold. The
Reusability principle (METHOD §2, the SpaceX-booster discipline) had no concrete artifact.

**The decision.** Extract the proven spine from DOT Navigator into a standalone **chassis** template repo
(`Radix-Obsidian/chassis`) that every SKU inherits, with a single seam — the `DomainPack` — for what makes a SKU itself.

**What's new.**
- **Chassis repo** (Next.js + Stripe + Prisma): the generic spine (passwordless auth, Stripe checkout + the
  founder-gated `assertChargesAllowed` live-charge guard, HMAC entitlement, subscription tiers, Brevo email, idempotent
  reminder scheduler, db) reused unchanged by any SKU. Published as a GitHub **template** repo.
- **The seam** (`domain/contract.ts`): a `DomainPack` = brand + profile fields + reminder cadence + a rules engine
  (`generateWorkItems`) + an artifact registry. The spine reads the active pack via `domain/{brand,index}.ts` and never
  imports a SKU's modules directly — swap two re-exports to re-skin.
- **Reference pack** (`domains/fmcsa`): DOT Navigator's CFR rules engine + document registry + cadence + brand,
  assembled into the contract. A new SKU mirrors this file.
- **Wiring**: PRD Phase 2 now scaffolds SKUs from the chassis (`gh repo create --template`) instead of hand-rolling;
  the legacy empty `The-Native-Factory` repo is explicitly retired (it became H\RNESS).

**Proof.** DOT Navigator reconstituted on the chassis (FMCSA as the active pack) = **63 tests green** (59 spine + 4
contract) + production build green; brand/copy now flow through the pack. The abstraction holds at N=1.

**Honest limitation (recorded, not hidden).** Extracted **conservatively** (YAGNI from N=1): the spine + the
DomainPack contract + brand/copy routing are done and proven; the **UI** (`app/`, `components/`) and the **entity
schema** (`Carrier` + FMCSA columns → generic `Account` + `profile` + `WorkItem`/`Artifact`/`Event`) remain
FMCSA-shaped and are deferred until a real second SKU pulls on them — we abstract on the second instance, not the
first. The chassis is committed locally; pushing the new repo is a founder action (the harness fail-closes on relocating
private code to a new remote — by design).

## D22 — prompt caching is a factory + SKU standard, enforced like the copy gate (2026-06-27)

**The gap.** "Add prompt caching to our LLM calls" had no target: the factory makes **zero** direct Anthropic calls — the
loop (`claude -p`) and the Workflow DSL (`agent()`) run on the Max subscription, and the Claude Code harness **already**
caches them automatically (transcripts show six-figure `cache_read_input_tokens`). The per-token money is in the SKUs,
which *do* call the API directly. One SKU (domuschef) had independently wired a cached chokepoint; the others hadn't, and
there was a *discipline but no standard*: nothing documented the rule, nothing enforced it, nothing measured it, and
nothing carried it into the next SKU.

**The decision.** Promote prompt caching to a named manufacturing standard ([CACHING.md](CACHING.md)), enforced with the
**same machinery as the copy gate** (D-parity with D18/D19): a shared deterministic detector, a write-time hook, a
per-SKU build gate, a tier-1 eval, a measurement view, and chassis propagation. The factory side is *discipline +
visibility* (caching is already on); the SKU side is *mandatory wiring* (route every call through a wrapper that tags the
static `system` block with `cache_control`).

**What's new.**
- **Doctrine:** `CACHING.md` — static-first/varying-last, the two-surface split, the **1024-token floor** caveat, TTL
  guidance, the wrapper mandate.
- **The detector** (`hooks/caching-core.mjs`, pure/$0): classifies a file's call sites as `compliant` / `raw-uncached` /
  `n/a`. One source of truth, imported by all three enforcers (the copy gate's `audit-core.mjs` pattern).
- **Write-time hook** (`hooks/caching-auditor.mjs`, registered in `.claude/settings.json`): **blocks** a raw inline call
  that bypasses a wrapper; **warns** a wrapper call missing `cache_control` (the floor makes "uncached" sometimes
  legitimate, so absence warns, bypass blocks).
- **Per-SKU gate** (`scripts/caching-check.mjs` → `make caching-check SKU=...`, PRD Phase 2.7): deterministic, $0.
- **Tier-1 eval** (`evals/caching-gate.mjs` + `evals/caching-corpus.jsonl` → `make cachingtest`): F1 of the detector vs a
  labeled corpus, gate at F1 ≥ 0.85 — measures the *real* hook.
- **Measurement** (`usage.mjs --cache`): surfaces the factory's cache hit-rate per 5h + 7d window (the "is it working"
  number), reusing the existing transcript aggregation.
- **Propagation** (`chassis/lib/llm.ts` + `llm.test.ts`): the canonical cached `complete()` every future AI SKU inherits
  from the template. **Fetch-based, zero new dependencies** — same posture as the chassis's own `lib/email.ts` (Brevo over
  fetch): the bundle stays light and the unit tests stay dependency-free. The cache breakpoint + no-key guard are baked in;
  it mirrors domuschef's proven `withSystemCacheBreakpoint()`.

**Reused.** The `audit-core` → hook + eval split; the `design-check`/`closed-loop-check` per-SKU deterministic-checker
pattern; `usage.mjs`'s existing `cache_creation`/`cache_read` accounting (already priced at 1.25× / 0.10×); the
founder-gate and $0/`--json`/graceful-degrade conventions; domuschef's proven `complete()` wrapper shape.

**Honest limitation (recorded, not hidden).** (1) **The factory side enables nothing** — caching is already on there; the
work is visibility + prefix hygiene. (2) **The minimum-prefix floor** (1,024 tok Sonnet/Opus, 4,096 tok Haiku) means
`cache_control` is a no-op on every current SKU prompt (all single-shot, ~400–1,050 tok); we mandate *routing through the
wrapper* (auto-engages above the floor / when multi-turn) rather than promising a fixed % saving. (3) **Current SKU
status** (corrected against reality at build time, not the planning snapshot): **domuschef PASSES** — its `complete()`
chokepoint already tags the system block via `withSystemCacheBreakpoint()` (shipped with its own audit spec
`specs/prompt-caching-and-batch-audit.md` + eval), so the detector reads it compliant and the chassis wrapper mirrors that
proven shape. **heatlog is the one real debt** (2 inline `fetch` routes, below floor) — next retrofit pass; dot-navigator
passes (no model calls). Same define-then-build posture as D18/D19; existing SKUs are frozen template snapshots that won't
auto-inherit the chassis wrapper. (4) The detector is a **structural** scan (regex over source), not a type-checker: it
requires Anthropic context (so Twilio's `.messages.create` and system-less health pings are correctly ignored) and a
visible `system:` block, and deliberately does NOT flag spread-param wrappers whose caching transform isn't visible
in-file — high-precision over high-recall, by design.

## D23 — model orchestration layer: route by task, enforce fail-closed (2026-07-06)
**Problem.** Opus reached ~99% of weekly allowance. The tier POLICY (D7/D10, MODELS.md) was already sound — the agent
roster is correctly pinned (copy/operator/support = Sonnet/Haiku, none default to Opus) — but the policy was **prose, not
code**: nothing *blocked* Opus, so it became the lazy default for work outside the tiered agents (interactive chat,
watchers, un-pinned workflow `agent()` calls).

**Decision — make routing executable and fail-closed.**
- **`ops/model-router.mjs`** = single source of truth: a `task-type → rung → model` table + `modelFor`/`rungFor`/
  `isCodeTask`/`isHeavyModel` + the code/non-code agent sets. Default is **Sonnet, never Opus** — unknown work can't climb.
- **`hooks/model-guard.mjs`** (PreToolUse:Task, registered in `.claude/settings.json` beside `fable-budget.mjs`) **blocks
  (exit 2)** any Opus/Fable spend on non-code work: non-code agents (copy/scout/support/operator) may never be overridden
  onto Opus/Fable; a generic agent may use Opus/Fable only for a declared code `task_type`. Only explicit overrides are
  enforced here — the interactive **session** model is governed by the session/watcher convention.
- **Session & watcher tier (MODELS.md):** interactive code sessions = Opus/Sonnet; writing/brainstorm/watch = Sonnet/
  Haiku; watchers/pollers/digests NEVER run in an Opus session — they are Haiku/OpenRouter-free crons. This closes the
  actual leak: the biggest burn was Opus *chat + a 90-min PR-status poll*, not the tiered agents.
- **Pins:** `gtm/demand-probe.workflow.js` copy calls → Sonnet; the OpenClaw heartbeat cron recipe (README §4) repinned
  `anthropic/claude-haiku-4-5` → `openrouter/free` ($0, off the Max allowance), with a defensive `heartbeat.sh` warning if
  `HEARTBEAT_MODEL` is a `claude-*` id (closes the D3-vs-D7 gap; the authoritative pin is the cron recipe + models.json).
- **Enforcement is the spawn-time hook, NOT a loop gate.** `usage.mjs` adds an Opus-runaway *advisory* (always on, so the
  99% is visible in the heartbeat) plus an **opt-in** loop throttle (`CLAUDE_OPUS_GATE=1`, measured on the recent 5h
  window). It is **off by default on purpose** — the 5h proxy is GLOBAL (every `~/.claude` session incl. the interactive
  Opus that D23 permits), so a default-on gate would silently starve the cheap Sonnet loop on unrelated Opus. Adversarial
  review caught this; the fix keeps fail-closed enforcement where it belongs (`hooks/model-guard.mjs`) and makes `loop.sh`
  **alert + bound** any cooldown (`MAX_COOLDOWNS`, distinct exit) so a throttled run can never masquerade as success.

Tests: `make router-test` + `make model-guard-test` (folded into `make verify`); `usage.mjs --claude-gate` passes by
default and throttles only when armed. Supersedes the "policy-only" posture of D7/D10. **Still founder-side (outside this
repo):** demote the global `~/.claude/agents/planner.md` Opus→Sonnet (`sed -i 's/claude-opus/claude-sonnet/'`) and add the
free model to OpenClaw's `models.json` — the in-repo guards fail loud/visible, but the root fix is a founder action.

## D24 — kill Waimd (dot-navigator), reversible-archive + queue salvage (2026-07-27)
**Decision.** Retire the Waimd SKU to refocus on one product. Finish condition: **cut from scope** (the growth-area
report flagged decision-tracking with 0/15 positive outcomes → every redirect now gets an explicit finish condition,
and a deletion-ratio of 0.01 → pruning is now a shipping habit). Per METHOD.md muda + R7 (**never delete — reversible
archive**), killing ≠ deleting.

- **Registry (`skus/registry.json`):** `dot-navigator.status: live → killed` + `killed_at`, `kill_reason`,
  `salvage:"queued"`. Billing/support/gtm fields **retained for audit history** (reversible), not stripped. The
  `pending_founder_actions` now lead with the KILL TEARDOWN.
- **Closed two status blind spots the scout found** (killed SKUs leaked through non-status-gated selectors):
  `ops/registry.mjs billableSkus` and `ops/support.mjs`'s standalone filter both now exclude `killed`, so
  `revenue.mjs`/`support.mjs` stop touching a dead SKU (the `liveSkus`-driven operate/digest/heartbeat already did).
- **Froze the outreach engine — at the chokepoint, every entrypoint.** A shared `gtm/waimd/kill-guard.mjs`
  (fail-closed: killed OR missing OR unreadable) is enforced in `transport.mjs sendOne()` — the one point every
  sender funnels through — so the `daily-send.sh` cron (`send-scheduled.mjs`, `sequence-send.mjs`) is frozen too,
  not just interactive `send.mjs`. (Two review bots caught the first pass: it guarded only send.mjs and failed
  closed only on exceptions, not a missing/renamed entry.)
- **Teardown stays visible.** Killing the SKU drops it from `liveSkus`, which would hide the live Stripe/deploy/
  cron teardown from the operator digest. `ops/digest.mjs` now also surfaces killed SKUs' `pending_founder_actions`
  as `[slug · TEARDOWN]` until the founder sets `teardown_complete:true` in the registry.
- **Salvage queued** in `recycled/BACKLOG.md §5` (own repo → Tier-1 lift-freely): FMCSA calendar engine, MCS-150
  prefill, idempotent reminder scheduler, the FMCSA DomainPack — captured as parts-bin/BuildSpec lifts when
  `../dot-navigator` is added and the `workflow.js` deep-dive runs. Repo stays **label-only/frozen** (never gh-archive/delete).
- **Tests added:** `tests/usage-gate.test.sh` (the D23 spend gate had ZERO coverage) and `tests/waimd-freeze.test.sh`
  (the chokepoint freeze covers every sender entrypoint + teardown stays surfaced) — both folded into `make verify`.

**Founder-gated (live/outward-facing, NOT automated):** stop live Stripe billing / archive prices / handle active subs;
take down or freeze the waimd.org Railway deploy; unset `DOTNAV_STRIPE_RO_KEY` + `WAIMD_*` on the sender host; stop
`gtm/waimd/daily-send.sh` cron. **Still open:** the single new focus ("Haboob") — awaiting a founder brief.

## D25 — repurpose the WAIMD brand for a travel-nurse housing decision engine (new SKU `waimd-housing`) (2026-07-27)
**Decision.** The founder is reusing the **WAIMD brand + waimd.org** — freed by the D24 kill of the FMCSA
`dot-navigator` — for a **different** product: a **travel-nurse housing decision engine** ("Work Assignment. Instant
Move Decision."). A *confirmed* assignment in → **3 evidence-backed housing choices** out, **$29 per decision** (charged
only when 3 viable options are found), **Meta-ads** acquisition, Next.js + Supabase + Stripe on the chassis spine. This
is a **new SKU on the same brand shell, not a revival** — `dot-navigator` stays `killed`.

- **Scope lock (METHOD.md).** One ICP (a nurse who *just accepted* an assignment), one painful moment (solving housing
  on a clock), one outcome (a *decision*, not a search page). Falsifiable gate: **$70 spend ($10/day × 7) → ≥10
  qualified missions → ≥3 paid decisions**; else isolate/pivot/kill. Honest 0 is a valid result.
- **Collision handling (scout-confirmed).** Reuse only the brand + domain. New slug **`waimd-housing`** (the registry
  rejects duplicate slugs) with its **own** `gtm/waimd-housing` engine — **not** `gtm/waimd`, which is the **frozen**
  FMCSA cold-email engine (D24 kill-guard) and the wrong channel for a Meta-ads product. `gtm/waimd/` stays frozen.
- **Registry (`skus/registry.json`).** Added `waimd-housing` (`status:staged`, Stripe **test** $29 one-time,
  `WAIMD_HOUSING_STRIPE_RO_KEY`, support inbox, `railway/waimd-housing-app`) with `pending_founder_actions` for the four
  off-repo steps. `live_url` is intentionally **omitted** while staged — waimd.org still points at the dead FMCSA deploy,
  which must be torn down first. `make sku-validate` green (2 SKUs).
- **The one real gap the scout found — honesty is now enforced in code.** `copywriter-auditor` grades *persuasion*, not
  *truth*. A product whose entire wedge is "we never fabricate" needs a *truth* gate, so added **`hooks/honesty-core.mjs`
  + `hooks/honesty-auditor.mjs`** (PreToolUse sibling of the copywriter gate): blocks, on customer-facing copy,
  **fabricated social proof** (invented customer/review counts, star ratings), **fake scarcity/inventory** ("only N
  left", "N viewing"), and **un-timestamped availability certainty** ("availability confirmed" with no evidence marker).
  Deliberately narrow so it never trips the money-back **guarantee** the copywriter gate *requires*, nor the product's
  own honest "3 choices" language; an auditable `<!-- honesty-ok: … -->` escape hatch covers genuinely backed claims.
  Registered in `.claude/settings.json` + `hooks/hooks.fragment.json`; documented in `.cursorrules`; codifies METHOD.md §5.
- **Spec committed** under `skus/waimd-housing/`: `PRD.md` (product brief — a reconstruction of the founder's brief, not
  a verbatim copy), `BUILD-CHECKLIST.md` (the loop's phased acceptance list + the deterministic **5-gate / 100-pt**
  engine + the **LISTED→CHECKED→CONFIRMED** fail-closed evidence model), and `registry_entry.json`. Seeded
  `ops/inbox/waimd-housing.jsonl` so the generic D20 operate/support loop picks the SKU up once live.
- **Tests.** `tests/honesty-auditor.test.sh` (11 cases: blocks the three fabrication classes, passes evidenced copy /
  the money-back guarantee / the product's "3 choices" wording / non-copy files / the override) — folded into
  `make verify` as `honesty-auditor-test`.

**Founder-gated (off-repo, NOT automated):** create the private product repo from the chassis template (D21); detach
waimd.org from `dot-navigator-app` and tear down that FMCSA deploy before attaching it to `waimd-housing-app`; set the
Meta ad account to the **Housing Special Ad Category** and authorize the **$70** validation cap; flip Stripe test→live
with `PUBLISH_APPROVAL_TOKEN` only after the vertical slice passes (D5). Supersedes the D24 "still open — awaiting a
founder brief": the brief arrived, and it's WAIMD 2.0.

## D26 — the real PRD v0.1 lands, supersedes the D25 reconstruction (2026-07-31)
**Problem.** D25 stood up `waimd-housing` from a **reconstruction** of the founder's brief (the verbatim text wasn't in
context) — flagged as such at the time. The founder has now sent the **actual PRD v0.1** plus the VOCO OS state block.
It is materially sharper than the reconstruction and **contradicts it where it matters**, so the reconstruction is
replaced rather than patched, and the deltas are recorded here so the correction is auditable instead of a silent
overwrite.

**`skus/waimd-housing/PRD.md` is now the founder's verbatim text** (state block + §0–§32 + the constitution line:
*"WAIMD transforms a travel nurse's accepted assignment into three evidence-backed housing choices. Nothing else until
strangers pay for that outcome."*). It is the canonical spec — where any derived artifact disagrees, the PRD wins.

**Six substantive deltas the reconstruction got wrong** (all now corrected in the registry + `BUILD-CHECKLIST.md`):
1. **Monetization is freemium, not pay-on-success.** §15: free = mission + **Match #1 preview**; **$29 unlocks the full
   3-choice Decision**; $0 if fewer than three qualify. D25 registered a flat "charged only if 3 found" and lost the
   preview paywall — which is the funnel's pivot (`preview_viewed` → `checkout_started`).
2. **Founder-in-the-loop is a designed feature with its own surface.** §18 + §28: for the first 10–50 missions the
   founder does the hard verification, and every intervention is **labeled data** (`manual_reason` enum) that becomes
   the automation backlog ("don't automate guesses; automate observed work"). The **Admin Mission Queue** was missing
   entirely — now Day 3 of the build.
3. **The data model is specified.** §27: `missions`, `requirements`, `candidates`, `candidate_requirements`,
   `interventions`, `orders`, and **no landlord table** (intentional). D25 invented a per-fact `candidate_facts` and a
   `decisions` table and dropped three real ones; evidence lives on the candidate (`evidence_status`,
   `evidence_checked_at`).
4. **Qualification is a hard gate.** §7 Screen 2: "not yet accepted" is a **dead end** — no newsletter funnel, no
   generic leads, "no contamination of the experiment."
5. **Metrics and kill criteria are numeric** (§23/§24), not one vague gate: CAC ≤ **$14**, solvability ≥ **80%**, paid
   decision rate ≥ **30%**; four verdicts (kill acquisition / kill proposition / investigate / continue).
6. **Supply is $0 and compliance-bounded.** §17: **do not scrape sources whose terms prohibit it** — public/authorized
   data plus founder verification only. Left unstated, a builder agent writes a scraper; it is now a standing
   constraint in the checklist and the registry.

**Made the kill criteria executable — `ops/waimd-gate.mjs` + `make waimd-gate`.** D24's own finding was
decision-tracking at **0/15 positive outcomes** because finish conditions were prose that never fired. This gate is
deterministic, read-only, $0 (no model, no network): it computes the §23 metrics and returns the §24 verdict, exiting
**non-zero on a KILL** so a kill can't be mistaken for a pass. Missing metrics → "no data yet" (never a false verdict);
malformed → loud exit 2. `tests/waimd-gate.test.sh` (15 cases: all four verdicts, the early-verdict boundaries, the
metric math, inclusive targets, and the robustness paths).

**Hardened the honesty gate against three fabrications the founder names explicitly** (§11, §19) — all three were
confirmed **allowed** by probe before the fix:
- **CONFIRMED-tiering (§11).** "Availability confirmed" now requires **CONFIRMED-grade** evidence — the uppercase state
  token or an explicit landlord/property-rep confirmation. A bare date, `LISTED`, or `CHECKED` no longer authorizes it
  ("never turn a stale calendar into fake certainty"). *Real bug found and fixed while building this:* the first pass
  used a case-insensitive `\bCONFIRMED\b`, so the lowercase "confirmed" **inside the very phrase being gated**
  satisfied its own guard. Evidence-state tokens are now matched case-**sensitively**; timestamps stay insensitive.
- **Invented "verified" badges (§19)** — "✓ Verified landlord", "every listing is verified" with nothing behind it.
- **Fabricated personas (§19 "no fake nurses")** — quoted testimonials attributed to a named nurse/customer.
Test grew 11 → **19 cases**, including regression-locks that the §12 Decision Card ("Availability: CHECKED · source
last checked 2h 14m ago"), landlord-confirmed copy, the money-back guarantee the copywriter gate *requires*, and the
product's honest "3 choices" language all still pass. `.cursorrules` updated.

**D22 caching-check is satisfied at zero call sites, by design.** §26 pins *no paid LLM on the critical path* (the
first decision engine is deterministic; §13 forbids a fake "AI score"). Verified: `scripts/caching-check.mjs` exits 0
with "no direct Anthropic calls (nothing to cache)". Recorded in the registry and the checklist so nobody "fixes" the
checker by **adding** an LLM to the critical path — that would violate §26 and burn the pool.

**Haboob is on hold** (founder instruction). `skus/haboob/` stays an untouched DRAFT; it never entered
`skus/registry.json`, so there is nothing to pause or tear down. `waimd-housing` is the single active focus — this is
the answer to D24's "still open" item, now confirmed by the founder rather than inferred.

**Unchanged and still founder-gated:** the product repo (D21), the waimd.org repoint (tear down `dot-navigator-app`
first), the Meta Housing Special Ad Category + the **$70** cap, and the Stripe test→live flip (D5). The PRD's own NEXT
DECISION GATE — *"Founder approves PRD + authorizes maximum $70 Meta validation spend"* — is the founder's; nothing in
this commit spends, publishes, or charges. *(Superseded in part by D27: payments moved to Polar.)*

## D27 — PRD approved, $70 withheld; prove the engine, move off Stripe (2026-07-31)
**Decision.** The founder **approved the PRD** and **split the NEXT DECISION GATE in two**: approval is granted, but the
**$70 Meta authorization is withheld** until *"the finished beta has been tested / evals have been tested / everything's
tested / stable on a production-grade level."* That is the PRD's own Definition of Done, so it is adopted as a hard
precondition rather than treated as extra caution.

**Three founder overrides to the approved PRD.** `PRD.md` stays **byte-identical** (it is the verbatim constitution);
deviations live in the derived artifacts and here.
1. **Polar replaces Stripe** (PRD §15/§26 name Stripe Checkout). **Reason: Stripe was compromised — an issue that
   occurred on Stripe's end — and Stripe declined to help resolve it.** Polar is the paywall gateway for this SKU and
   the portfolio going forward.
2. **Prisma this stage → scale into Supabase Postgres** (PRD §26 names Supabase from day one). A datasource swap, not a
   rewrite. **Recorded assumption:** "Prism" is read as **Prisma ORM**; if Stoplight Prism was meant, `data_layer` in
   the registry is wrong. It does not affect this commit — the engine is persistence-free.
3. **Meta deferred** until the beta is built and fully tested.

**Built the engine, and proved it before the beta exists.** The product repo is still founder-gated, so the part that
must never be wrong was built where it can be tested today: `skus/waimd-housing/engine/` — the five gates (§10), the
100-pt score (§13), max-3 + $0-under-3 (§14/§15), and the LISTED→CHECKED→CONFIRMED ladder (§11). Pure, zero-dependency,
no I/O, no LLM, and it **never reads the clock** (every entry point takes an explicit `asOf`), which is what makes a
decision reproducible and auditable. Written in **real TypeScript executed natively by Node 22** — deliberately *not*
the `skus/haboob/*.ts` pattern, which is staged TypeScript that no Makefile target or eval ever runs and whose tests
cover a different `.mjs` file. This engine ports **verbatim** into the product repo.
- **`make waimd-engine-test`** — 29 tests: determinism (identical output over 50 runs), each gate's rejection, **gate
  precedence** (earliest failure wins), fail-closed evidence (stale/malformed/future timestamps and unknown states all
  collapse to LISTED; a state can never outrank its input), weights sum to 100, **score cannot be injected**, ranking is
  a deterministic total order under shuffling, and `paid` cannot be forged by the input.
- **`make waimd-eval`** — tier-1 eval over a 35-case labeled corpus in the existing `eval-regex-gate.mjs` shape,
  importing the **same engine the product ships**: F1 **100%**, and **gate-attribution 100%** (a candidate rejected for
  the *wrong reason* is a bug even when the verdict is right — §13 debuggability).

**`make waimd-ready` — the pre-$70 gate.** Turns the founder's four conditions into a verdict nobody has to take on
trust, including me. 15 blocking checks (spec, registry, engine, eval, honesty gate, kill gate, ops, product repo, beta
slice, e2e on the 3 synthetic missions, payments, TEST mode, D18/D19/D22). **Fail-closed:** missing evidence is RED not
"probably fine"; **AMBER also blocks** (unproven ≠ proven); it **cannot go green while the product repo or beta is
absent**; and it exits non-zero so NOT READY can never read as approval. Today: **8/15 green, NOT READY** — the honest
state. `tests/waimd-ready.test.sh` asserts the *properties* (verdict/exit-code agreement, no-repo⇒never-ready,
read-only) rather than today's output.

**Moving off Stripe exposed four real defects in the factory — Polar was not a config swap:**
- `skus/schema/sku.schema.json` — the provider enum was `["stripe","none"]`; **`polar` was invalid** under the canonical
  contract. Now `["stripe","polar","none"]`.
- `ops/registry.mjs:41` — only `provider === 'stripe'` required `secret_env`, so a Polar SKU would have **silently lost
  the key-hygiene requirement**. Replaced with a `PAID_PROVIDERS` set.
- `ops/registry.mjs:42` — the raw-key guard was Stripe-shaped (`sk_(live|test)_`), so a pasted `polar_oat_…` token
  **would have committed cleanly**. Now provider-agnostic. *Bug found while building it:* the first version was
  case-insensitive and flagged its own env var **name** (`WAIMD_HOUSING_POLAR_RO_KEY` contains `POLAR_RO`), rejecting a
  valid registry. Real credentials use lowercase prefixes and env var names are UPPER_SNAKE, so the guard is now
  case-sensitive.
- `ops/revenue.mjs` — hardcoded to `api.stripe.com` and keyed off `secret_env` alone. Once `WAIMD_HOUSING_POLAR_RO_KEY`
  is set it would have **sent a Polar credential to Stripe**. Now gated on `provider === 'stripe'`, reporting
  `n/a — polar revenue reader not implemented` instead. Given *why* we left Stripe, shipping a credential to them would
  have been the worst possible version of this bug. Covered by three new `ops/ops.test.mjs` cases.
- **Not built:** a Polar revenue reader. No credentials exist, so it could not be honestly tested — and `revenue.mjs`
  reads **subscriptions only**, which cannot measure a one-time $29 SKU regardless. Both are recorded follow-ups.

**⚠ Open founder action, now security-relevant.** The killed `dot-navigator` SKU still carries `billing.mode: "live"`
and a `DOTNAV_STRIPE_RO_KEY` reference, and its D24 teardown ("stop live Stripe billing / archive prices") is still
open. With Stripe compromised, **revoking that key and stopping that billing is no longer housekeeping**. It remains
surfaced by `ops/digest.mjs` as `[dot-navigator · TEARDOWN]` until `teardown_complete: true`.

**Still blocked, and why:** the Next.js app, intake screens, Decision page, Admin Mission Queue, Prisma schema, Polar
checkout, Meta instrumentation, and the §32 Day-6 end-to-end run all require the product repo and accounts that do not
exist yet. Nothing outward-facing happened in this commit: no repo created, no spend, no publish, no charge.

## D28 — kill every Stripe paywall; Prisma confirmed (2026-07-31)
**Decision.** Founder: *"I meant Prisma, kill all stripe paywalls."* D27 moved the **new** SKU to Polar but left the
**old** paywall standing: `dot-navigator` was `status: killed` yet still carried `billing.provider: stripe` with
**`mode: "live"`** and an un-revoked `DOTNAV_STRIPE_RO_KEY`. A killed SKU with a live paywall is exactly the gap an
attacker keeps — and Stripe is the compromised provider. It is now dead in-repo and **structurally impossible to
resurrect**.

- **`dot-navigator` billing → `mode: "killed"`.** The entry is *retained*, not stripped (R7 reversible archive): the
  model, price, and `secret_env` stay as **history**, annotated `paywall_killed_at` + `revocation_status:
  "PENDING_FOUNDER"`. Nothing may charge through it.
- **Enforced, not documented — `RETIRED_PROVIDERS` in `ops/registry.mjs`.** A `stripe` provider in **any** mode other
  than `killed` is now a **validation error**. Wiring a new Stripe paywall, or flipping this one back, fails
  `make sku-validate` — and therefore `make verify`, `ops-verify`, and `make waimd-ready`. Retiring a provider is a
  one-line addition to that set. Schema `billing.mode` enum gains `"killed"`.
- **`deploy-guard.sh` learned the current gateway.** It refused live *Stripe* keys on the autonomous preview path but
  knew nothing about **Polar** — so after D27 it would have waved a live Polar token straight through. It now refuses
  live tokens from either provider (`POLAR_ACCESS_TOKEN` / `WAIMD_HOUSING_POLAR_RO_KEY`), while still allowing sandbox
  tokens. A guard that only recognises the *retired* provider is not a guard. (+3 cases in `tests/guard.test.sh`.)
- **Tests (`ops/ops.test.mjs`):** a stripe paywall in `live`/`test`/unset mode is rejected and cites the retirement; a
  `killed` stripe entry still validates (history must survive); and a standing assertion that **the shipped registry
  contains no live stripe paywall** — so this can never silently regress.
- **Docs de-fanged:** `.env.example` marks `STRIPE_*` **RETIRED — leave empty** (kept declared only so deploy-guard
  keeps refusing a leftover key on a host); `ops/README.md` no longer instructs the founder to paste `rk_live_…` and
  now states plainly that `make portfolio` reports `n/a` for Polar because **no Polar revenue reader exists yet** —
  honest, not broken.

**🔴 The one thing code cannot do.** `mode: "killed"` stops *this repo* from charging. It does **not** revoke anything
on Stripe's side. **Open founder action, now the top entry in `dot-navigator.pending_founder_actions`:** revoke
`DOTNAV_STRIPE_RO_KEY` in the Stripe dashboard, archive the $9/$39 prices, settle anything in flight, and unset
`DOTNAV_STRIPE_RO_KEY` + `STRIPE_SECRET_KEY` on every host. Until then a live credential exists at a provider we no
longer trust. `ops/digest.mjs` keeps surfacing it as `[dot-navigator · TEARDOWN]` until `teardown_complete: true`.

**Prisma confirmed.** The D27 assumption was right — "Prism" = **Prisma ORM** (SQLite this stage → Supabase Postgres,
a datasource swap). Hedging removed from the registry, the mirror entry, and the checklist; the Day-2 build item now
says Prisma schema rather than Supabase schema. The decision engine remains persistence-free, so this touches no
engine code.

## D29 — Stripe teardown: automate everything except the click; gate the flags on evidence (2026-07-31)
**Problem.** The founder asked the factory to perform the revocation. It cannot: **Stripe exposes no API for revoking
an API key** — creation, rolling and deletion are Dashboard-only, by Stripe's design. No connector, credential, or
third-party tool changes that. (This session also has no Stripe auth, and the container has no `.env` and no Stripe
vars set — checked, not assumed.) The remaining risk was subtler: `teardown_complete` would have been flipped on the
founder's say-so, so the registry would assert a revoked credential it had never verified — exactly the fabricated
certainty the honesty charter exists to prevent.

**Decision — `ops/stripe-teardown.mjs` + `make stripe-audit` / `make stripe-verify`.** Deterministic, read-only
against Stripe, $0, and it never prints, logs, writes, or commits the key (read from the env var named by the
registry's `secret_env`, on the founder's host).
- **`audit`** (run BEFORE revoking, while the key still works) enumerates what is genuinely still live: active
  subscriptions, un-archived prices/products, payments in flight, enabled webhook endpoints. **Fail-closed:** any
  probe it cannot read — scope error, outage, already-revoked key — is reported **UNVERIFIED**, and unverified alone
  is enough to block a "clear" verdict. It states explicitly that **API keys cannot be enumerated via the API**, so
  it never implies it covered them.
- **`verify`** (run AFTER revoking) makes one authenticated read. **Only a genuine `401 invalid_api_key` counts as
  proof**, and `mayFlipTeardown()` is the single gate on writing the registry. `200` ⇒ the key is STILL LIVE, refuse,
  change nothing. Timeout/`5xx`/network ⇒ INDETERMINATE, change nothing. A non-answer is never proof.
- **The subtle case, handled:** a **403** means the request lacked scope but the credential *authenticated* — so
  verification treats 403 as **STILL_LIVE**, not as "couldn't tell". Auditing treats the same 403 as UNVERIFIED.
  Same status, two correct readings, because the questions differ.
- On proof only: `revocation_status: PENDING_FOUNDER → REVOKED`, `revoked_at`, `teardown_complete: true` — which is
  also what retires the `[dot-navigator · TEARDOWN]` line from the operator digest.

**Tests — `tests/stripe-teardown.test.mjs` (15 cases, injected fetch, no network).** Every status maps to the right
verdict; `mayFlipTeardown` rejects everything except `REVOKED`; the key never appears in any output; unverified alone
blocks "clear"; `applyRevocation` retains `secret_env`/`mode:killed` as history (R7) rather than stripping them; and a
standing assertion that **the shipped registry still shows `teardown_complete: false`** — a guard against anyone,
including me, marking this done before it is proven. `make stripe-teardown-test` folds into `make verify`;
`stripe-audit`/`stripe-verify` deliberately do **not** (they need live credentials and must never run in CI).

**Honest limits.** The live network paths cannot be exercised here — there is no key, and I should never hold one.
Only the fail-closed no-key path was run end-to-end (INDETERMINATE, exit 2, registry byte-identical). Everything else
is proven against an injected fetch.

**`yc-software/qm` assessed and set aside.** Offered as help for this task. It is real and reputable — *"a multiplayer
agent harness for work. In Slack and on the web"*, TypeScript/Fastify/Postgres, MIT, ~4.2k stars — but it has no
Stripe integration, no payments code, and no revocation capability. It cannot perform this task, and adopting an
unvetted agent harness during an active credential incident would be scope creep in the wrong direction. Worth
evaluating on its own merits as a factory component later; recorded here so the decision is traceable rather than
silently dropped.

**Still the founder's, unchanged:** roll/delete the key, archive the $9/$39 prices, settle anything in flight, unset
the host vars — and, because this was a compromise rather than a migration, roll *every* key and check Developers →
API keys and Webhooks for anything not created by us. `teardown_complete` stays **false** until `make stripe-verify`
proves otherwise.
