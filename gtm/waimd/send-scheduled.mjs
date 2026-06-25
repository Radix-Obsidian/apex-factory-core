#!/usr/bin/env node
// send-scheduled.mjs — timezone-aware batch sender. Groups leads by state → local timezone,
// schedules each group to send at ~8 AM in the lead's timezone. Wraps send.mjs logic.
//
// Usage:
//   node --env-file=.env send-scheduled.mjs --batch data/batches/batch-XXXX.json --send --i-approve
//
// Dry run (no --send): prints the schedule without sending.

import fs from "node:fs";
import path from "node:path";

// US state → IANA timezone (simplified: uses most-common tz per state)
const STATE_TZ = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise",
  IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago",
  KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles",
  NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York",
  NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago", WY: "America/Denver", DC: "America/New_York",
  PR: "America/Puerto_Rico", GU: "Pacific/Guam", VI: "America/Virgin",
};

const TARGET_HOUR = 8; // 8 AM local

function getNextSendTime(tz) {
  const now = new Date();
  // Find what time it is right now in the lead's timezone
  const localNowStr = now.toLocaleString("en-US", { timeZone: tz });
  const localNow = new Date(localNowStr);
  const localHour = localNow.getHours();

  // Build target: today at 8 AM local, or tomorrow if already past 8 AM
  const target = new Date(localNow);
  target.setHours(TARGET_HOUR, 0, 0, 0);
  if (localHour >= TARGET_HOUR) {
    target.setDate(target.getDate() + 1);
  }

  // Convert back to UTC offset
  const diffMs = target.getTime() - localNow.getTime();
  return new Date(now.getTime() + diffMs);
}

function groupByTimezone(items) {
  const groups = new Map();
  for (const item of items) {
    const state = (item.lead.state || "").toUpperCase();
    const tz = STATE_TZ[state] || "America/Chicago"; // default to Central
    if (!groups.has(tz)) groups.set(tz, []);
    groups.get(tz).push(item);
  }
  return groups;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const bi = args.indexOf("--batch");
  const BATCH_FILE = bi >= 0 ? args[bi + 1] : "";
  const DO_SEND = args.includes("--send");
  const APPROVED = args.includes("--i-approve");

  if (!BATCH_FILE) {
    console.error("Usage: node --env-file=.env send-scheduled.mjs --batch <file> [--send --i-approve]");
    process.exit(1);
  }

  const { SENDER, SEND, PATHS } = await import("./config.mjs");
  const { loadLeads, saveLeads, loadSuppression, isSuppressed, normEmail } = await import("./store.mjs");

  const batch = JSON.parse(fs.readFileSync(BATCH_FILE, "utf8"));
  const suppression = loadSuppression();
  const store = loadLeads();

  // Filter eligible
  const eligible = batch.items.filter((it) => {
    const lead = store.get(String(it.lead.dotNumber)) || it.lead;
    if (isSuppressed(suppression, { email: it.lead.email, dotNumber: it.lead.dotNumber })) return false;
    if (lead.status === "sent") return false;
    return true;
  });

  const cap = SEND.dailyCap > 0 ? SEND.dailyCap : eligible.length;
  const toSend = eligible.slice(0, cap);

  console.log(`batch: ${path.basename(BATCH_FILE)} | ${batch.items.length} items | ${eligible.length} eligible | cap ${cap} | sending ${toSend.length}`);

  const groups = groupByTimezone(toSend);
  const schedule = [...groups.entries()]
    .map(([tz, items]) => ({ tz, sendAt: getNextSendTime(tz), items }))
    .sort((a, b) => a.sendAt - b.sendAt);

  console.log("\n📅 Send schedule:");
  for (const g of schedule) {
    const localTime = g.sendAt.toLocaleString("en-US", { timeZone: g.tz, hour: "numeric", minute: "2-digit", hour12: true });
    console.log(`  ${g.tz}: ${g.items.length} leads at ~${localTime} local (${g.sendAt.toISOString()})`);
  }

  if (!DO_SEND || !APPROVED) {
    console.log("\nPREVIEW ONLY. Add --send --i-approve to go live.");
    return;
  }

  // Preflight checks
  const fails = [];
  if (SEND.dailyCap <= 0) fails.push("WAIMD_DAILY_CAP is 0");
  if (!process.env.BREVO_API_KEY) fails.push("BREVO_API_KEY not set");
  if (!SENDER.postalAddress) fails.push("WAIMD_POSTAL_ADDRESS not set");
  if (fails.length) {
    console.error("REFUSING — unmet rails:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }

  const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
  const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;

  function parseSender(from) {
    const m = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1] || "Waimd", email: m[2].trim() };
    return { name: "Waimd", email: String(from).trim() };
  }

  const sender = parseSender(SENDER.from);
  let totalOk = 0, totalFailed = 0;

  for (const group of schedule) {
    const waitMs = group.sendAt.getTime() - Date.now();
    if (waitMs > 0) {
      console.log(`\n⏳ Waiting ${Math.round(waitMs / 60000)}m until ${group.tz} window (${group.sendAt.toISOString()})...`);
      await sleep(waitMs);
    }

    console.log(`\n📤 Sending ${group.items.length} emails for ${group.tz}...`);
    const delay = Math.max(0, Math.floor(60000 / (SEND.ratePerMin || 20)));

    for (const item of group.items) {
      const key = String(item.lead.dotNumber);
      try {
        const listUnsub = `<mailto:${SENDER.replyTo}?subject=unsubscribe>, <${item.draft.unsubscribeUrl}>`;
        const res = await fetch(BREVO_ENDPOINT, {
          method: "POST",
          headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender,
            to: [{ email: item.lead.email }],
            replyTo: { email: SENDER.replyTo },
            subject: item.draft.subject,
            htmlContent: item.draft.html,
            textContent: item.draft.text,
            headers: { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          }),
        });
        if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        const data = await res.json().catch(() => ({}));
        const msgId = data?.messageId != null ? String(data.messageId) : "sent";

        const prev = store.get(key) || item.lead;
        store.set(key, { ...prev, status: "sent", lastContactedAt: new Date().toISOString(), contactCount: (prev.contactCount || 0) + 1 });
        fs.appendFileSync(SEND_LOG, JSON.stringify({ ts: new Date().toISOString(), dot: key, email: normEmail(item.lead.email), messageId: msgId, tz: group.tz }) + "\n");
        totalOk++;
      } catch (err) {
        totalFailed++;
        console.error(`  failed USDOT ${key}: ${err.message}`);
      }
      await sleep(delay);
    }
  }

  saveLeads(store);
  console.log(`\n✅ Done — sent ${totalOk}, failed ${totalFailed}. Store updated.`);
}

main().catch((err) => {
  console.error("send-scheduled failed:", err.message);
  process.exit(1);
});
