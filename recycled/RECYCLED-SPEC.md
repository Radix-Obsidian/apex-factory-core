# RECYCLED-SPEC — Factory salvage harness (Phase A)

Spec-driven definition of "done" for Recycled, mirroring the factory's [SPEC.md](../SPEC.md):
acceptance criteria are mechanical (`make recycled-verify`) so each slice is *proven*, not asserted.

## Frame
Recycled is a **read-only** multi-agent harness. It scans dead/dormant repos and salvages the proven
**capability** the code embodies (not the dead product) into a ranked set of build-ready opportunities,
and catalogs reusable proven modules into a shared parts-bin. It only SPECS and EXTRACTS. It never
builds, never charges, **never deletes**. The factory builds; the founder charges. Three separate gates.

## The pipeline (stages, in order)
0. **Enumerate + gate** — deterministic (`recycled-scan.mjs`): list repos, classify by age, license-gate Tier-2 → `00-targets.jsonl`
1. **Inventory + classify** — `code-explorer` per system → LIVE/DORMANT/DEAD-LEGACY/TRULY-DEAD → `01-inventory.jsonl`
2. **Capability extraction** — `refactor-cleaner` + `code-architect` per dormant module → `02-capabilities.jsonl`
3. **Opportunity mapping** — `code-architect` per capability → `03-opportunities.jsonl`
3.5. **Ground-truth sweep (S1 Market-Intelligence)** — a live web sweep per candidate (named competitors + demand evidence + sources) → `07-ground-truth.jsonl`. **Fail-closed gate:** an inadmissible packet KILLs the candidate before any skeptic runs. This is the *cure for the competitive-blindness defect* caught 2026-06-16 (the stock scout false-SURVIVEd commodity because the skeptic had zero market awareness).
4. **Adversarial kill-pass** — 3 `code-reviewer` skeptics per candidate, **judging `is_zero_to_one` + `real_demand` against the ground-truth, not the candidate's self-claims** → `04-verdicts.jsonl`
4.5. **Durability + first-principles gate (D13/D14)** — per kill-pass survivor: Thiel's 7 questions (≥6/7 → `durability_pass`) + Elon's first-principles (`reasoned_from_fundamentals` core + ≥2/3 → `first_principles_pass`), judged against the live ground-truth → `08-durability.jsonl`. **BOTH must pass to be build-eligible** (fail-closed); only build-eligible survivors reach Stage 5.
5. **Build-spec output** — deterministic synth → `05-buildspecs.jsonl`, `parts-bin/index.jsonl`, `06-frozen-archive.jsonl`

Artifacts land under `runs/recycled/<run-id>/` (gitignored). Schemas in [schemas/](schemas/) are the output contracts.

## The cost funnel (a tournament, not a survey)

Deep-dive ≈ **2M tokens/repo**; hit rate ≈ **1-in-5** even on our own repos. So the expensive deep-dive is the *rare last step*, reached only by escalation through cheaper tiers — each killing the majority. All three are Workflow-tool scripts (run by the orchestrating agent; they read source only through the deterministic floor, no clone):

| Tier | Script | Cost/repo | What it does | Escalation gate |
| --- | --- | --- | --- | --- |
| 0 — triage | `triage.js` | ~10K tok (Haiku) | builtness + `salvage_worthiness` skim, no product analysis | optimistic — superseded by the scout |
| 1 — scout | `scout.js` | ~150-250K tok | 1 capability → 1 candidate → **1 ruthless skeptic** on the broadened bar (default-to-kill) | `scout.verdict == SURVIVE` (skeptic clears all 5 bars at confidence ≥ 0.6) |
| 2 — deep-dive | `workflow.js` | ~2M tok | full 5-stage pipeline, **3 skeptics**/candidate | the BuildSpec(s) + honest-greenlight gate |

The scout's single-skeptic SURVIVE is a far better deep-dive predictor than triage's `salvage_worthiness` (which rated Herday-AI 4/5 → deep-dive killed it 8/8). Run order: `scan` (Stage 0, $0) → `scout` over the targets → `deep-dive` only the scout's `escalate` list. Pass `args.tier='2'` to the scout for external repos so its skeptic also applies the license gate.

## Corpus tiers
- **Tier 1** — own dormant repos. Owned → lift freely (`license: "OWN"`, bypasses the external gate).
- **Tier 2** — license-gated permissive public repos. Must pass `licenseGate(spdx, 2)` = LIFT-OK before entering Stage 1.

## Acceptance criteria (mechanical)
| # | Criterion | Proof |
|---|-----------|-------|
| R1 | `licenseGate()`: GPL/AGPL/SSPL→REJECT, MIT/Apache/BSD/ISC/Unlicense/CC0→LIFT-OK, MPL/LGPL→IDEA-ONLY, null+tier2→REJECT, null+tier1→OWN, unknown→REJECT | `make recycled-verify` (R1) |
| R2 | source manifest excludes node_modules/dist/.next/build/out/vendor/coverage/.git from every repo | R2 (fixture assert) |
| R3 | trees API `.truncated:true` → fallback path, never returns a silently partial manifest | R3 |
| R4 | kill-pass rollup: SURVIVE iff all 3 skeptics SURVIVE on all 5 bars; any KILL/abstain/confidence<0.6 → KILL (default-to-kill) | R4 |
| R5 | ≤1 BuildSpec per `source_repo` (ruthless dedupe by rank) | R5 |
| R6 | every BuildSpec `extract_list` path resolves in source (no hallucinated lifts) | R6 |
| R7 | every FrozenArchiveNote has `archive_action:"label-only"` and `reversible:true` (never delete) | R7 |
| R8 | end-to-end dry run on the 2-repo fixture → all 6 JSONL artifacts, **$0 LLM** (stubbed) | R8 |
| R16 | `groundTruthAdmissible()`: fail-closed — missing/uncited/empty-without-attestation/stale/future packet → inadmissible; only a fresh, sourced, competitor-bearing (or attested-empty) packet is admissible | `make recycled-verify` (R16) |
| R17 | `rollupVerdictGrounded()`: inadmissible ground-truth short-circuits to KILL *before* skeptics are weighed (a blind run can never SURVIVE); admissible packet still honors default-to-kill | R17 |
| R18 | `scoreSevenQuestions()` (Thiel, D13): ≥6 of 7 → `durability_pass`; missing/malformed answers default-to-fail | `make recycled-verify` (R18) |
| R19 | `scoreFirstPrinciples()` (Elon, D14): `reasoned_from_fundamentals` core non-negotiable + ≥2/3 → `first_principles_pass`; analogy-only fails even at 2/3; null fail-closed | R19 |
| R20 | `evaluateGreenlight()` requires BOTH `durability_pass` AND `first_principles_pass` — a kill-pass-clean, paths-verified spec is REJECTED without them | R20 |
| R21 | `makeOutcome()` (D15): validates + normalizes at the boundary — coerces `revenue`, trims `candidate_id`, rejects bad label / negative revenue / empty id / non-ISO `checked_at` | `make recycled-verify` (R21) |
| R22 | `latestByCandidate()` + `summarizeOutcomes()` (D15): append-only log → current state (latest `checked_at` wins per candidate); descriptive counts; inputs not mutated | R22 |
| R23 | `killRate()` (D16): rollup rows only; KILL/SURVIVE/rate; `rate:null` on no decisions (no 0/0=NaN) | `make recycled-verify` (R23) |
| R24 | `failureReasonDistribution()` (D16): bar keys read DYNAMICALLY across schema drift (`ai_native_not_feature`+`real_demand` both counted); gate kills bucketed; a skeptic-driven rollup KILL is NOT a gate kill | R24 |
| R25 | `greenlightYield()` (D16): fraction when candidates>0; `yield:null` on 0 candidates (no divide-by-zero, no fake denominator) | R25 |
| R26 | `durabilityPassRate()` (D16): pass counts; `n:0` cleanly on empty (no rate over nothing) | R26 |
| R27 | `aggregateRuns()` + `buildMetricsReport()` (D16): injectable reader; assembles KPIs with honest `null`/`n/a` gaps (ideas/greenlight undefined at 0; durability note on empty) | R27 |
| R9 | `projectCandidates()`: thin shape; OWN→`license_human_confirmed:true`, Tier-2→`false`; `consumed:false` | R9 |
| R10 | `eligibleTopCandidate()`: lowest rank among unconsumed + license-confirmed; `null` when dry | R10 |
| R11 | `mergeCandidates()`: dedupe by `spec_id`; re-projection never un-consumes; inputs not mutated | R11 |
| R12 | `markConsumed()`: sets `consumed` on the target only; returns a new array (immutable) | R12 |

R1, R4, R7 are pure-function units — instant, deterministic, the guardrail tests to trust absolutely.

## The kill-pass bar (broadened — LOCKED 2026-06-12)

A winner is **defensible + vertical + real demand + legally liftable.** An AI-native angle is a **strong plus, not a gate** — the factory's edge is its autonomous AI-native *build process*, not product-category purity (a16z/YC RFS fund more than pure-AI plays). The 5 kill-pass bars each skeptic judges:

1. **not_frankenstein** — a clean capability lift, not a forced re-stitch of the dead product.
2. **not_horizontal_sprawl** — a focused vertical, not a generic horizontal tool.
3. **real_demand** — real, evidenced market pull with a specific ICP who'd pay, not a solution in search of a problem.
4. **is_zero_to_one** — genuinely new / defensibly differentiated, not a crowded me-too.
5. **salvage_cheaper_than_rebuild** — salvaging actually beats rebuilding clean (the most common silent kill).

**Bars 3–4 are judged against LIVE ground-truth, never the candidate's self-claims.** Before the kill-pass, a per-candidate ground-truth sweep (S1 Market-Intelligence) establishes the named competitors + demand evidence + sources. The verdict is **inadmissible without a fresh, sourced packet** (`groundTruthAdmissible`, R16) — fail-closed to KILL. This is the encoded cure for the competitive-blindness defect: on 2026-06-16 the stock scout false-SURVIVEd a thesis we had already KILLED that week, purely because the skeptic had no market awareness. The ground-truth packets persist to `07-ground-truth.jsonl`, seeding the dated-verdict **corpus** (the compounding Market-Intelligence moat).

`ai_native_test` is still recorded on every candidate as a **scored plus** (informational), but it is no longer a kill bar.

## The durability + first-principles gate (D13/D14 — "is the BUSINESS durable, and reasoned from fundamentals?")

The 5 kill-pass bars ask *"is the code good?"*. They do not ask whether the **business** is durable or whether the thesis
is reduced to fundamentals — the gap a Thiel brutal bar exposed (it killed our own consumer thesis at ~3/7). So every
kill-pass survivor faces two more gates before it is **build-eligible**, judged against the same live ground-truth packet:

- **Thiel's 7 questions (D13):** *Engineering* (≥10x tech, not marginal) · *Timing* · *Monopoly* (big share of a small
  market) · *People* · *Distribution* · *Durability* (defensible 10–20 yrs) · *Secret*. **≥6 of 7** → `durability_pass`.
- **Elon's first-principles (D14):** `reasoned_from_fundamentals` (the **non-negotiable core** — NOT analogy/me-too) +
  `requirements_questioned` + `irreducible`. Core + **≥2 of 3** → `first_principles_pass`.

BOTH must pass; default-to-fail on a missing/empty scorecard (fail-closed). Mechanized like the kill-pass bars: tested
pure fns `scoreSevenQuestions`/`scoreFirstPrinciples` (R18/R19) + inline mirrors in `workflow.js` (Durability phase).
The build-phase **Musk 5-step algorithm** (requirements-less-dumb → delete → simplify → accelerate → automate-last) is
doctrine the build agents apply downstream. Scorecards persist to `08-durability.jsonl` (the seed of the learning corpus).

## The honest-greenlight gate (first real run = the founder's bar)
A run PASSES iff `honest_greenlight >= 1`. A greenlight is **honest** iff:
1. its candidate survived Stage 4 — all 3 skeptics SURVIVE on all 5 bars;
2. `hours_saved_vs_rebuild >= 3` (clears the silent killer, not squeaks);
3. `zero_to_one_rank == "true-zero-to-one"` (AI-native is a plus, not required);
4. every `extract_list` path verified present in the source repo;
5. **`durability_pass`** — clears Thiel's 7 questions (≥6/7) (D13);
6. **`first_principles_pass`** — reduced to fundamentals, not analogy/me-too (D14).

**Zero honest greenlights is a valid, honest outcome** — report "corpus yielded no build-ready
opportunity this pass." Never manufacture a weak greenlight to make the run look productive.

## Guardrails (encoded, not advisory)
- Salvage capability, never resurrect a dead product (Frankenstein = auto-kill).
- ≤1 greenlit build per repo; default-to-kill on doubt.
- Defensible + vertical + real demand + legally liftable; AI-native is a strong plus, not a gate.
- Never delete — truly-dead code gets a label-only frozen note; Recycled never runs `gh repo archive`/delete.
- License-gate fail-closed on all Tier-2 code before Stage 1.
- **Ground-truth fail-closed on every candidate before the kill-pass** — the skeptic judges novelty + demand against the live landscape, never the candidate's self-claims; a missing/uncited/stale packet → KILL. The line can never again go competitively blind.
- Tier-2 BuildSpecs carry `license_human_confirmed:false` — a hard blocker the factory must clear before building (Phase B).

## Factory consumption (Phase B core — WIRED 2026-06-13)

The connective tissue that makes Recycled part of manufacturing. Deterministic, pure-function, tested (R9–R12).

- **Projection.** After a deep-dive, `node recycled/recycled-scan.mjs candidates project <run-id>` reads that
  run's `05-buildspecs.jsonl` + `greenlight.json`, projects **only the honest greenlights** into a thin ranked
  record each, and merges them into `recycled-candidates.jsonl` at the control-plane root. Re-projection
  refreshes fields but **never un-consumes** a spent candidate. OWN/Tier-1 specs are `license_human_confirmed:true`;
  Tier-2 external specs are `false` until a human clears the gate (they are not eligible until then).
- **Consumption (the build loop's Phase-1 pre-step, in `PRD.md`).** The loop runs `candidates next`:
  if it prints a candidate (lowest rank among unconsumed + license-confirmed), the loop adopts it as the SKU
  thesis and skips blind trend-discovery, then `candidates consume <spec_id>` marks it spent. Empty output =
  queue dry → the loop falls through to normal trend discovery. **Non-destructive: an empty queue changes nothing.**
- The queue file is version-controlled with the control plane so the loop's isolated worktree sees it; projection
  runs on the main tree (where `runs/` exists), the loop only `next`/`consume`s the committed queue.

## Outcome-capture — the learning-loop moat seed (D15, R21/R22)

The brutal bar's hardest finding: this corpus is **data-access, not data-advantage** — it stores judgments, zero
outcomes. Outcome-capture wires the proprietary, non-re-scrapable layer (private idea → judgment → outcome pairs) so it
**starts compounding from observation #1**, before the platform ships. It is a separate facility, not a pipeline stage.

- **Artifact.** Append-only `recycled-outcomes.jsonl` at the control-plane root (tracked, like the candidates queue —
  the corpus *is* the asset), keyed by `candidate_id`. Contract: [schemas/outcome-record.schema.json](schemas/outcome-record.schema.json).
  Deliberately **separate from the kill-pass verdict** — a skeptic judging in-the-moment cannot know the future.
- **CLI.** `recycled-scan.mjs outcome <candidate_id> <made_money|failed|unknown> [revenue]` logs an observation;
  `outcome list` shows latest-per-candidate; `outcome stats` prints descriptive counts. Accepts **any** judged
  `candidate_id`, not just queued greenlights — the highest-value signal is a **KILL someone else shipped and
  monetized** (a false kill), which only the kills can teach.
- **Honest limit.** This only *seeds* capture. The kill-accuracy bake-off needs a verdict↔outcome join at labeled
  volume that does not exist yet, so `stats` prints an explicit "NOT a calibration claim" disclaimer. We claim we
  started earning a moat, not that we have one. The founder is observer #1 (logging our own theses' fates).

## Cross-run metrics — the kaizen instrument (D16, R23–R27)

The manufacturing standard ([DECISIONS.md](../DECISIONS.md) D16) is made **bulletproof by measurement, not assertion.**
Each run's artifacts are siloed in `runs/recycled/<run-id>/`; this aggregates them into honest cross-run KPIs. It also
**seeds the factory digital twin** — it *measures* the line today; the twin will *simulate* it forward (same data spine).

- **CLI.** `recycled-scan.mjs metrics` (human) / `metrics --json`, surfaced as `make recycled-metrics`. $0, reads `runs/` only.
- **Pure fns (R23–R27).** `killRate`, `failureReasonDistribution` (bar keys read **dynamically** — bar sets drift across
  runs, so a hardcoded list would silently under-count old runs), `greenlightYield` (`null` on 0 candidates),
  `durabilityPassRate` (`n:0` on empty), `aggregateRuns` (injectable `readJsonl`), `buildMetricsReport` (pure assembler).
- **Honest by construction.** Reports zeros and `n/a` with reasons; never fakes an unmeasurable KPI. Computable now:
  kill-rate, greenlight-yield, failure-reason distribution, ideas-killed-per-greenlight, outcome distribution. Not yet
  measurable (flagged, not faked): cycle/takt time + time-to-preview + per-SKU build cost (need timestamps / a shipped
  SKU), parts-bin reuse (backlogged), Day-45 profitable yield (no SKU past Day 1). The footer rejects the inflated
  claims (no Toyota-level / ~95% / 10×) and notes every number is recomputable from `runs/recycled/*.jsonl`.

## Out of scope (still backlogged)

- `workflow.js` → `recycled/SKILL.md` port + weekly cron (autonomous refresh) — the agent runs the deep-dive on demand for now.
- External Tier-0 discovery lane + parts-bin byproduct catalog — see [BACKLOG.md](BACKLOG.md).
- Live build of any salvaged spec — Recycled specs only; the factory builds, the founder charges (three gates, unchanged).

## Definition of done (Phase A)
`make recycled-verify` green (R1–R8) · one real run produces ≥1 honest greenlight **or** an honest "none this pass" · per-phase token spend logged via `usage.mjs`.
