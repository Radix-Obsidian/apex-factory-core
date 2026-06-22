# PRD.md — Initialization: SKU 1 (Self-Directed, GATED build-to-PR)

## System goal
Operate autonomously overnight to research, conceptualize, manufacture, and **stage** (NOT charge) a
status-driven digital asset (MEP). Run #1 ends at a preview deploy + GitHub PR + Telegram ping. It
does not charge real customers — that waits for the publish+charge gate.

## Hard constraints (read SOUL.md, .cursorrules, HEARTBEAT.md first)
- Shared credit pools (Anthropic + Higgsfield) — cap media generations; heartbeats on OpenRouter free.
- No secrets in commits. AgentShield must pass before any `git push`.
- Stripe in TEST mode only. No live key, no live charge, no flip out of test mode this run.

## TDD acceptance checklist

### [ ] Phase 1 — SKU thesis (Recycled salvage queue FIRST, then trend discovery)
- [ ] **Recycled pre-step — check the salvage queue before discovering anything.** Run
      `node recycled/recycled-scan.mjs candidates next`. If it prints a candidate (non-empty JSON), the
      salvage harness already found a build-ready, kill-pass-survived opportunity — ADOPT it as the SKU
      thesis: write its `product` / `icp` / `wedge` / `extract_list` to `~/life/projects/sku_001/summary.md`,
      then run `node recycled/recycled-scan.mjs candidates consume <spec_id>` to mark it spent, and **SKIP
      the trend-discovery steps below.** Phase 2 then composes the build from the candidate's `extract_list`
      (lift the proven code per each entry's `status`/`refactor` — don't rebuild from scratch).
      If it prints nothing (empty stdout = queue dry; test with `[ -z "$(node recycled/recycled-scan.mjs candidates next)" ]`),
      fall through to trend discovery.
- [ ] _(only if the queue was dry)_ **Net-new ideation (D17)** — run the ideation GENERATOR instead of ad-hoc
      trend-scanning: invoke the Workflow tool on `recycled/ideate.workflow.js` (boring-B2B domain by default), then
      `node recycled/recycled-scan.mjs ideate ingest <run-id>`. It mines REAL demand (Sales-Safari + JTBD), runs the
      SAME honest gate (ground-truth → kill-pass on IDEATION_BARS → durability), and queues any survivor — re-run
      `candidates next` to adopt it. The gate is NOT weakened for our own ideas; **0 survivors is a valid result —
      stop and refine the domain/sources, never force a build.**
- [ ] _(only if ideation also yielded nothing)_ Filter out all "horizontal" ideas. Select ONE ultra-niche vertical wedge.
- [ ] Document the SKU thesis to `~/life/projects/sku_001/summary.md`.

### [ ] Phase 2 — Core engineering & media synthesis
- [ ] **Scaffold the SKU from the chassis (D21)** — `gh repo create Radix-Obsidian/<sku> --private --template
      Radix-Obsidian/chassis`. The chassis ships the spine (auth, billing + the founder-gated live-charge guard,
      entitlement, subscription tiers, Brevo email, idempotent reminder scheduler, Prisma). Do **not** hand-roll the
      spine, and do **not** reuse the legacy `Radix-Obsidian/The-Native-Factory` repo — that's now H\RNESS.
- [ ] Media: use the Higgsfield **CLI** (authed, headless) for visual identity — logo, background
      loop, asset skins. Respect the per-run media cap (small fixed budget; reuse over regenerate).
      If the headless token fails, take the graceful-skip path and flag it; do not hang.
- [ ] **Implement the SKU's `DomainPack`** (`domain/<sku>/{brand,pack}.ts`: brand, profile fields, reminder cadence,
      rules engine, artifact registry) + the domain UI, then point `domain/{brand,index}.ts` at it. The chassis
      contract suite `domain/pack.test.ts` must pass.
- [ ] Checkout comes from the chassis spine (already TDD'd, Stripe TEST mode). TDD the SKU's **rules engine** instead:
      failing test for the domain's work-item schedule first → implement → green.

### [ ] Phase 2.5 — Design system (brand kit via Claude Design, D18)
- [ ] **Author/refresh the per-SKU brand kit via Claude Design + the `/design-sync` skill** — a unique,
      intentional visual direction (NOT a template; see `web/design-quality.md`), synced as a `design-system/`
      folder of `@dsCard`-tagged HTML cards (≥1 `foundations/`, ≥1 `components/`). Design authorship is
      Claude-the-model's; the factory does not auto-judge aesthetics.
- [ ] **Export the kit's tokens into the app** (`--color-*` etc. in `app/globals.css`) so the build actually
      wears the brand. Runs BEFORE Phase 3 so copy is written inside the brand voice, not bolted on after.
- [ ] **Validate structure (deterministic, $0):** `make design-check SKU=../<sku-repo>` passes. Non-blocking
      by policy (a quality checklist item, not a hard deploy gate).

### [ ] Phase 2.6 — Closed-loop / does-it-for-you (D19)
- [ ] **Build it as a closed loop, not a tool the user operates.** The SKU must OWN THE OUTCOME: persist the
      user's state → DO the work for them → proactively keep them in the loop (remind/alert) — NOT a horizontal
      dashboard with AI bolted on. This is the cool-vs-moat line (Hu's open→closed loop; Thiel vertical
      monopoly; Thomas/YC: sell the outcome, not features).
- [ ] **Declare the loop in `CLOSED-LOOP.md`** (outcome / does / state / keep-in-loop) and validate it
      (deterministic, $0): `make closed-loop-check SKU=../<sku-repo>` passes. The judge-side gate (the
      `does_it_for_you` kill bar) already blocked horizontal-SaaS-with-AI at ideation; this confirms the BUILD
      actually closed the loop.

### [ ] Phase 3 — Copywriting injection (must pass the copywriter-auditor hook)
- [ ] Seth Godin tribal-status filter on all customer-facing copy.
- [ ] Alex Hormozi value stack + risk-reversal / guarantee in the checkout UI.
- [ ] Blair Enns authority gating — application/payment barriers, no free trials.

### [ ] Phase 4 — Nightly staging (GATED)
- [ ] `railway init` + `railway up` → preview deploy. Capture the live preview URL.
- [ ] AgentShield scan clean, then open a GitHub PR.
- [ ] Telegram the founder: preview URL + exact build cost (Anthropic + Higgsfield + OpenRouter burn).
- [ ] **HALT at the publish+charge gate.** Do not flip to live Stripe. Transition to HEARTBEAT
      monitoring and await the founder's `PUBLISH_APPROVAL_TOKEN`.
