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
- [ ] _(only if the queue was dry)_ Spin up an isolated search agent (cheap model) to scan macro-trends in
      high-ticket digital assets, elite productivity frameworks, or specialized developer tools.
- [ ] _(only if the queue was dry)_ Filter out all "horizontal" ideas. Select ONE ultra-niche vertical wedge.
- [ ] Document the SKU thesis to `~/life/projects/sku_001/summary.md`.

### [ ] Phase 2 — Core engineering & media synthesis
- [ ] Init a new Git repo for the SKU (separate from this control plane). Use the empty
      `Radix-Obsidian/The-Native-Factory` repo, or create a fresh one via `gh`.
- [ ] Media: use the Higgsfield **CLI** (authed, headless) for visual identity — logo, background
      loop, asset skins. Respect the per-run media cap (small fixed budget; reuse over regenerate).
      If the headless token fails, take the graceful-skip path and flag it; do not hang.
- [ ] Write core backend + frontend (Next.js / Tailwind).
- [ ] TDD the checkout flow: failing integration test first → implement Stripe (TEST mode) → green.

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
