# Waimd GTM lead engine

Autonomous, $0 lead sourcing + personalization for **Waimd** (waimd.org) — the dated FMCSA
new-entrant compliance roadmap. Sources brand-new interstate carriers from the public FMCSA Company
Census, computes each one's exact New Entrant Safety Audit due date, and produces a personalized
deep-link + cold-email draft. **It does not send by default** — sending is a separately-gated, ramped
step (`send.mjs`).

## The pipeline

```
FMCSA Company Census (Socrata az4n-8mr2, free, daily)
   → filter: interstate (carrier_operation A) · active · has email · audit due ~30-180d out
   → personalize: audit-due = add_date + 330d · prefilled deep-link · cold-email draft
   → dedup vs lead store + suppression list
   → (--commit) write store + a draft batch for review → send
```

Run:

```bash
node pipeline.mjs                      # dry run — source + report, write nothing
node pipeline.mjs --commit             # queue the most-urgent batch (default 100) into the store
node pipeline.mjs --commit --batch 50  # cap batch size
node pipeline.mjs --json               # machine-readable summary (for the ops tick / weekly digest)
node pipeline.mjs --validate           # also run QCMobile per lead (needs FMCSA_QCMOBILE_WEBKEY)
```

The store (`data/leads.jsonl`) holds only leads we've **queued/contacted**, so re-running naturally feeds
the next most-urgent batch — no lead is stranded, none is contacted twice.

## Data contract (verified live 2026-06-24)

- **Dataset:** FMCSA Company Census File, `az4n-8mr2` on data.transportation.gov (SODA API). No key
  required; `FMCSA_APP_TOKEN` only raises rate limits. Refreshes daily.
- **ICP filter:** `carrier_operation='A'` (Interstate — the only class facing the federal New Entrant
  Safety Audit; B=Intrastate Hazmat, C=Intrastate Non-Hazmat), `status_code='A'`, `email_address` present
  (~100% fill on recent entrants), `add_date` 150-300 days ago (audit due ~30-180 days out).
- **Hook:** audit-due = `add_date + 330d`, matching `safety-audit-window` in
  `dot-navigator/lib/calendar-engine.ts`. Keep the two in sync.
- **Deep-link contract:** `https://waimd.org/navigator?usdot=&authorityDate=&carrierType=interstate&utm_*`
  (`utm_content=dot_<USDOT>` for per-lead attribution). Lands on an instant, prefilled, auto-generated
  roadmap; the waimd.org funnel logs `roadmap_generated → checkout_started → paid` against the campaign.

## Sending (gated — OFF until deliberately ramped)

`send.mjs` refuses to send unless EVERY rail is in place:

- `WAIMD_DAILY_CAP > 0` (sending disabled until ramped; warmup ~20/day, ~double weekly)
- `BREVO_API_KEY` (transport)
- `WAIMD_POSTAL_ADDRESS` (CAN-SPAM physical address in every email)
- `from` on **outreach.waimd.org** (isolates reputation from the apex `p=reject`)
- `--send --i-approve` (explicit two-key confirmation)

Plus: suppression honored, already-sent skipped, daily cap enforced, `List-Unsubscribe` (one-click) set,
every send logged to `data/send-log.jsonl`.

```bash
node send.mjs --batch data/batches/batch-XXXX.json                       # preview (no send)
node --env-file=.env send.mjs --batch <file> --send --i-approve          # send (all rails required)
```

### Go-live checklist (before the first real send)

1. Stand up **outreach.waimd.org** in Brevo (SPF/DKIM/DMARC `p=none` → ramp) — separate from waimd.org.
2. Build the **/unsubscribe** endpoint on waimd.org (one-click; writes to `suppression.txt`).
3. Set env: `WAIMD_DAILY_CAP`, `BREVO_API_KEY`, `WAIMD_POSTAL_ADDRESS`, `WAIMD_OUTREACH_FROM`.
4. Warm the domain 3-4 weeks; watch bounce < 2% / complaints < 0.3% (auto-pause thresholds in config).

## The 3-email sequence (self-hosted drip)

Brevo has **no API to create automation workflows** — automations are UI-only (a POST to create one
404s). So the follow-up drip is self-hosted: the timing and the "stop if clicked" branch live in
`sequence.mjs`, and every email is one transactional `/v3/smtp/email` call through `transport.mjs`.

Cadence (offsets in `config.mjs` → `SEQUENCE`):

```text
Email 1 (Day 1)  cold/urgency + free dated checklist   ← enrollment (send.mjs / send-scheduled.mjs)
   wait 3d → engaged? ─ yes → STOP
Email 2 (Day 4)  registration-risk follow-up
   wait 4d → engaged? ─ yes → STOP
Email 3 (Day 8)  final social-proof nudge
```

- **Enrollment** is the step-1 send: `send.mjs` / `send-scheduled.mjs` mark the lead `status:"sent"` and
  `enroll()` it (`seqStep:1`). Leads contacted *before* this was wired (no `seqStep`) are never picked
  up — the drip only applies to newly enrolled leads.
- **Follow-ups** (steps 2 & 3) are sent by `sequence-send.mjs` — same rails as `send.mjs`, inert by
  default. It reads the store directly (the drip is stateful over time, not batch-based):

```bash
node sequence-send.mjs                                       # dry run: schedule only, no send
node sequence-send.mjs --leads data/leads.test.jsonl        # dry run against a fixture store
node --env-file=.env sequence-send.mjs --send --i-approve   # send due steps (all rails required)
```

- **Stop if clicked** = engagement. The deep-link → `waimd.org/navigator` → `roadmap_generated` event
  (attributable per-lead via `utm_content=dot_<USDOT>`). `sync-engagement.mjs` pulls engaged leads from
  `WAIMD_ENGAGEMENT_URL` / `WAIMD_ENGAGEMENT_TOKEN` (mirrors the suppression sync; no-ops until set) and
  drops them from the drip. Unsubscribes drop them too, via the existing suppression list.
- **Schedule**: wire `sequence-send.mjs` into the daily cron *after* the step-1 sender so follow-ups
  fire as they come due, within `WAIMD_DAILY_CAP`.

Unit tests (zero deps): `node --test`.

## Compliance

- **TCPA:** email only. No cold AI voice / cold SMS off this list (phone is stored for inbound/consented use only).
- **CAN-SPAM:** truthful from, working unsubscribe, physical postal address — enforced by `send.mjs`.
- **Liability:** every email says "decision-support, not legal advice; verify against FMCSA."

## Files

| File | Role |
|---|---|
| `config.mjs` | all knobs: dataset, ICP filter, deep-link, sender, send caps, paths |
| `census.mjs` | SODA fetch + filter + date helpers |
| `personalize.mjs` | census row → Lead; drafts all 3 emails (`STEP_DRAFTERS`) off one scaffold |
| `qcmobile.mjs` | optional send-time validation (env-gated, no-ops without webKey) |
| `store.mjs` | lead store (JSONL, dedup by USDOT) + suppression list |
| `pipeline.mjs` | the tick: source → personalize → dedup → store + draft batch |
| `transport.mjs` | the one Brevo transactional send + the shared send rails (`preflight`) |
| `send.mjs` | gated step-1 sender; enrolls the lead into the drip on send |
| `send-scheduled.mjs` | timezone-aware step-1 sender (8 AM local); also enrolls |
| `sequence.mjs` | pure drip scheduler: `enroll`, `nextDue` (Day 1/4/8), stop-if-engaged |
| `sequence-send.mjs` | gated follow-up runner — sends steps 2 & 3 when due |
| `sync-suppression.mjs` | pull on-site unsubscribes → suppression list (env-gated) |
| `sync-engagement.mjs` | pull "clicked the roadmap" engagement → drop from drip (env-gated) |
| `data/` | `leads.jsonl`, `suppression.txt`, `batches/`, `send-log.jsonl` (gitignored) |
