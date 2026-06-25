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
//   • from = outreach.waimd.org     (isolate reputation from the apex domain's p=reject)
//   • --send AND --i-approve        (two-key human/explicit confirmation)
// Plus: suppression honored, already-sent skipped, daily cap enforced, List-Unsubscribe header set,
// every send logged. This is "near-zero-touch": approve a batch, then it runs within these rails.

import fs from "node:fs";
import path from "node:path";
import { SENDER, SEND, PATHS } from "./config.mjs";
import { loadLeads, saveLeads, loadSuppression, isSuppressed, normEmail } from "./store.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--batch");
const BATCH_FILE = i >= 0 ? args[i + 1] : "";
const DO_SEND = args.includes("--send");
const APPROVED = args.includes("--i-approve");

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseSender(from) {
  const m = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || "Waimd", email: m[2].trim() };
  return { name: "Waimd", email: String(from).trim() };
}

// Returns [] of blocking reasons; empty = all rails clear.
function preflight(sender) {
  const fail = [];
  if (!BATCH_FILE) fail.push("no --batch <file>");
  if (SEND.dailyCap <= 0) fail.push("WAIMD_DAILY_CAP is 0 (sending disabled until ramped)");
  if (!process.env.BREVO_API_KEY) fail.push("BREVO_API_KEY not set");
  if (!SENDER.postalAddress) fail.push("WAIMD_POSTAL_ADDRESS not set (CAN-SPAM requires a physical address)");
  if (!/@(.*\.)?outreach\.waimd\.org$/i.test(sender.email))
    fail.push(`from must be on outreach.waimd.org (got ${sender.email}) to isolate sending reputation`);
  return fail;
}

async function sendOne(sender, item) {
  const { lead, draft } = item;
  const listUnsub = `<mailto:${SENDER.replyTo}?subject=unsubscribe>, <${draft.unsubscribeUrl}>`;
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender,
      to: [{ email: lead.email }],
      replyTo: { email: SENDER.replyTo },
      subject: draft.subject,
      htmlContent: draft.html,
      textContent: draft.text,
      headers: { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json().catch(() => ({}));
  return data?.messageId != null ? String(data.messageId) : "sent";
}

async function main() {
  const sender = parseSender(SENDER.from);
  const blocking = preflight(sender);

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
  const toSend = eligible.slice(0, SEND.dailyCap > 0 ? SEND.dailyCap : eligible.length);

  console.log(`batch ${path.basename(BATCH_FILE)}: ${batch.items.length} items · ${eligible.length} eligible · cap ${SEND.dailyCap || "(unset)"} → ${toSend.length} to send`);

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
      const id = await sendOne(sender, item);
      const prev = store.get(key) || item.lead;
      store.set(key, { ...prev, status: "sent", lastContactedAt: new Date().toISOString(), contactCount: (prev.contactCount || 0) + 1 });
      fs.appendFileSync(SEND_LOG, JSON.stringify({ ts: new Date().toISOString(), dot: key, email: normEmail(item.lead.email), messageId: id }) + "\n");
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
