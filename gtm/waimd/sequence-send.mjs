#!/usr/bin/env node
// sequence-send.mjs — the GATED follow-up runner for the 3-email drip. Enrollment (step 1) is the existing
// senders' job; this runner sends step 2 (+3d) and step 3 (+4d) to enrolled leads, and drops anyone who
// engaged (clicked the roadmap link) or unsubscribed. It reads the store directly (the drip is stateful
// over time, not batch-based) and obeys the exact same rails as send.mjs — inert by default.
//
//   node sequence-send.mjs                                            # dry run: schedule only, no send
//   node --env-file=.env sequence-send.mjs --send --i-approve         # send due steps (all rails required)
//   node sequence-send.mjs --leads data/leads.test.jsonl             # dry-run against a fixture store
//
// Brevo has no automation/workflow API — every email is one /v3/smtp/email call via transport.mjs; the
// timing and the "stop if clicked" branch are ours (sequence.mjs).

import fs from "node:fs";
import path from "node:path";
import { SENDER, SEND, SEQUENCE, ENGAGE, PATHS } from "./config.mjs";
import { loadLeads, saveLeads, loadSuppression, isSuppressed, normEmail } from "./store.mjs";
import { syncSuppression } from "./sync-suppression.mjs";
import { syncEngagement, applyEngagement } from "./sync-engagement.mjs";
import { nextDue, nextDueAt, recordSent, isActive } from "./sequence.mjs";
import { STEP_DRAFTERS } from "./personalize.mjs";
import { parseSender, preflight, sendOne } from "./transport.mjs";
import { remainingToday } from "./warmup.mjs";

const args = process.argv.slice(2);
const DO_SEND = args.includes("--send");
const APPROVED = args.includes("--i-approve");
const li = args.indexOf("--leads");
const LEADS_FILE = li >= 0 ? args[li + 1] : PATHS.leads;

const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normDot = (d) => String(d ?? "").replace(/[^0-9]/g, "");

async function main() {
  const sender = parseSender(SENDER.from);
  const blocking = preflight(sender);

  // Best-effort syncs (no-op without env): pull opt-outs + engagement so we never email someone who
  // unsubscribed or already clicked through.
  await syncSuppression();
  const eng = await syncEngagement();

  const suppression = loadSuppression();
  const store = loadLeads(LEADS_FILE);

  // Mark engaged leads from the funnel feed (in-memory; persisted only on a real send).
  const nowIso = new Date().toISOString();
  const engagedMarked = eng.ok ? applyEngagement(store, eng.engaged, nowIso) : 0;

  const now = new Date();
  // Active = enrolled, not done, not engaged, not suppressed.
  const active = [...store.values()].filter(
    (l) => isActive(l) && !isSuppressed(suppression, { email: l.email, dotNumber: l.dotNumber }),
  );

  const due = [];
  const waiting = [];
  for (const lead of active) {
    const step = nextDue(lead, now, SEQUENCE);
    if (step) due.push({ lead, step });
    else waiting.push(lead);
  }
  // Most overdue first, so a backlog drains oldest-first within the cap.
  due.sort((a, b) => (nextDueAt(a.lead)?.getTime() || 0) - (nextDueAt(b.lead)?.getTime() || 0));

  // Cap = the warmup-ramped daily TOTAL still left today (shared with the step-1 sender via the log).
  // Follow-ups run first in daily-send.sh, so they get first claim on the day's budget.
  const cap = SEND.dailyCap > 0 ? remainingToday() : due.length;
  const toSend = due.slice(0, cap);

  console.log(
    `sequence: store ${store.size} · active ${active.length} · due ${due.length} · waiting ${waiting.length} · ` +
      `engagement ${ENGAGE.url ? "configured" : "not configured"}${engagedMarked ? ` (+${engagedMarked} marked engaged)` : ""}`,
  );
  console.log(`cap ${SEND.dailyCap || "(unset)"} → ${toSend.length} to send`);

  if (toSend.length) {
    console.log("\nDue now:");
    for (const { lead, step } of toSend) console.log(`  • USDOT ${lead.dotNumber} · ${lead.legalName || "?"} → step ${step}`);
  }
  const upcoming = waiting
    .map((l) => ({ l, at: nextDueAt(l) }))
    .filter((x) => x.at)
    .sort((a, b) => a.at - b.at)
    .slice(0, 5);
  if (upcoming.length) {
    console.log("\nNext to unlock:");
    for (const { l, at } of upcoming) console.log(`  • USDOT ${l.dotNumber} → step ${l.seqStep + 1} at ${at.toISOString()}`);
  }

  if (!DO_SEND || !APPROVED) {
    console.log(`\nPREVIEW ONLY — 0 emails sent. To send: node --env-file=.env sequence-send.mjs --send --i-approve`);
    if (blocking.length) console.log("BLOCKING RAILS:\n  - " + blocking.join("\n  - "));
    else console.log("All rails clear; add --send --i-approve to go.");
    return;
  }

  if (blocking.length) {
    console.error("REFUSING TO SEND — unmet rails:\n  - " + blocking.join("\n  - "));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(SEND_LOG), { recursive: true });
  const delay = Math.max(0, Math.floor(60000 / (SEND.ratePerMin || 20)));
  let ok = 0;
  let failed = 0;
  for (const { lead, step } of toSend) {
    const key = normDot(lead.dotNumber);
    try {
      const draft = STEP_DRAFTERS[step](lead);
      const id = await sendOne(sender, {
        to: lead.email,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        unsubscribeUrl: draft.unsubscribeUrl,
      });
      const ts = new Date().toISOString();
      const prev = store.get(key) || lead;
      store.set(key, { ...recordSent(prev, step, ts, SEQUENCE), lastContactedAt: ts, contactCount: (prev.contactCount || 0) + 1 });
      fs.appendFileSync(SEND_LOG, JSON.stringify({ ts, dot: key, email: normEmail(lead.email), messageId: id, step }) + "\n");
      ok++;
    } catch (err) {
      failed++;
      console.error(`  send failed for USDOT ${key} step ${step}: ${err.message}`);
    }
    await sleep(delay);
  }
  saveLeads(store, LEADS_FILE);
  console.log(`\ndone — sent ${ok}, failed ${failed}. Store updated.`);
}

main().catch((err) => {
  console.error("sequence-send failed:", err.message);
  process.exit(1);
});
