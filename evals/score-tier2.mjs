#!/usr/bin/env node
// (b) Analyzer: read promptfoo's JSON output for the corpus grading and compute tier-2 P/R/F1
// against the SAME ground-truth labels as tier-1, then compare. Run AFTER the gated promptfoo run:
//   npx promptfoo@latest eval -c evals/promptfoo-corpus.yaml --output evals/tier2-results.json
//   node evals/score-tier2.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'tier2-results.json');

const labelByCopy = new Map(
  readFileSync(join(HERE, 'corpus.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l)).filter(r => r.label !== 'ignore')
    .map(r => [r.content, r.label]));

let raw;
try { raw = JSON.parse(readFileSync(RESULTS, 'utf8')); }
catch { console.error(`No ${RESULTS}. Run promptfoo first (see promptfoo-corpus.yaml header).`); process.exit(2); }

// promptfoo output schema varies slightly by version; dig for per-test {vars.copy, success}.
const items = raw?.results?.results ?? raw?.results ?? [];
let tp = 0, fp = 0, fn = 0, tn = 0, unmatched = 0, errored = 0;
for (const it of items) {
  const copy = it?.vars?.copy ?? it?.testCase?.vars?.copy;
  const gr = it?.gradingResult;
  // promptfoo puts the rubric FAIL *reason* in `error` even on a valid grade — so only treat
  // genuine rate-limit/timeout/network failures (or a missing grade) as errored, not a real verdict.
  const infraErr = !gr || /rate.?limit|timed?\s?out|timeout|exhausted|ECONN|network|socket/i.test(String(it?.error || ''));
  if (infraErr) { errored++; continue; }
  const passed = gr.pass; // true = judged GOOD copy; false = judged BAD (would block)
  const label = labelByCopy.get(copy);
  if (label == null || passed == null) { unmatched++; continue; }
  const predBlocks = passed === false; // failed g-eval => bad copy => would block
  const shouldBlock = label === 'bad';
  if (shouldBlock && predBlocks) tp++;
  else if (!shouldBlock && predBlocks) fp++;
  else if (shouldBlock && !predBlocks) fn++;
  else tn++;
}
const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
const pct = x => (x * 100).toFixed(1) + '%';

console.log('🏭 Tier-2 (LLM-judge) corpus grading vs ground truth\n');
console.log(`  scored ${tp + fp + fn + tn}/${items.length}   errored(excluded) ${errored}   unmatched ${unmatched}`);
if (tp + fp + fn + tn === 0) {
  console.log('  ⚠ ALL cases errored (judge rate-limited/timed out) — NO valid tier-2 metrics. Re-run with a usable judge.');
  process.exit(3);
}
console.log(`  TP ${tp}  FP ${fp}  FN ${fn}  TN ${tn}`);
console.log(`  precision ${pct(precision)}   recall ${pct(recall)}   F1 ${pct(f1)}`);
console.log(`\n  tier-1 (regex) F1 was 75.0%, recall 66.7% — tier-2 should lift recall by catching #13/#14/#15.`);
