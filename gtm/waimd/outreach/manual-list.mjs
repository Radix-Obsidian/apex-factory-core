#!/usr/bin/env node
// manual-list.mjs — generate a founder-MANUAL outreach sheet: the N most-urgent new interstate carriers
// with a ready-to-send 1:1 email + a phone opener, for the founder to personally reach out (highest-
// intent, today, no warmup needed). TCPA-safe: founder-initiated, not automated; the phone opener asks
// consent before texting. Leads put on this sheet are ADDED TO SUPPRESSION so the automated cold-email
// sender never double-contacts them. Re-running yields the NEXT batch (suppressed ones are skipped).
//
//   node outreach/manual-list.mjs            # default 25
//   node outreach/manual-list.mjs --n 40

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchNewEntrants } from "../census.mjs";
import { toLead } from "../personalize.mjs";
import { loadSuppression, isSuppressed, addSuppression } from "../store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "data", "manual-list.md");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nIdx = process.argv.indexOf("--n");
const N = nIdx >= 0 ? Math.max(1, parseInt(process.argv[nIdx + 1], 10) || 25) : 25;

const pretty = (iso) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "soon";

function emailScript(lead) {
  const who = lead.officerFirstName || "there";
  const co = lead.dbaName || lead.legalName || "your carrier";
  return [
    `Subject: ${co} — your FMCSA safety audit (${pretty(lead.auditDueDate)})`,
    ``,
    `Hi ${who}, saw ${co} just got interstate authority — congrats. FMCSA runs the New Entrant Safety Audit for new carriers, and yours lands around ${pretty(lead.auditDueDate)}; a lot of new carriers get blindsided by it. I built a free tool that lays out every federal milestone dated to your authority date:`,
    lead.deepLink,
    `It's free, no signup. Happy to walk you through it if useful. — AJ, Waimd`,
  ].join("\n");
}

function phoneOpener(lead) {
  const who = lead.officerFirstName ? lead.officerFirstName : "the owner";
  const co = lead.dbaName || lead.legalName || "your company";
  return `Hi, is this ${who}? I work with brand-new interstate carriers on FMCSA compliance — congrats on getting ${co} running. Quick reason for the call: your new-entrant safety audit is due around ${pretty(lead.auditDueDate)}, and I put together a free dated checklist so it doesn't catch you off guard. Can I text you the link?`;
}

async function main() {
  const now = new Date();
  const suppression = loadSuppression();
  const rows = await fetchNewEntrants(now);

  const seen = new Set();
  const leads = [];
  for (const row of rows) {
    const lead = toLead(row, now);
    if (!lead.email || !EMAIL_RE.test(lead.email)) continue;
    if (seen.has(lead.dotNumber)) continue;
    seen.add(lead.dotNumber);
    if (isSuppressed(suppression, { email: lead.email, dotNumber: lead.dotNumber })) continue;
    leads.push(lead);
  }
  leads.sort((a, b) => String(a.auditDueDate).localeCompare(String(b.auditDueDate))); // most urgent first
  const picked = leads.slice(0, N);

  const lines = [];
  lines.push(`# Waimd — founder-manual outreach list (${now.toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(`The ${picked.length} most-urgent new interstate carriers (soonest safety audit first). These are yours to personally email/call — they've been suppressed from the automated cold-email campaign so there's no double-contact. Re-run for the next batch.`);
  lines.push("");
  lines.push("| # | USDOT | Carrier | State | Audit due | Email | Phone |");
  lines.push("|---|-------|---------|-------|-----------|-------|-------|");
  picked.forEach((l, i) => {
    lines.push(`| ${i + 1} | ${l.dotNumber} | ${(l.dbaName || l.legalName || "").replace(/\|/g, "/")} | ${l.state || "?"} | ${pretty(l.auditDueDate)} | ${l.email} | ${l.phone || "-"} |`);
  });
  lines.push("");
  lines.push("---");
  lines.push("");
  picked.forEach((l, i) => {
    lines.push(`## ${i + 1}. ${l.dbaName || l.legalName} · USDOT ${l.dotNumber} · ${l.state || "?"}`);
    lines.push(`Audit due **${pretty(l.auditDueDate)}** · ${l.email}${l.phone ? ` · ${l.phone}` : ""}`);
    lines.push("");
    lines.push("**Email:**");
    lines.push("```");
    lines.push(emailScript(l));
    lines.push("```");
    lines.push("**Phone opener:**");
    lines.push("```");
    lines.push(phoneOpener(l));
    lines.push("```");
    lines.push("");
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"));

  // suppress these from the automated sender so we never double-contact
  const added = addSuppression(picked.map((l) => l.email));

  console.log(`wrote ${picked.length} manual leads → ${OUT}`);
  console.log(`suppressed ${added} email(s) from the automated campaign`);
  console.log(`(of ${leads.length} eligible this run)`);
}

main().catch((err) => {
  console.error("manual-list failed:", err.message);
  process.exit(1);
});
