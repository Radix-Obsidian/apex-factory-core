#!/usr/bin/env node
// ops/waimd-gate.mjs — the waimd-housing validation gate: PRD §23 metrics + §24 kill criteria, as CODE.
//
// D24's own post-mortem found decision-tracking at 0/15 positive outcomes: the finish conditions were
// PROSE, so they never fired. The founder's PRD states its kill criteria numerically, so they belong in
// a command that returns a verdict — not a paragraph someone has to remember to apply.
//
// Deterministic, read-only, $0: no model calls, no network, never writes, never charges.
//
//   exit 0 — CONTINUE / INVESTIGATE / INSUFFICIENT DATA (keep going, or not enough evidence yet)
//   exit 1 — a KILL verdict fired (acquisition angle or product proposition)
//   exit 2 — malformed metrics file
//
// Usage:  node ops/waimd-gate.mjs [path/to/metrics.json] [--json]
// Default metrics path: runs/waimd-metrics.json  (absent → "no data yet", exit 0)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const METRICS_PATH = path.join(HERE, '..', 'runs', 'waimd-metrics.json');

// PRD §23 targets and §24 thresholds — the single source of truth for the numbers.
export const TARGETS = {
  cac_usd_max: 14,          // Metric #1 — ad spend / completed qualified missions
  solvability_min_pct: 80,  // Metric #2 — three qualifying options producible
  paid_rate_min_pct: 30,    // Metric #3 — purchases / completed solvable missions
};
export const THRESHOLDS = {
  budget_usd: 70,           // the founder-authorized validation cap ($10/day x 7)
  min_missions_for_spend: 5,
  fulfilled_for_verdict: 10,
};

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

/**
 * Evaluate the gate. Pure function over a metrics object — the CLI and the test share it.
 * Metrics shape (all optional, default 0):
 *   ad_spend_usd, qualified_missions, fulfilled_missions, solvable_missions, purchases
 * @returns {{verdict:string, kill:boolean, reason:string, metrics:object, actions:string[]}}
 */
export function evaluate(m = {}) {
  const spend      = num(m.ad_spend_usd);
  const qualified  = num(m.qualified_missions);
  const fulfilled  = num(m.fulfilled_missions);
  const solvable   = num(m.solvable_missions);
  const purchases  = num(m.purchases);

  const cac        = qualified > 0 ? spend / qualified : null;
  const solvability= pct(solvable, fulfilled);
  const paidRate   = pct(purchases, solvable);

  const metrics = {
    ad_spend_usd: spend, qualified_missions: qualified, fulfilled_missions: fulfilled,
    solvable_missions: solvable, purchases,
    cac_usd: cac, solvability_pct: solvability, paid_decision_rate_pct: paidRate,
    cac_ok: cac === null ? null : cac <= TARGETS.cac_usd_max,
    solvability_ok: solvability === null ? null : solvability >= TARGETS.solvability_min_pct,
    paid_rate_ok: paidRate === null ? null : paidRate >= TARGETS.paid_rate_min_pct,
  };

  // §24 — Kill acquisition angle: the full budget is spent and the funnel did not deliver missions.
  if (spend >= THRESHOLDS.budget_usd && qualified < THRESHOLDS.min_missions_for_spend)
    return { verdict: 'KILL ACQUISITION', kill: true, metrics,
      reason: `$${spend.toFixed(2)} spent (cap $${THRESHOLDS.budget_usd}) for only ${qualified} qualified mission(s) — under the ${THRESHOLDS.min_missions_for_spend} floor`,
      actions: ['Do NOT spend another $70 automatically.', 'The acquisition angle failed, which is not the same as the product failing — change the channel/creative hypothesis before re-testing.'] };

  // §24 — the remaining verdicts need 10 successfully fulfilled missions.
  if (fulfilled < THRESHOLDS.fulfilled_for_verdict)
    return { verdict: 'INSUFFICIENT DATA', kill: false, metrics,
      reason: `${fulfilled}/${THRESHOLDS.fulfilled_for_verdict} fulfilled mission(s) — too early for a product verdict`,
      actions: [`Fulfil ${THRESHOLDS.fulfilled_for_verdict - fulfilled} more mission(s), then re-run.`] };

  if (purchases === 0)
    return { verdict: 'KILL PROPOSITION', kill: true, metrics,
      reason: `${fulfilled} fulfilled mission(s) and 0 purchases`,
      actions: ['Do NOT build more features.', 'The proposition — not the polish — is what failed.'] };

  if (purchases <= 2)
    return { verdict: 'INVESTIGATE', kill: false, metrics,
      reason: `${fulfilled} fulfilled, ${purchases} purchase(s) — signal, but not enough`,
      actions: ['Interview the behavior.', 'Change exactly ONE variable, then re-run.'] };

  return { verdict: 'CONTINUE', kill: false, metrics,
    reason: `${fulfilled} fulfilled, ${purchases} purchase(s) — the falsifiable metric passed`,
    actions: ['Earned another iteration.'] };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter(a => a !== '--json');
  const json = process.argv.includes('--json');
  const file = args[0] || METRICS_PATH;

  if (!fs.existsSync(file)) {
    const out = { verdict: 'NO DATA', kill: false, reason: `no metrics file at ${path.relative(process.cwd(), file)} — nothing measured yet`, metrics: {}, actions: ['Launch is founder-gated; the gate arms itself once the funnel emits data.'] };
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log('— WAIMD VALIDATION GATE (PRD §23/§24) —');
      console.log(`  no data yet (${path.relative(process.cwd(), file)} absent)`);
      console.log('  Targets: CAC ≤ $14 · solvability ≥ 80% · paid decision rate ≥ 30%');
      console.log('  Falsifiable metric: 10 qualified Housing Missions → ≥3 paid Housing Decisions');
    }
    process.exit(0);
  }

  let m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`✗ waimd-gate: unreadable metrics file ${file} — ${e.message}`); process.exit(2); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) { console.error(`✗ waimd-gate: metrics must be a JSON object — ${file}`); process.exit(2); }

  const r = evaluate(m);
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.kill ? 1 : 0); }

  const mark = v => (v === null ? '–' : v ? '✓' : '✗');
  const fmt = (v, s) => (v === null ? 'n/a' : s(v));
  console.log('— WAIMD VALIDATION GATE (PRD §23/§24) —');
  console.log(`  spend $${r.metrics.ad_spend_usd.toFixed(2)} · qualified ${r.metrics.qualified_missions} · fulfilled ${r.metrics.fulfilled_missions} · solvable ${r.metrics.solvable_missions} · purchases ${r.metrics.purchases}`);
  console.log(`  ${mark(r.metrics.cac_ok)} CAC              ${fmt(r.metrics.cac_usd, v => '$' + v.toFixed(2))}  (target ≤ $${TARGETS.cac_usd_max})`);
  console.log(`  ${mark(r.metrics.solvability_ok)} solvability      ${fmt(r.metrics.solvability_pct, v => v.toFixed(1) + '%')}  (target ≥ ${TARGETS.solvability_min_pct}%)`);
  console.log(`  ${mark(r.metrics.paid_rate_ok)} paid decision rate ${fmt(r.metrics.paid_decision_rate_pct, v => v.toFixed(1) + '%')}  (target ≥ ${TARGETS.paid_rate_min_pct}%)`);
  console.log(`\n  VERDICT: ${r.verdict} — ${r.reason}`);
  for (const a of r.actions) console.log(`    → ${a}`);
  process.exit(r.kill ? 1 : 0);
}
