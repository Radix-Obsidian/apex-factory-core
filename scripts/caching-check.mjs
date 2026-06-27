#!/usr/bin/env node
// caching-check.mjs — D22: the deterministic, $0, no-model prompt-caching validator (see CACHING.md).
//
// Walks a SKU repo's source and asserts every direct Anthropic call site routes through a cached
// wrapper / tags its static `system` block with cache_control. It is the caching analog of
// design-check (D18) and closed-loop-check (D19): structural, not a type-checker. It confirms the
// caching DISCIPLINE is wired; it does not judge whether a prompt clears the 1024-token cache floor.
//
//   exit 0  — every call site compliant, OR the SKU has no direct Anthropic calls (e.g. dot-navigator)
//   exit 1  — one or more raw-uncached call sites (block) or untagged chokepoints (warn)
//
// Usage:  node scripts/caching-check.mjs <sku-path>     (or SKU=<path> node scripts/caching-check.mjs)
// Shares the detector with the live hook + the eval (hooks/caching-core.mjs) — one source of truth.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { classifyFile, shouldAnalyze, isViolation } from "../hooks/caching-core.mjs";

// Skip build output, deps, and dev tooling. The standard governs the SHIPPED product's request
// paths; eval harnesses and one-off scripts (conventionally under scripts/) are dev tooling, not
// production model calls, so they're excluded the same way *.test.* files are.
const SKIP_DIR = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo", ".vercel",
  "scripts", "__tests__", "__mocks__", "e2e",
]);
const IS_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

const skuPath = resolve(process.argv[2] || process.env.SKU || ".");

function walk(dir, acc = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, acc); }
    else if (shouldAnalyze(p) && !IS_TEST.test(e.name)) acc.push(p);
  }
  return acc;
}

const violations = [];
let scanned = 0, callSites = 0;

if (!existsSync(skuPath) || !statSync(skuPath).isDirectory()) {
  console.log(`✗ caching-check FAILED — SKU path not found or not a directory: ${skuPath}`);
  process.exit(1);
}

for (const file of walk(skuPath)) {
  scanned++;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  const { verdict, reasons } = classifyFile(file, content);
  if (verdict !== "n/a") callSites++;
  if (isViolation(verdict)) {
    violations.push({ file: relative(skuPath, file), verdict, reason: reasons[0] });
  }
}

console.log(`caching-check — ${skuPath}`);
console.log(`  scanned ${scanned} code file(s); ${callSites} direct Anthropic call site(s)`);

if (violations.length === 0) {
  console.log(callSites === 0
    ? `\n✓ caching-check PASSED — no direct Anthropic calls (nothing to cache). (D22)`
    : `\n✓ caching-check PASSED — every call site is cached / routed through a wrapper. (D22)`);
  process.exit(0);
}

const blocks = violations.filter((v) => v.verdict === "block");
const warns = violations.filter((v) => v.verdict === "warn");
console.log(`\n✗ caching-check FAILED (${violations.length} uncached call site(s)):`);
for (const v of blocks) console.log(`  ✗ [raw inline] ${v.file} — ${v.reason}`);
for (const v of warns) console.log(`  ⚠ [chokepoint] ${v.file} — ${v.reason}`);
console.log(`\nD22: route SKU model calls through a cached wrapper (chassis/lib/llm.ts) and tag the static`);
console.log(`\`system\` block with cache_control. See CACHING.md, then re-run.`);
process.exit(1);
