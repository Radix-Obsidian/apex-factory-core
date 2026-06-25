#!/usr/bin/env node
// pipeline.mjs — the Waimd lead engine tick (source → personalize → dedup → store). $0, deterministic,
// READ-ONLY toward the outside world (it never sends; sending is send.mjs, gated + warmed separately).
//
//   node pipeline.mjs                 # dry run: source + report, write nothing
//   node pipeline.mjs --commit        # upsert into the lead store + write a draft batch
//   node pipeline.mjs --commit --batch 50   # also cap the draft batch size (default 100)
//   node pipeline.mjs --json          # machine-readable summary (for the weekly digest / ops tick)
//
// Flow: pull brand-new interstate carriers from the FMCSA Company Census, compute each one's audit-due
// date + personalized deep-link + cold-email draft, drop anyone already in the store or on the
// suppression list, and (with --commit) persist. The freshest, most-urgent NEW leads become a draft
// batch for review → send.

import fs from "node:fs";
import path from "node:path";
import { fetchNewEntrants } from "./census.mjs";
import { toLead, draftEmail } from "./personalize.mjs";
import { qcEnabled, validateDot } from "./qcmobile.mjs";
import { loadLeads, saveLeads, upsertLeads, loadSuppression, isSuppressed } from "./store.mjs";
import { PATHS, FILTER } from "./config.mjs";

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const JSON_OUT = args.includes("--json");
const VALIDATE = args.includes("--validate"); // run QCMobile on each new lead (needs webKey)
const batchIdx = args.indexOf("--batch");
const BATCH_SIZE = batchIdx >= 0 ? Math.max(1, parseInt(args[batchIdx + 1], 10) || 100) : 100;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const log = (...a) => !JSON_OUT && console.log(...a);

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();

  const suppression = loadSuppression();
  const store = loadLeads();

  log(`🔎 FMCSA Company Census — interstate new entrants added ${FILTER.minAgeDays}-${FILTER.maxAgeDays}d ago…`);
  const rows = await fetchNewEntrants(now);
  log(`   sourced ${rows.length} census rows`);

  const seen = new Set();
  const fresh = []; // brand-new to our store (eligible to contact)
  const stats = { sourced: rows.length, badEmail: 0, suppressed: 0, dupInBatch: 0, alreadyKnown: 0 };

  for (const row of rows) {
    const lead = toLead(row, now);
    if (!lead.email || !EMAIL_RE.test(lead.email)) { stats.badEmail++; continue; }
    const key = lead.dotNumber;
    if (seen.has(key)) { stats.dupInBatch++; continue; }
    seen.add(key);
    if (isSuppressed(suppression, { email: lead.email, dotNumber: lead.dotNumber })) { stats.suppressed++; continue; }
    if (store.has(key)) { stats.alreadyKnown++; continue; }
    fresh.push(lead);
  }

  // Optional send-time-ish validation against QCMobile (drops revoked/not-allowed carriers).
  let validated = fresh;
  if (VALIDATE && qcEnabled()) {
    validated = [];
    for (const lead of fresh) {
      const v = await validateDot(lead.dotNumber);
      if (v.skipped || v.ok !== false) validated.push({ ...lead, qc: v.skipped ? null : v });
    }
    log(`   QCMobile validated ${validated.length}/${fresh.length}`);
  } else if (VALIDATE) {
    log("   --validate requested but FMCSA_QCMOBILE_WEBKEY not set — skipping validation");
  }

  // Most urgent first: soonest audit-due date leads to the front of the draft batch.
  validated.sort((a, b) => String(a.auditDueDate).localeCompare(String(b.auditDueDate)));
  const batch = validated.slice(0, BATCH_SIZE).map((lead) => ({ lead, draft: draftEmail(lead) }));

  const summary = {
    ts: nowIso,
    ...stats,
    fresh: validated.length,
    batchSize: batch.length,
    storeBefore: store.size,
    committed: COMMIT,
  };

  if (COMMIT) {
    // Ingest ONLY the drafted batch (status queued), not every sourced lead — so the store stays the set
    // of leads we've actually queued/contacted, and the next run's re-source naturally feeds the next
    // most-urgent batch (already-queued leads are skipped as alreadyKnown). No lead is ever stranded.
    const batchLeads = batch.map((b) => ({ ...b.lead, status: "queued" }));
    const { added, updated } = upsertLeads(store, batchLeads, nowIso);
    const total = saveLeads(store);
    summary.added = added;
    summary.updated = updated;
    summary.storeAfter = total;

    fs.mkdirSync(PATHS.batches, { recursive: true });
    const stamp = nowIso.replace(/[-:T]/g, "").slice(0, 14);
    const batchFile = path.join(PATHS.batches, `batch-${stamp}.json`);
    fs.writeFileSync(batchFile, JSON.stringify({ ts: nowIso, count: batch.length, items: batch }, null, 2));
    summary.batchFile = batchFile;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  log("\n── summary ─────────────────────────────");
  log(`sourced:        ${stats.sourced}`);
  log(`already known:  ${stats.alreadyKnown}`);
  log(`suppressed:     ${stats.suppressed}`);
  log(`bad/no email:   ${stats.badEmail}`);
  log(`NEW eligible:   ${validated.length}`);
  log(`draft batch:    ${batch.length}${COMMIT ? ` → ${summary.batchFile}` : " (dry run — use --commit to write)"}`);
  if (COMMIT) log(`store:          ${summary.storeBefore} → ${summary.storeAfter} (+${summary.added})`);

  log("\n── sample (most urgent audits first) ───");
  for (const { lead, draft } of batch.slice(0, 5)) {
    log(`• USDOT ${lead.dotNumber} · ${lead.legalName} (${lead.state || "?"}) · audit due ${lead.auditDueDate}`);
    log(`    ${draft.subject}`);
    log(`    ${lead.deepLink}`);
  }
  if (!batch.length) log("  (no new eligible leads this run)");
}

main().catch((err) => {
  console.error("pipeline failed:", err.message);
  process.exit(1);
});
