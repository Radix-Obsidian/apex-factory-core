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
4. **Adversarial kill-pass** — 3 `code-reviewer` skeptics per candidate → `04-verdicts.jsonl`
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

`ai_native_test` is still recorded on every candidate as a **scored plus** (informational), but it is no longer a kill bar.

## The honest-greenlight gate (first real run = the founder's bar)
A run PASSES iff `honest_greenlight >= 1`. A greenlight is **honest** iff:
1. its candidate survived Stage 4 — all 3 skeptics SURVIVE on all 5 bars;
2. `hours_saved_vs_rebuild >= 3` (clears the silent killer, not squeaks);
3. `zero_to_one_rank == "true-zero-to-one"` (AI-native is a plus, not required);
4. every `extract_list` path verified present in the source repo.

**Zero honest greenlights is a valid, honest outcome** — report "corpus yielded no build-ready
opportunity this pass." Never manufacture a weak greenlight to make the run look productive.

## Guardrails (encoded, not advisory)
- Salvage capability, never resurrect a dead product (Frankenstein = auto-kill).
- ≤1 greenlit build per repo; default-to-kill on doubt.
- Defensible + vertical + real demand + legally liftable; AI-native is a strong plus, not a gate.
- Never delete — truly-dead code gets a label-only frozen note; Recycled never runs `gh repo archive`/delete.
- License-gate fail-closed on all Tier-2 code before Stage 1.
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

## Out of scope (still backlogged)

- `workflow.js` → `recycled/SKILL.md` port + weekly cron (autonomous refresh) — the agent runs the deep-dive on demand for now.
- External Tier-0 discovery lane + parts-bin byproduct catalog — see [BACKLOG.md](BACKLOG.md).
- Live build of any salvaged spec — Recycled specs only; the factory builds, the founder charges (three gates, unchanged).

## Definition of done (Phase A)
`make recycled-verify` green (R1–R8) · one real run produces ≥1 honest greenlight **or** an honest "none this pass" · per-phase token spend logged via `usage.mjs`.
