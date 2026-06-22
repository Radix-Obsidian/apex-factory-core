#!/usr/bin/env node
// ops/operate.mjs — THE POST-LAUNCH TICK (the loop the factory was missing, D20). For each live SKU in
// the registry it runs the deterministic operators — health canary, revenue read, support triage — and
// emits one structured portfolio report. $0, no LLM, never hangs (each operator is bounded and degrades
// to n/a). The factory-operator AGENT runs this, then narrates, drafts the staged support replies, and
// surfaces escalations to the founder. No irreversible action is ever taken here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, liveSkus } from './registry.mjs';
import { skuRevenue } from './revenue.mjs';
import { probeSku } from './canary.mjs';
import { triageInbox } from './support.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(HERE, '..', 'runs');

export async function operateSku(sku) {
  const [health, revenue] = await Promise.all([probeSku(sku), skuRevenue(sku)]);
  const support = sku.support && sku.support.source !== 'none' ? triageInbox(sku) : null;
  return {
    slug: sku.slug,
    status: sku.status,
    live_url: sku.live_url || null,
    health,
    revenue,
    support,
    pending_founder_actions: sku.pending_founder_actions || [],
  };
}

export async function operate(reg) {
  const skus = liveSkus(reg);
  const results = [];
  for (const s of skus) results.push(await operateSku(s)); // sequential: tiny N, keeps output ordered + load low
  return { ts: new Date().toISOString(), count: results.length, skus: results };
}

const fmtHealth = h => (h ? `${h.state} (${h.note})` : 'n/a');
const fmtRev = r => (r?.ok ? `$${r.paying_mrr_usd} paying MRR [${r.mode}]` : (r?.reason || 'n/a'));

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const brief = process.argv.includes('--brief');
  const reg = loadRegistry();
  const report = await operate(reg);
  // append a one-line audit record (kaizen trail) — never destructive
  try { fs.mkdirSync(RUNS, { recursive: true }); fs.appendFileSync(path.join(RUNS, 'operate.jsonl'), JSON.stringify(report) + '\n'); } catch { /* heartbeat must not die on a log write */ }

  if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

  if (brief) {
    for (const s of report.skus) {
      const sup = s.support ? ` · support ${s.support.open} open/${s.support.escalations.length} esc` : '';
      console.log(`• ${s.slug}: health ${fmtHealth(s.health)} · ${fmtRev(s.revenue)}${sup}`);
    }
    process.exit(0);
  }

  console.log(`🏭 OPERATE — ${report.ts} — ${report.count} SKU(s)`);
  for (const s of report.skus) {
    console.log(`\n▸ ${s.slug} [${s.status}] ${s.live_url || ''}`);
    console.log(`  health:  ${fmtHealth(s.health)}`);
    console.log(`  revenue: ${fmtRev(s.revenue)}`);
    if (s.support) {
      console.log(`  support: ${s.support.open} open · ${s.support.escalations.length} escalation(s) · ${s.support.to_draft.length} to draft${s.support.note ? ` · ${s.support.note}` : ''}`);
      for (const e of s.support.escalations) console.log(`    ⛔ ESCALATE #${e.id} — ${e.reasons.join(', ')}`);
    }
    if (s.pending_founder_actions.length) {
      console.log('  ⚠ founder actions:');
      for (const a of s.pending_founder_actions) console.log(`    - ${a}`);
    }
  }
}
