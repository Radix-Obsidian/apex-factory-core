#!/usr/bin/env node
// Tier-1 eval (code-based grading, per Anthropic's eval guide): measure the regex copywriter gate
// against a labeled corpus. Positive class = "should be BLOCKED" (bad copy). Reports a confusion
// matrix + precision / recall / F1 / accuracy, lists every miss, and exits nonzero if F1 < target
// so it can act as a CI gate. It imports the SAME audit logic the live hook uses (hooks/audit-core.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verdict } from '../hooks/audit-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET_F1 = Number(process.env.TARGET_F1 ?? 0.85); // Anthropic's worked example uses F1 >= 0.85

const rows = readFileSync(join(HERE, 'corpus.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l));

let tp = 0, fp = 0, fn = 0, tn = 0, ignoreOK = 0, ignoreBad = 0;
const misses = [];

for (const r of rows) {
  const pred = verdict(r.file, r.content); // 'bad' | 'good' | 'ignore'
  if (r.label === 'ignore') {
    if (pred === 'ignore') ignoreOK++;
    else { ignoreBad++; misses.push({ ...r, pred, kind: 'WRONGLY ENFORCED' }); }
    continue;
  }
  // good/bad labels: a 'bad' prediction = the gate blocks.
  const predBlocks = pred === 'bad';
  const shouldBlock = r.label === 'bad';
  if (shouldBlock && predBlocks) tp++;
  else if (!shouldBlock && predBlocks) { fp++; misses.push({ ...r, pred, kind: 'FALSE POSITIVE (blocked good copy)' }); }
  else if (shouldBlock && !predBlocks) { fn++; misses.push({ ...r, pred, kind: 'FALSE NEGATIVE (let bad copy through)' }); }
  else tn++;
}

const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
const enforced = tp + fp + fn + tn;
const accuracy = enforced ? (tp + tn) / enforced : 0;
const pct = x => (x * 100).toFixed(1) + '%';

console.log('🏭 Tier-1 copywriter-gate eval (code-based grading)\n');
console.log(`corpus: ${rows.length} cases  (${enforced} enforced copy, ${ignoreOK + ignoreBad} ignore)\n`);
console.log('confusion matrix (positive = should be BLOCKED):');
console.log(`  TP ${tp}   FP ${fp}`);
console.log(`  FN ${fn}   TN ${tn}\n`);
console.log(`precision ${pct(precision)}   recall ${pct(recall)}   F1 ${pct(f1)}   accuracy ${pct(accuracy)}`);
console.log(`ignore-correctness: ${ignoreOK}/${ignoreOK + ignoreBad} non-copy files correctly skipped\n`);

if (misses.length) {
  console.log('misses (what tier-2 LLM judge should catch):');
  for (const m of misses) console.log(`  #${m.id} [${m.kind}] ${m.file}\n      "${m.content.slice(0, 80)}"\n      ↳ ${m.note}`);
  console.log('');
}

const pass = f1 >= TARGET_F1;
console.log(`${pass ? '✅ PASS' : '❌ BELOW TARGET'}: F1 ${pct(f1)} vs target ${pct(TARGET_F1)}`);
if (!pass) console.log('   → the regex gate has known recall gaps on generic-but-clean copy. Promote tier-2 (promptfoo G-Eval) for the quality dimension.');
process.exit(pass ? 0 : 1);
