// personalize.test.mjs — the three drafts share one scaffold; this locks Email 1's wording (byte-stable
// for warmup reputation) and proves Email 2/3 carry the company, audit date, deep-link, CTA, and unsub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftEmail, draftStep2, draftStep3, STEP_DRAFTERS } from "./personalize.mjs";

const lead = {
  dotNumber: "1234",
  legalName: "Acme Trucking",
  dbaName: null,
  email: "ops@acme.com",
  auditDueDate: "2026-06-25", // → "June 25, 2026"
  deepLink: "https://waimd.org/navigator?usdot=1234&utm_content=dot_1234",
};

test("Email 1 wording is byte-stable", () => {
  const d = draftEmail(lead);
  assert.equal(d.subject, "USDOT 1234 — your safety audit window opens June 25, 2026");
  assert.match(d.text, /Hi Acme Trucking,/);
  assert.match(d.text, /free dated checklist/);
  assert.ok(d.text.includes(lead.deepLink));
  assert.match(d.html, /See your free dated checklist/);
  assert.ok(d.unsubscribeUrl.includes("e=ops%40acme.com"));
});

test("Email 2 = registration risk, with date + CTA", () => {
  const d = draftStep2(lead);
  assert.equal(d.subject, "USDOT 1234 — a missed New Entrant audit can cost your authority");
  assert.match(d.text, /operating authority on the line/);
  assert.match(d.text, /June 25, 2026/);
  assert.match(d.html, /See what the audit checks/);
  assert.ok(d.text.includes(lead.deepLink));
});

test("Email 3 = final social-proof nudge, dated subject", () => {
  const d = draftStep3(lead);
  assert.equal(d.subject, "USDOT 1234 — last call before your audit window (June 25, 2026)");
  assert.match(d.text, /already prepared/);
  assert.match(d.html, /Open my dated roadmap/);
});

test("undated leads fall back gracefully (no 'undefined')", () => {
  const noDate = { ...lead, auditDueDate: null };
  assert.equal(draftEmail(noDate).subject, "USDOT 1234 — your FMCSA compliance checklist");
  assert.equal(draftStep3(noDate).subject, "USDOT 1234 — last call before your New Entrant audit");
  for (const d of [draftEmail(noDate), draftStep2(noDate), draftStep3(noDate)]) {
    assert.ok(!/undefined|null|NaN/.test(d.subject + d.text + d.html));
  }
});

test("HTML is escaped (no injection from carrier names)", () => {
  const d = draftStep2({ ...lead, legalName: "Smith & Co <LLC>" });
  assert.match(d.html, /Smith &amp; Co &lt;LLC&gt;/);
});

test("STEP_DRAFTERS maps step number → drafter", () => {
  assert.equal(STEP_DRAFTERS[1], draftEmail);
  assert.equal(STEP_DRAFTERS[2], draftStep2);
  assert.equal(STEP_DRAFTERS[3], draftStep3);
});
