#!/usr/bin/env node
// Tier-1 eval for the WAIMD decision engine (code-based grading, per Anthropic's eval guide).
//
// Measures the REAL engine — it imports the same module the product ships
// (skus/waimd-housing/engine/), exactly as evals/eval-regex-gate.mjs imports hooks/audit-core.mjs.
// Deterministic, $0, no network, no LLM: the engine is a pure function, so this eval is reproducible.
//
// Positive class = "should be DISQUALIFIED". Reports a confusion matrix + precision / recall / F1 /
// accuracy, PLUS gate-attribution accuracy — because a candidate rejected for the WRONG reason is a
// bug even when the verdict is right (§13: the score must be debuggable, so the reason must be true).
//
// Exits non-zero when F1 or gate attribution falls below target, so it works as a CI gate.
//
// Corpus rows are DELTAS against the PRD §6 worked example (Phoenix, Aug 17 → Nov 16, ≤$1,800/mo,
// ≤20 min, entire furnished place with parking + laundry), evaluated as of 2026-08-01.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runGates } from '../skus/waimd-housing/engine/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET_F1 = Number(process.env.TARGET_F1 ?? 1.0);        // a deterministic engine must be perfect
const TARGET_GATE_ACC = Number(process.env.TARGET_GATE_ACC ?? 1.0);
const ASOF = process.env.WAIMD_ASOF ?? '2026-08-01';

const BASE_REQS = { parking: false, laundry: false, furnished: false, pets: false, private_bath: false };

const BASE_MISSION = {
  id: 'WAIMD-EVAL', facility: 'Banner University Medical Center', city: 'Phoenix', state: 'AZ',
  start_date: '2026-08-17', end_date: '2026-11-16',
  budget_max: 1800, housing_type: 'entire_place', commute_max_minutes: 20,
  requirements: { ...BASE_REQS, parking: true, laundry: true, furnished: true },
};

const BASE_CANDIDATE = {
  id: 'eval', mission_id: 'WAIMD-EVAL', source_name: 'eval-fixture', source_url: 'https://example.test/1',
  monthly_price: 1640, availability_start: '2026-08-01', availability_end: '2026-12-01',
  commute_minutes: 11, housing_type: 'entire_place',
  requirements: { ...BASE_REQS, parking: true, laundry: true, furnished: true },
  evidence_status: 'CHECKED', evidence_checked_at: '2026-08-01',
};

// Shallow merge, with `requirements` merged one level deeper so a row can flip a single amenity.
const merge = (base, delta = {}) => ({
  ...base, ...delta,
  requirements: { ...base.requirements, ...(delta.requirements ?? {}) },
});

const rows = readFileSync(join(HERE, 'waimd-engine-corpus.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l));

let tp = 0, fp = 0, fn = 0, tn = 0, gateRight = 0, gateWrong = 0;
const misses = [];

for (const r of rows) {
  const mission = merge(BASE_MISSION, r.mission);
  const candidate = merge(BASE_CANDIDATE, r.candidate);

  const failure = runGates(mission, candidate, ASOF);
  const predDisqualify = failure !== null;
  const shouldDisqualify = r.label === 'disqualify';

  if (shouldDisqualify && predDisqualify) {
    tp++;
    if (r.gate && failure.gate !== r.gate) {
      gateWrong++;
      misses.push({ ...r, kind: `WRONG GATE (got '${failure.gate}', expected '${r.gate}')`, detail: failure.reason });
    } else gateRight++;
  } else if (!shouldDisqualify && predDisqualify) {
    fp++;
    misses.push({ ...r, kind: 'FALSE POSITIVE (rejected a valid option)', detail: `${failure.gate}: ${failure.reason}` });
  } else if (shouldDisqualify && !predDisqualify) {
    fn++;
    misses.push({ ...r, kind: 'FALSE NEGATIVE (let an unqualified option through)', detail: 'no gate fired' });
  } else tn++;
}

const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
const accuracy = rows.length ? (tp + tn) / rows.length : 0;
const gateAcc = gateRight + gateWrong ? gateRight / (gateRight + gateWrong) : 1;
const pct = x => (x * 100).toFixed(1) + '%';

console.log('🏭 Tier-1 WAIMD decision-engine eval (code-based grading)\n');
console.log(`corpus: ${rows.length} cases, evaluated as of ${ASOF}\n`);
console.log('confusion matrix (positive = should be DISQUALIFIED):');
console.log(`  TP ${tp}   FP ${fp}`);
console.log(`  FN ${fn}   TN ${tn}\n`);
console.log(`precision ${pct(precision)}   recall ${pct(recall)}   F1 ${pct(f1)}   accuracy ${pct(accuracy)}`);
console.log(`gate attribution: ${gateRight}/${gateRight + gateWrong} rejected for the RIGHT reason (${pct(gateAcc)})\n`);

if (misses.length) {
  console.log('misses:');
  for (const m of misses) console.log(`  #${m.id} [${m.kind}]\n      ${m.note}\n      ↳ ${m.detail}`);
  console.log('');
}

const pass = f1 >= TARGET_F1 && gateAcc >= TARGET_GATE_ACC;
if (pass) {
  console.log(`✅ PASS: F1 ${pct(f1)} (target ${pct(TARGET_F1)}) · gate attribution ${pct(gateAcc)} (target ${pct(TARGET_GATE_ACC)})`);
} else {
  console.log(`❌ FAIL: F1 ${pct(f1)} vs ${pct(TARGET_F1)} · gate attribution ${pct(gateAcc)} vs ${pct(TARGET_GATE_ACC)}`);
  console.log('   → the engine is deterministic, so anything below target is a real regression, not noise.');
}
process.exit(pass ? 0 : 1);
