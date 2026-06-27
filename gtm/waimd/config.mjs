// config.mjs — the Waimd GTM lead engine, single source of truth. All knobs live here so the pipeline
// stays declarative. $0 to run: the FMCSA Company Census is a free Socrata dataset (no key required;
// an app token only raises rate limits). Verified live 2026-06-24 (dataset az4n-8mr2 refreshes daily;
// newest add_date was yesterday; ~100% of recent new entrants carry an email_address).

export const CENSUS = {
  // FMCSA Company Census File on data.transportation.gov (Socrata SODA API).
  resource: "az4n-8mr2",
  base: "https://data.transportation.gov/resource/az4n-8mr2.json",
  // Optional Socrata app token for higher rate limits (X-App-Token). Unauthenticated works for our volume.
  appToken: process.env.FMCSA_APP_TOKEN || "",
  pageSize: 1000,
  maxPages: 10, // hard ceiling so a bad query can never page forever (≤ 10k candidates/run)
};

// The ICP: brand-new INTERSTATE carriers (carrier_operation 'A') that are active and reachable by email.
// carrier_operation codes are the federal classification, verified against FMCSA docs:
//   A = Interstate, B = Intrastate Hazmat, C = Intrastate Non-Hazmat.
// Only interstate carriers face the federal New Entrant Safety Audit — the calendar's conversion hook.
export const FILTER = {
  carrierOperation: "A", // interstate only (the audit-window hook applies to these)
  statusCode: "A", // active registrations only
  requireEmail: true,
  // The audit-PREP sweet spot: target carriers whose New Entrant Safety Audit is roughly 30-180 days
  // out — close enough to feel urgent, far enough that prep still helps. audit-due = add_date + 330d, so
  // that maps to a registration age of 150-300 days. (The "freshest carriers" cohort, age 14-45, is a
  // valid alternative campaign — widen this window to test it.)
  minAgeDays: 150,
  maxAgeDays: 300,
};

// The make-or-break hook: the New Entrant Safety Audit prep window. This offset MUST match the
// `safety-audit-window` milestone in dot-navigator/lib/calendar-engine.ts (offsetDays: 330) so the
// outreach date and the on-site roadmap agree.
export const AUDIT_OFFSET_DAYS = 330;

// The locked deep-link contract (see memory: dot-navigator-live-paid-funnel). An outreach email links
// here so the carrier lands on an instant, prefilled, auto-generated roadmap with attribution captured.
export const DEEPLINK = {
  base: "https://waimd.org/navigator",
  utm: {
    source: "email",
    medium: "cold",
    campaign: "fmcsa-new-entrant",
  },
};

// CAN-SPAM is non-negotiable before any real send: a truthful from, a working unsubscribe, and a valid
// physical postal address. These are read from env so no address is hard-coded; send.mjs (later) refuses
// to send if the postal address or unsubscribe base is missing.
export const SENDER = {
  from: process.env.WAIMD_OUTREACH_FROM || "Waimd <hello@outreach.waimd.org>",
  replyTo: process.env.WAIMD_REPLY_TO || "hello@itsvoco.com",
  postalAddress: process.env.WAIMD_POSTAL_ADDRESS || "", // REQUIRED before sending (CAN-SPAM)
  unsubscribeBase: process.env.WAIMD_UNSUBSCRIBE_BASE || "https://waimd.org/unsubscribe",
};

// The 3-email follow-up sequence (self-hosted; Brevo has NO workflow-creation API — automations are
// UI-only, which is why a POST to create one 404s). offsetDays is days AFTER the previous step, so the
// drip lands on Day 1 / Day 4 / Day 8: step1 → +3d → step2 → +4d → step3. A lead drops out the moment
// they engage (click the roadmap link) or unsubscribe — see sequence.mjs + sync-engagement.mjs.
export const SEQUENCE = {
  steps: [
    { n: 1, offsetDays: 0 }, // enrollment send (Email 1, the cold/urgency draft)
    { n: 2, offsetDays: 3 }, // +3d after step 1 → registration-risk follow-up
    { n: 3, offsetDays: 4 }, // +4d after step 2 → final social-proof nudge
  ],
};

// Engagement sync: pull "clicked the roadmap link" signals (waimd.org funnel's roadmap_generated events,
// attributable per-lead via utm_content=dot_<USDOT>) so an engaged carrier is dropped from the drip.
// Env-gated and best-effort: with no URL/token it cleanly no-ops, exactly like suppression sync, so the
// engine runs fine before this endpoint exists. Mirrors WAIMD_SUPPRESSION_URL/TOKEN.
export const ENGAGE = {
  url: process.env.WAIMD_ENGAGEMENT_URL || "",
  token: process.env.WAIMD_ENGAGEMENT_TOKEN || "",
};

// Sending is OFF until deliberately ramped. dailyCap=0 means send.mjs refuses to send anything — the
// hard gate that keeps "engine built" from becoming "engine blasting" before outreach.waimd.org is
// warmed (task: compliant sending). Warmup ramp: start ~20/day, roughly double weekly, watch the metrics.
export const SEND = {
  dailyCap: Number(process.env.WAIMD_DAILY_CAP || 0),
  ratePerMin: 20,
  // Hard stop the autonomous sender if deliverability degrades (wired when Brevo feedback is connected).
  maxBouncePct: 2.0,
  maxComplaintPct: 0.3,
};

// Warmup ramp: cold-send volume must climb gradually, not jump to the full cap on day one, or a near-cold
// domain gets spam-foldered. The EFFECTIVE daily total = min(SEND.dailyCap, ramp(week since start)) —
// SEND.dailyCap stays the hard ceiling. Set WAIMD_WARMUP_START to the date the warm began (ISO
// YYYY-MM-DD); empty = no ramp (use the full cap). `weekly[w]` is the cap for week w (0-indexed);
// after the list, the full ceiling applies. warmup.mjs makes this a true daily total across both senders.
export const WARMUP = {
  startDate: process.env.WAIMD_WARMUP_START || "",
  weekly: [20, 40, 80, 160], // wk0→20, wk1→40, wk2→80, wk3→160, wk4+→SEND.dailyCap
};

// Data files (gitignored). leads.jsonl is the durable store; suppression.txt is never-contact (unsubs,
// bounces, existing customers, complaints).
export const PATHS = {
  leads: new URL("./data/leads.jsonl", import.meta.url).pathname,
  suppression: new URL("./data/suppression.txt", import.meta.url).pathname,
  batches: new URL("./data/batches", import.meta.url).pathname,
};
