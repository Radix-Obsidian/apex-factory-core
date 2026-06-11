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

R1, R4, R7 are pure-function units — instant, deterministic, the guardrail tests to trust absolutely.

## The honest-greenlight gate (first real run = the founder's bar)
A run PASSES iff `honest_greenlight >= 1`. A greenlight is **honest** iff:
1. its candidate survived Stage 4 — all 3 skeptics SURVIVE on all 5 bars;
2. `hours_saved_vs_rebuild >= 3` (clears the silent killer, not squeaks);
3. `ai_native_test == PASS` **and** `zero_to_one_rank == "true-zero-to-one"`;
4. every `extract_list` path verified present in the source repo.

**Zero honest greenlights is a valid, honest outcome** — report "corpus yielded no build-ready
opportunity this pass." Never manufacture a weak greenlight to make the run look productive.

## Guardrails (encoded, not advisory)
- Salvage capability, never resurrect a dead product (Frankenstein = auto-kill).
- ≤1 greenlit build per repo; default-to-kill on doubt.
- AI-native or out; vertical or out.
- Never delete — truly-dead code gets a label-only frozen note; Recycled never runs `gh repo archive`/delete.
- License-gate fail-closed on all Tier-2 code before Stage 1.
- Tier-2 BuildSpecs carry `license_human_confirmed:false` — a hard blocker the factory must clear before building (Phase B).

## Out of scope (Phase A, by design)
- Factory integration (`recycled-candidates.jsonl` consumption, cron, SKILL port) — Phase B, gated on run #1 ≥1 honest greenlight.
- Live build of any salvaged spec — Recycled specs only.

## Definition of done (Phase A)
`make recycled-verify` green (R1–R8) · one real run produces ≥1 honest greenlight **or** an honest "none this pass" · per-phase token spend logged via `usage.mjs`.
