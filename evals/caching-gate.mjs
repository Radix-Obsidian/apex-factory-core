#!/usr/bin/env node
// Tier-1 caching-gate eval (code-based grading, per Anthropic's eval guide; D22 — see CACHING.md).
// Measures the prompt-caching detector against a labeled corpus. Positive class = "should be FLAGGED"
// (a call site that violates the standard: block or warn). Reports a confusion matrix +
// precision / recall / F1 / accuracy, lists every miss, AND an exact-verdict accuracy, then exits
// nonzero if F1 < target so it can act as a CI gate. Imports the SAME detector the live hook uses
// (hooks/caching-core.mjs), so the eval measures the real gate.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyFile, isViolation } from "../hooks/caching-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET_F1 = Number(process.env.TARGET_F1 ?? 0.85); // Anthropic's worked example uses F1 >= 0.85

const rows = readFileSync(join(HERE, "caching-corpus.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

// label/verdict → the three eval classes: 'flag' (positive), 'pass' (negative), 'ignore' (n/a).
const cls = (verdict) => (verdict === "n/a" ? "ignore" : isViolation(verdict) ? "flag" : "pass");

let tp = 0, fp = 0, fn = 0, tn = 0, ignoreOK = 0, ignoreBad = 0, exact = 0;
const misses = [];

for (const r of rows) {
  const { verdict } = classifyFile(r.file, r.content);
  if (verdict === r.label) exact++;
  const pred = cls(verdict);
  const want = cls(r.label);

  if (want === "ignore") {
    if (pred === "ignore") ignoreOK++;
    else { ignoreBad++; misses.push({ ...r, verdict, kind: "WRONGLY FLAGGED (n/a file)" }); }
    continue;
  }
  const predFlags = pred === "flag";
  const shouldFlag = want === "flag";
  if (shouldFlag && predFlags) tp++;
  else if (!shouldFlag && predFlags) { fp++; misses.push({ ...r, verdict, kind: "FALSE POSITIVE (flagged a compliant call)" }); }
  else if (shouldFlag && !predFlags) { fn++; misses.push({ ...r, verdict, kind: "FALSE NEGATIVE (missed an uncached call)" }); }
  else tn++;
}

const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
const enforced = tp + fp + fn + tn;
const accuracy = enforced ? (tp + tn) / enforced : 0;
const pct = (x) => (x * 100).toFixed(1) + "%";

console.log("🏭 Tier-1 caching-gate eval (code-based grading)\n");
console.log(`corpus: ${rows.length} cases  (${enforced} call-site, ${ignoreOK + ignoreBad} n/a)\n`);
console.log("confusion matrix (positive = should be FLAGGED as uncached):");
console.log(`  TP ${tp}   FP ${fp}`);
console.log(`  FN ${fn}   TN ${tn}\n`);
console.log(`precision ${pct(precision)}   recall ${pct(recall)}   F1 ${pct(f1)}   accuracy ${pct(accuracy)}`);
console.log(`n/a-correctness: ${ignoreOK}/${ignoreOK + ignoreBad} non-call-site files correctly skipped`);
console.log(`exact-verdict accuracy: ${exact}/${rows.length} (${pct(exact / rows.length)}) — block/warn/compliant/n/a match\n`);

if (misses.length) {
  console.log("misses:");
  for (const m of misses) console.log(`  #${m.id} [${m.kind}] ${m.file}  (pred=${m.verdict}, label=${m.label})\n      ↳ ${m.note}`);
  console.log("");
}

const pass = f1 >= TARGET_F1;
console.log(`${pass ? "✅ PASS" : "❌ BELOW TARGET"}: F1 ${pct(f1)} vs target ${pct(TARGET_F1)}`);
if (!pass) console.log("   → the structural detector has a recall gap; tighten caching-core.mjs or add corpus coverage.");
process.exit(pass ? 0 : 1);
