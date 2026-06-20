#!/usr/bin/env node
// closed-loop-check.mjs — D19: the deterministic, $0, no-model build-side check for the
// "does-it-for-you / closed-loop, NOT horizontal-SaaS-with-AI" standard.
//
// The judge side (the `does_it_for_you` kill-pass bar) decides whether an IDEA may be built. This is the
// BUILD side: it verifies a SKU has actually DESIGNED its loop — declared, in a `CLOSED-LOOP.md` manifest,
// the four things that separate an outcome-owning product from "another tool you operate":
//   1. OUTCOME  — the job it owns end-to-end for the user (what they're really paying for).
//   2. DOES     — what it DOES for them (the action it takes), not merely what it displays.
//   3. STATE    — what it remembers about the user/their world (you can't close a loop you don't persist).
//   4. KEEP-IN-LOOP — how it proactively brings the user back (reminders / alerts / notifications).
//
// Like design-check (D18) this is STRUCTURAL and NON-BLOCKING by policy: it proves the loop was *designed
// and committed to*, not that it's perfect (the kill-pass bar + skeptics judge the substance). Exit 0 = pass.
//
// Usage:  node scripts/closed-loop-check.mjs <sku-path>     (or SKU=<path> node scripts/closed-loop-check.mjs)

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// each section: a label + a heading-keyword matcher (case-insensitive, matches a markdown heading line)
const SECTIONS = [
  { key: "outcome", label: "OUTCOME (the job it owns)", re: /^#{1,4}.*\boutcome\b/im },
  { key: "does", label: "DOES (the action it takes for the user)", re: /^#{1,4}.*\b(does|action|for the user|for them)\b/im },
  { key: "state", label: "STATE (what it remembers)", re: /^#{1,4}.*\b(state|tracks?|remembers?|persist)\b/im },
  { key: "keep", label: "KEEP-IN-LOOP (proactive notify)", re: /^#{1,4}.*\b(keep[- ]?in[- ]?loop|loop|notif|remind|alert)\b/im },
];
const MIN_CONTENT_CHARS = 400; // a real manifest, not a stub

const skuPath = resolve(process.argv[2] || process.env.SKU || ".");
const fails = [];
const notes = [];
const ok = (m) => notes.push(`✓ ${m}`);

if (!existsSync(skuPath) || !statSync(skuPath).isDirectory()) {
  fails.push(`SKU path not found or not a directory: ${skuPath}`);
} else {
  const manifest = ["CLOSED-LOOP.md", "closed-loop.md", join("docs", "CLOSED-LOOP.md")]
    .map((p) => join(skuPath, p))
    .find(existsSync);
  if (!manifest) {
    fails.push(`no CLOSED-LOOP.md — declare the loop this SKU closes (outcome / does / state / keep-in-loop)`);
  } else {
    ok(`manifest present: ${manifest.replace(skuPath + "/", "")}`);
    const text = readFileSync(manifest, "utf8");
    for (const s of SECTIONS) {
      if (s.re.test(text)) ok(`declares ${s.label}`);
      else fails.push(`CLOSED-LOOP.md missing a section for ${s.label}`);
    }
    const body = text.replace(/^#.*$/gm, "").trim();
    if (body.length < MIN_CONTENT_CHARS) {
      fails.push(`CLOSED-LOOP.md is a stub (${body.length} chars of content < ${MIN_CONTENT_CHARS}) — describe the real loop`);
    } else {
      ok(`manifest has substantive content (${body.length} chars)`);
    }
  }
}

console.log(`closed-loop-check — ${skuPath}`);
for (const n of notes) console.log(`  ${n}`);
if (fails.length) {
  console.log(`\n✗ closed-loop-check FAILED (${fails.length}):`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`\nD19: every SKU OWNS THE OUTCOME and closes the loop (does the work + keeps the user in it) — not horizontal SaaS with AI bolted on. Declare it in CLOSED-LOOP.md, then re-run.`);
  process.exit(1);
}
console.log(`\n✓ closed-loop-check PASSED — the loop is declared and committed to (D19).`);
