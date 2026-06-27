#!/usr/bin/env node
// send.mjs — the GATED outreach sender. Built now so the engine is end-to-end, but inert by default:
// it refuses to send a single email unless EVERY rail is in place. Lighting it up is a deliberate act
// (warm outreach.waimd.org, set the env, approve a batch), never an accident.
//
//   node send.mjs --batch data/batches/batch-XXXX.json            # preview only (counts, no send)
//   node --env-file=.env send.mjs --batch <file> --send --i-approve   # actually send (all rails required)
//
// Rails enforced before any send:
//   • WAIMD_DAILY_CAP > 0           (sending is off until explicitly ramped)
//   • BREVO_API_KEY                 (transport)
//   • WAIMD_POSTAL_ADDRESS          (CAN-SPAM: physical address in every email)
//   • from ≠ apex waimd.org         (isolate reputation from the apex domain's p=reject)
//   • --send AND --i-approve        (two-key human/explicit confirmation)
// Plus: suppression honored, already-sent skipped, daily cap enforced, List-Unsubscribe header set,
// every send logged. This is "near-zero-touch": approve a batch, then it runs within these rails.

import fs from "node:fs";
import path from "node:path";
import { SENDER, SEND } from "./config.mjs";
import { loadLeads, saveLeads, loadSuppression, isSuppressed, normEmail } from "./store.mjs";
import { enroll } from "./sequence.mjs";
import { parseSender, preflight, sendOne } from "./transport.mjs";
import { remainingToday } from "./warmup.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--batch");
const BATCH_FILE = i >= 0 ? args[i + 1] : "";
const DO_SEND = args.includes("--send");
const APPROVED = args.includes("--i-approve");

const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sender = parseSender(SENDER.from);
  const blocking = [...(BATCH_FILE ? [] : ["no --batch <file>"]), ...preflight(sender)];

  const batch = JSON.parse(fs.readFileSync(BATCH_FILE, "utf8"));
  const suppression = loadSuppression();
  const store = loadLeads();

  // Eligible = in batch, not suppressed, not already sent.
  const eligible = batch.items.filter((it) => {
    const lead = store.get(String(it.lead.dotNumber)) || it.lead;
    if (isSuppressed(suppression, { email: it.lead.email, dotNumber: it.lead.dotNumber })) return false;
    if (lead.status === "sent") return false;
    return true;
  });
  // Cap = the warmup-ramped daily TOTAL still left today (shared with the follow-up runner via the log).
  const cap = SEND.dailyCap > 0 ? remainingToday() : eligible.length;
  const toSend = eligible.slice(0, cap);

  console.log(`batch ${path.basename(BATCH_FILE)}: ${batch.items.length} items · ${eligible.length} eligible · cap ${SEND.dailyCap > 0 ? cap : "(unset)"} → ${toSend.length} to send`);

  if (!DO_SEND || !APPROVED) {
    console.log(`\nPREVIEW ONLY — no email sent. To send: node --env-file=.env send.mjs --batch ${BATCH_FILE} --send --i-approve`);
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
  for (const item of toSend) {
    const key = String(item.lead.dotNumber);
    try {
      const id = await sendOne(sender, {
        to: item.lead.email,
        subject: item.draft.subject,
        html: item.draft.html,
        text: item.draft.text,
        unsubscribeUrl: item.draft.unsubscribeUrl,
      });
      const prev = store.get(key) || item.lead;
      const ts = new Date().toISOString();
      // Mark sent AND enroll into the drip (seqStep 1) so the follow-up runner can take it from here.
      store.set(key, enroll({ ...prev, status: "sent", lastContactedAt: ts, contactCount: (prev.contactCount || 0) + 1 }, ts));
      fs.appendFileSync(SEND_LOG, JSON.stringify({ ts, dot: key, email: normEmail(item.lead.email), messageId: id, step: 1 }) + "\n");
      ok++;
    } catch (err) {
      failed++;
      console.error(`  send failed for USDOT ${key}: ${err.message}`);
    }
    await sleep(delay);
  }
  saveLeads(store);
  console.log(`\ndone — sent ${ok}, failed ${failed}. Store updated.`);
}

main().catch((err) => {
  console.error("send failed:", err.message);
  process.exit(1);
});
