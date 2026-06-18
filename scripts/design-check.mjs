#!/usr/bin/env node
// design-check.mjs — D18: the deterministic, $0, no-model design-system validator.
//
// Asserts that a SKU repo ships an intentional, Claude-Design-authored brand kit:
//   1. a `design-system/` folder exists,
//   2. with >=1 foundations/*.html AND >=1 components/*.html card,
//   3. every card carries a valid first-line `<!-- @dsCard group="..." -->` marker
//      (the DesignSync / Claude Design contract — see the /design-sync skill),
//   4. the app actually exposes design tokens (>=1 `--color-*` custom property in app CSS).
//
// This is the DESIGN analog of the copy gate, but by policy NON-BLOCKING and structural:
// it checks that a design system EXISTS and is well-formed; it does NOT auto-judge aesthetics
// (that stays Claude-the-model's job via /design-sync). Exit 0 = pass, non-zero = fail.
//
// Usage:  node scripts/design-check.mjs <sku-path>     (or SKU=<path> node scripts/design-check.mjs)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DS_CARD_RE = /^<!--\s*@dsCard\s+group="[^"]+"\s*-->/;
const TOKEN_RE = /--color-[a-z0-9-]+\s*:/i;

const skuPath = resolve(process.argv[2] || process.env.SKU || ".");
const fails = [];
const notes = [];

const fail = (m) => fails.push(m);
const ok = (m) => notes.push(`✓ ${m}`);

const htmlFiles = (dir) =>
  existsSync(dir) && statSync(dir).isDirectory()
    ? readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => join(dir, f))
    : [];

const firstNonEmptyLine = (file) =>
  readFileSync(file, "utf8").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";

// 1. the SKU repo + design-system/ folder
if (!existsSync(skuPath) || !statSync(skuPath).isDirectory()) {
  fail(`SKU path not found or not a directory: ${skuPath}`);
} else {
  const dsDir = join(skuPath, "design-system");
  if (!existsSync(dsDir)) {
    fail(`no design-system/ folder at ${dsDir} — author one via the /design-sync skill (Claude Design)`);
  } else {
    ok(`design-system/ present`);

    // 2. foundations + components cards
    const foundations = htmlFiles(join(dsDir, "foundations"));
    const components = htmlFiles(join(dsDir, "components"));
    if (foundations.length === 0) fail(`design-system/foundations/ has no *.html cards (need >=1: colors, typography, ...)`);
    else ok(`${foundations.length} foundation card(s)`);
    if (components.length === 0) fail(`design-system/components/ has no *.html cards (need >=1: buttons, a signature component, ...)`);
    else ok(`${components.length} component card(s)`);

    // 3. every card carries a valid @dsCard marker on its first non-empty line
    for (const card of [...foundations, ...components]) {
      if (!DS_CARD_RE.test(firstNonEmptyLine(card))) {
        fail(`missing/invalid '<!-- @dsCard group="..." -->' first line: ${card.replace(skuPath + "/", "")}`);
      }
    }
    if (fails.length === 0) ok(`every card has a valid @dsCard marker`);
  }

  // 4. the app exposes design tokens (custom properties wired into the build)
  const cssCandidates = [
    join(skuPath, "app", "globals.css"),
    join(skuPath, "src", "app", "globals.css"),
    join(skuPath, "styles", "globals.css"),
  ].filter(existsSync);
  const tokenCss = cssCandidates.find((f) => TOKEN_RE.test(readFileSync(f, "utf8")));
  if (!tokenCss) {
    fail(`no '--color-*' design tokens found in app CSS (${cssCandidates.length ? cssCandidates.join(", ") : "no globals.css located"}) — export the kit's tokens into the build`);
  } else {
    ok(`design tokens wired into ${tokenCss.replace(skuPath + "/", "")}`);
  }
}

// report
console.log(`design-check — ${skuPath}`);
for (const n of notes) console.log(`  ${n}`);
if (fails.length) {
  console.log(`\n✗ design-check FAILED (${fails.length}):`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`\nD18: every SKU ships an intentional brand kit (Claude Design via /design-sync). Fix the above, then re-run.`);
  process.exit(1);
}
console.log(`\n✓ design-check PASSED — brand kit present, well-formed, and wired (D18).`);
