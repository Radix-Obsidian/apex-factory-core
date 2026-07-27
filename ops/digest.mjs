#!/usr/bin/env node
// ops/digest.mjs — the WEEKLY FOUNDER REPORT (D20 + GTM). One message: per-SKU health + revenue +
// support, the GTM funnel/lead status, and any escalations or pending founder actions. This is the
// "you just get a weekly report" surface — the founder reads one Telegram message, nothing else.
//
//   node ops/digest.mjs                 # dry print (compose, show, send nothing)
//   node ops/digest.mjs --json          # machine-readable
//   node --env-file=.env ops/digest.mjs --send   # send to Telegram (TELEGRAM_BOT_TOKEN/CHAT_ID)
//
// $0, no LLM, never charges, never takes an irreversible action. The factory-operator agent can call
// this and add narration; on its own it's a deterministic compose+send.

import { loadRegistry, liveSkus } from "./registry.mjs";
import { operate } from "./operate.mjs";
import { gtmStats } from "../gtm/waimd/stats.mjs";

const SEND = process.argv.includes("--send");
const JSON_OUT = process.argv.includes("--json");

const fmtHealth = (h) => (h ? `${h.state}${h.note ? ` (${h.note})` : ""}` : "n/a");
const fmtRev = (r) => (r?.ok ? `$${r.paying_mrr_usd} MRR [${r.mode}]` : r?.reason || "n/a");

function compose(report, gtm) {
  const lines = [];
  const date = report.ts.slice(0, 10);
  lines.push(`📊 Waimd factory — weekly report (${date})`);
  lines.push("");

  for (const s of report.skus) {
    lines.push(`▸ ${s.slug} [${s.status}] ${s.live_url || ""}`.trim());
    lines.push(`   health:  ${fmtHealth(s.health)}`);
    lines.push(`   revenue: ${fmtRev(s.revenue)}`);
    if (s.support) lines.push(`   support: ${s.support.open} open · ${s.support.escalations.length} escalation(s)`);
  }

  lines.push("");
  lines.push("▸ GTM (Waimd outreach)");
  lines.push(`   lead store: ${gtm.storeTotal} (queued ${gtm.queued} · sent ${gtm.sent} · suppressed ${gtm.suppressed})`);
  lines.push(`   emails sent (7d): ${gtm.sent7d} · total ${gtm.sentTotal}`);
  if (gtm.sentTotal === 0) lines.push("   sending: GATED — outreach.waimd.org not yet warmed (no emails sent)");

  // Escalations + pending founder actions across the portfolio (the only things that need a human).
  const escalations = [];
  for (const s of report.skus) {
    for (const e of s.support?.escalations || []) escalations.push(`#${e.id} (${s.slug}): ${e.reasons.join(", ")}`);
  }
  const actions = [];
  const reg = loadRegistry();
  for (const s of liveSkus(reg)) for (const a of s.pending_founder_actions || []) actions.push(`[${s.slug}] ${a}`);
  // D24 — killed SKUs leave liveSkus, but their TEARDOWN (live Stripe/deploy/env/cron) must stay visible until
  // done. Surface killed SKUs' pending actions here until the founder sets teardown_complete:true in the registry.
  for (const s of reg.skus.filter(x => x.status === 'killed' && !x.teardown_complete))
    for (const a of s.pending_founder_actions || []) actions.push(`[${s.slug} · TEARDOWN] ${a}`);

  if (escalations.length) {
    lines.push("");
    lines.push("⛔ ESCALATIONS (need you):");
    for (const e of escalations) lines.push(`   - ${e}`);
  }
  if (actions.length) {
    lines.push("");
    lines.push("⚠ Pending founder actions:");
    for (const a of actions) lines.push(`   - ${a}`);
  }
  if (!escalations.length) {
    lines.push("");
    lines.push("✅ No emergencies. Factory is running.");
  }

  return lines.join("\n");
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("FAIL: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (use --env-file=.env)");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const j = await res.json();
  if (!j.ok) {
    console.error("Telegram send failed:", JSON.stringify(j));
    process.exit(1);
  }
  console.log(`sent (message ${j.result.message_id})`);
}

const reg = loadRegistry();
const report = await operate(reg);
const gtm = gtmStats();

if (JSON_OUT) {
  console.log(JSON.stringify({ ts: report.ts, skus: report.skus, gtm }, null, 2));
} else {
  const text = compose(report, gtm);
  console.log(text);
  if (SEND) {
    console.log("\n— sending to Telegram —");
    await sendTelegram(text);
  } else {
    console.log("\n[dry] add --send (with --env-file=.env) to post this to Telegram.");
  }
}
