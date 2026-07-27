# Recycled — Backlog

**Status:** Phase A proven. Floor + 5-stage pipeline + triage funnel all working. 5 repos deep-dived → **1 greenlight (MCPShield, from ShepGate)** + 4 honest kills (Herday-AI, NoLeakAi, toknxr, ShepLight). Build-in-public entries 0001–0004 written.

**Agreed next step (NOT backlog — the immediate move):** **Build MCPShield.** Close the loop salvage → ship → revenue on the one greenlight we have, *before* scaling the front of the funnel. Reason: we've proven "dead code → spec," not "dead code → revenue." Shipping one salvage validates that our specs are trustworthy (does "60% built, 8–10 days" hold?) and is the proof the whole thesis rests on. Everything below is gated behind this.

---

## 1. External mining — the tournament funnel ⭐ (the big one — do not lose)

**Gate to start:** ship MCPShield (or any one salvage) first, and confirm the spec's effort estimate held. Only then do we trust Recycled's specs enough to scale external.

**The principle — a tournament, not a survey.** You mine for the *single best* opportunity, and the factory builds one SKU at a time anyway. So the expensive deep-dive becomes the **rare last step, not the default.** The binding constraint is **Max-plan throughput (rate limits), not cash** ($0 per token on the plan).

**Why this architecture (tonight's data):** deep-dive ≈ **2M tokens/repo**; hit rate **1-in-5 on our OWN repos** (expect worse on random external repos — abandoned-in-public usually means incomplete/commodity/low-quality). Naive "deep-dive everything that passes triage" is economically impossible at internet scale. So we escalate through three tiers, each killing the majority:

- **Tier 0 — ultra-cheap discovery + score** (thousands → hundreds). `gh search repos` (license-gated to permissive only), filtered by `pushed:<~18mo`, `stars:>N`, by topic/language. Rank **deterministically on metadata** (stars, recency, topic match, language, repo size) ± a tiny Haiku batch skim of title/README. **No deep file reads.** Cost ≈ free.
- **Tier 1 — scout pass** (top ~50 → top few). Per repo: manifest + sample a few files → `builtness` + **ONE** best capability + **ONE** best candidate + **ONE** skeptic (default-to-kill). Reuses the floor's `manifest`/`cat`. **~150–250K tokens each.** Kills most.
- **Tier 2 — full deep-dive** (top **1–3 only**). The existing `workflow.js` (5 stages, 3 skeptics, ~2M tokens). Produces the BuildSpec(s).

**License gate (fail-closed, already built):** `licenseGate()` in `recycled-scan.mjs`. External repos must return `LIFT-OK` (MIT/Apache-2.0/BSD/ISC/Unlicense/CC0) before they enter Tier 1. Any Tier-2 external BuildSpec carries `license_human_confirmed: false` — a **hard blocker** before the factory builds (GitHub's auto-detected SPDX is fallible on dual/multi-license repos, so a human confirms once).
- Verified syntax: `gh search repos --license=mit --license=apache-2.0 --stars=">100"` + raw qualifiers `"pushed:<2024-06-01 stars:>100 license:mit"`. SPDX confirm: `gh api repos/$O/$R --jq .license.spdx_id`.

**Multi-platform (GitLab, etc.):** same funnel shape, different discovery API (GitLab projects API supports `license` + `last_activity_at` filters). Abstract discovery behind a **source adapter** so Tier 0 is platform-agnostic; Tiers 1–2 are unchanged (they read via gh/git clone of the chosen repo).

---

## 2. Phase B — factory integration

**Core wiring DONE (2026-06-13)** — the connective tissue that makes Recycled part of manufacturing:
- ✅ `recycled-candidates.jsonl` projection: `candidates project <run-id>` projects honest greenlights → thin ranked queue; `candidates next|consume|list` CLI. Pure fns `projectCandidates`/`mergeCandidates`/`eligibleTopCandidate`/`markConsumed`, tested R9–R12 (24/24 green). Re-projection never un-consumes; Tier-2 gated on `license_human_confirmed`.
- ✅ PRD Phase-1 pre-step: loop runs `candidates next`; non-empty → adopt as SKU thesis + `consume`, skip blind discovery; empty → fall through (non-destructive). Smoke-tested end-to-end on the real MCPShield greenlight.
- ⏳ **To go live:** commit `recycled-candidates.jsonl` + the `PRD.md` edit so the loop's isolated worktree sees them (user-gated commit).

**Still backlogged:**
- Phase-2 build composes from `parts-bin/` via `parts_bin_refs` (needs the parts-bin, item 3 below).
- Port `workflow.js` → `recycled/SKILL.md` (Task-tool fan-out) so the factory runs the deep-dive autonomously; schedule `make recycled-scan` weekly on the existing OpenClaw 6h cron. (For now the orchestrating agent runs the deep-dive on demand; Recycled refreshes the queue, never triggers a build.)

## 3. Slice 4 — parts-bin byproduct
PartsBinEntry projections (self_containedness ≥ 4, non-side-effecting) → `factory-core/parts-bin/index.jsonl`. Pinned-SHA lift commands, never copies.

## 4. Known refinements (from tonight's runs)
- **Triage `salvage_worthiness` is optimistic** — it rated Herday-AI 4/5 but the deep-dive killed it 8/8. `builtness` is reliable; `salvage_worthiness` over-predicts buildable opportunity. **RESOLVED (2026-06-12):** built `scout.js` — the Tier-1 scout pass (1 capability → 1 candidate → 1 ruthless skeptic on the broadened bar) replaces triage's salvage score as the deep-dive escalation gate. The scout's single-skeptic SURVIVE is the predictor; triage is now an optional ultra-cheap pre-skim. Still pending: a real scout validation run across the known repos to confirm it (a) survives ShepGate and (b) re-judges a NoLeakAi-type under the broadened bar.
- **Cost discipline:** deep-dive ≈ 2M tokens/repo. Always gate with cheaper tiers first; never deep-dive un-triaged.
- **Workflow `args` don't propagate** in this environment → use embedded fallback lists / edit the script default to re-point.
- **Path format:** agents sometimes emit repo-prefixed or leading-slash paths; `normalizeRepoPath()` in the floor handles it — keep it.

## 5. Salvage target — dot-navigator (Waimd) · KILLED 2026-07-27 (D24)
Own SKU → Tier 1 (`licenseGate` auto-`OWN`, lift freely). Queued here per the never-delete / reversible-archive
rule; captured when `../dot-navigator` is added to a session and the `workflow.js` deep-dive runs (there's no
"salvage one SKU on demand" CLI — this is the intent record the deep-dive adopts). Reusable parts to extract:
- **FMCSA calendar engine** — `lib/calendar-engine.ts` (dated new-entrant deadlines from the authority date). Parts-bin candidate (self-contained → pinned-SHA lift).
- **MCS-150 prefill** — highest-value form generator (company / USDOT / operation-type prefill). Parts-bin.
- **Idempotent reminder scheduler** — chassis sweep that claims each carrier-deadline slot before sending (dedupe). Parts-bin / chassis-shared.
- **FMCSA DomainPack** — `domain/fmcsa/{brand,pack}.ts` (profile fields, reminder cadence, rules engine, artifact registry). BuildSpec `extract_list` if a future compliance SKU reuses the domain shape.
Do NOT copy now — the deep-dive emits the pinned-SHA lift commands + `wrap_plan`. Repo stays label-only/frozen (R7): never `gh repo archive`/delete.
