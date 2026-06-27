# Changelog

Auto-generated from git history across factory-core and its SKUs. Most recent first.

## 2026-06-25

### Features

- factory agent operating brief (conversational Telegram chairman cockpit) _(factory-core)_ <!--h:f4b40e5-->
- founder-manual lead list + reddit drafts + Telegram cockpit scaffolding _(factory-core)_ <!--h:3d35d66-->
- sync on-site unsubscribes into the lead engine suppression list _(factory-core)_ <!--h:81079bd-->
- weekly founder digest + register Waimd live in registry _(factory-core)_ <!--h:59f19c3-->
- Waimd FMCSA lead engine — source, personalize, store _(factory-core)_ <!--h:274c7d5-->
- D21 — scaffold SKUs from the chassis framework _(factory-core)_ <!--h:64a92e0-->
- D20 post-launch operations layer — operate each shipped SKU _(factory-core)_ <!--h:8b5c920-->
- auth-guard — enforce the factory's two-key Claude credential model _(factory-core)_ <!--h:aa359c7-->
- D19 — does_it_for_you bar in the recycled judge + ideation generator _(factory-core)_ <!--h:877c14e-->
- D19 — does-it-for-you / closed-loop standard (judge bar + build check) _(factory-core)_ <!--h:d396173-->
- D18 — bake design-system as a factory standard (deterministic design-check validator, PRD Phase 2.5, Makefile target, .env pointer); build-in-public 0017 (factory can take money — proven in Stripe TEST, gate sealed) _(factory-core)_ <!--h:7c0172f-->
- first net-new greenlight queued — New Entrant DOT Navigator (FMCSA) survived kill-pass + Thiel 6/7 + first-principles via whitespace-first ideation (D17) _(factory-core)_ <!--h:6d08828-->
- whitespace-first ideation (D17 refinement) — competitor sweep moved INTO I1 demand-mine (served_read) + I2 synthesis (whitespace required, refuse me-too); gate unchanged _(factory-core)_ <!--h:35639dc-->
- net-new IDEATION engine (D17) — ideate.workflow.js generator + IDEATION_BARS (reuse_over_rebuild) + makeNetNewBuildSpec + ideate ingest CLI; same honest gate, R28-R32 _(factory-core)_ <!--h:39c2d1c-->
- cross-run metrics instrument (D16) — kill-rate, greenlight-yield, failure-reason distribution; pure fns + R23-R27 (schema-drift guard); make recycled-metrics _(factory-core)_ <!--h:4add7b4-->
- outcome-capture (D15) + strengthened-line durability gates _(factory-core)_ <!--h:c8c3284-->
- wire Recycled salvage queue into the factory Phase-1 build loop _(factory-core)_ <!--h:38c95dd-->
- broaden kill-pass bar to real_demand, add Tier-1 scout, wire factory consumption queue _(factory-core)_ <!--h:6dc9a9d-->
- loop runs in its own git worktree (loop/auto) — session-level isolation above the zone guard (D12) _(factory-core)_ <!--h:927371b-->
- ownership-zone git guard — blind add-A can no longer mix factory + recycled _(factory-core)_ <!--h:4f8c3d9-->
- 30-min crash-check launchd agent + hard Fable per-run counter _(factory-core)_ <!--h:1fdeeb1-->
- 4-rung model ladder w/ Fable 5 + project-scoped agent roster + loop hardening _(factory-core)_ <!--h:fa1417f-->
- official model audit -> per-role lineup; fix Opus pricing 3x; factory auth + production posture _(factory-core)_ <!--h:be534d2-->
- heartbeat reads + analyzes BOTH pools (Claude plan usage + Higgsfield credits) _(factory-core)_ <!--h:620e9c8-->
- one-click unsubscribe + suppression export (CAN-SPAM) _(dot-navigator)_ <!--h:b7e51c5-->
- instrument waimd.org for attribution + personalized deep-links _(dot-navigator)_ <!--h:462035f-->
- add HTTP security headers + https-forcing origin helper _(dot-navigator)_ <!--h:dff4462-->
- rebrand DOT Navigator → Waimd (waimd.com); centralize name via brand.ts _(dot-navigator)_ <!--h:310c152-->
- own brand kit + public legal/pricing pages; drop legacy factory branding _(dot-navigator)_ <!--h:c3a5521-->
- self-closing reminder loop via in-process scheduler _(dot-navigator)_ <!--h:24657a3-->
- subscription reshape — $49.99/mo, 14-day trial; gate the done-for-you (D19 monetize) _(dot-navigator)_ <!--h:9c4525b-->
- does-the-prep + keep-in-loop (D19 closed loop, halves 2 & 3) _(dot-navigator)_ <!--h:e30e1d1-->
- closed-loop foundation (D19) — accounts, persistence, next-action dashboard _(dot-navigator)_ <!--h:b5c76ff-->
- Stripe TEST one-time unlock for the audit packet — no-auth HMAC signed-token entitlement, checkout/entitlement/webhook routes, server-gated packet page; SKU-level live-charge gate mirrors D5; go-live + distribution staged _(dot-navigator)_ <!--h:11479c3-->
- New Entrant DOT Navigator — preview build (factory SKU #1) _(dot-navigator)_ <!--h:1185ce1-->

### Fixes

- recognize rk_live_ keys as live + mark dot-navigator billing.mode live _(factory-core)_ <!--h:9c0a5e8-->
- load factory-core/.env in the ops CLIs (process.loadEnvFile) _(factory-core)_ <!--h:e52dae1-->
- correct two verified errors _(factory-core)_ <!--h:a5b64db-->
- redirect off APP_ORIGIN, not req.url (proxy sends internal localhost host) _(dot-navigator)_ <!--h:2e968e7-->

### Refactors

- swap email provider Resend → Brevo (cheaper) via REST + fetch _(dot-navigator)_ <!--h:616e970-->

### Docs

- 0020 — walked our own paid funnel end-to-end in test _(factory-core)_ <!--h:6bbe904-->
- build-in-public 0019 — first SKU live in production + first real sign-in _(factory-core)_ <!--h:b19556a-->
- ship SKU #1 to live preview — build-in-public 0016 (ideate→preview PROVEN) + D15 outcome logged (fmcsa-new-entrant-navigator: unknown, shipped no revenue) _(factory-core)_ <!--h:75c9505-->
- 0015 — built an idea generator, it killed all 4 of its own ideas; the gap is novelty (evidenced demand ⟺ existing competitors), fix = whitespace-check during generation _(factory-core)_ <!--h:e8b92d1-->
- D17 net-new ideation + ship/preview wiring — PRD Phase-1 ideation hook, .env.example DEPLOY_CMD (Vercel/Railway), make recycled-ideate; dogfood ideate→preview on ourselves _(factory-core)_ <!--h:7aeae54-->
- D16 manufacturing standard (TPS/Tesla/SpaceX) + METHOD.md — articulated, measured not asserted; Grok inflation rejected; B->C->robotics named as honest direction _(factory-core)_ <!--h:d125704-->
- D15 doctrine + demand-probe GTM drafts + build-in-public 0013/0014 _(factory-core)_ <!--h:b8acf86-->
- log entry 0010 (built the proof; published its limits) _(factory-core)_ <!--h:247e4f4-->
- log entry 0009 (nine agents picked our next move) _(factory-core)_ <!--h:89cae81-->
- log entries 0005-0008 (H\RNESS — the catch + three proofs) _(factory-core)_ <!--h:dc303c5-->
- log entries 0001-0004 (salvage wins + honest kills) _(factory-core)_ <!--h:525bd60-->
- Railway CLI deploy runbook + Brevo send-test script _(dot-navigator)_ <!--h:7d5ab32-->
- GO-LIVE runbook for the subscription + infra (Postgres/Resend/cron) reality _(dot-navigator)_ <!--h:0847adb-->

### Chores

- mark dot-navigator revenue telemetry wired (test key reused; swap to restricted RO before live) _(factory-core)_ <!--h:6af0585-->
- ship the salvage queue empty (dormant wire) _(factory-core)_ <!--h:05844bb-->
- finalize waimd.org in README + email sender fallback _(dot-navigator)_ <!--h:5b60397-->
- run prisma migrate deploy on boot; make prisma a runtime dep _(dot-navigator)_ <!--h:52797e9-->
- initial Prisma migration + live-Postgres closed-loop smoke test _(dot-navigator)_ <!--h:d3f4512-->

### Other

- build-in-public 0012: our 'neutral' judges were grading their own homework _(factory-core)_ <!--h:945e3e0-->
- build-in-public 0011: ran the coherence test, it failed (3.6), fixed it (4.3) _(factory-core)_ <!--h:336f309-->
- design: elevate to 'Carrier's Almanac' v2 + sync brand kit to Claude Design _(dot-navigator)_ <!--h:a502691-->
