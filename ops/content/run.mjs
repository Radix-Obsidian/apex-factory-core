#!/usr/bin/env node
// ops/content/run.mjs — the content engine entrypoint a scheduler calls every 3 days. Runs
// changelog.mjs then repurpose.mjs in sequence, each in its own node process so one failing step
// can't take the other down. Forwards any extra args (e.g. --days N) to both children.
//
//   node ops/content/run.mjs              # default 14-day window
//   node ops/content/run.mjs --days 21
//
// $0, no LLM, never charges, never commits. Exits non-zero only if a step itself crashes.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const extraArgs = process.argv.slice(2);

const STEPS = [
  { name: "changelog", file: path.join(HERE, "changelog.mjs") },
  { name: "repurpose", file: path.join(HERE, "repurpose.mjs") },
];

let failed = 0;
for (const step of STEPS) {
  console.log(`\n=== content/${step.name} ===`);
  const res = spawnSync(process.execPath, [step.file, ...extraArgs], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`content/${step.name}: exited with status ${res.status}`);
    failed++;
  }
}

console.log(`\ncontent engine: ${STEPS.length - failed}/${STEPS.length} step(s) ok`);
process.exit(failed ? 1 : 0);
