#!/usr/bin/env node
// Apex honesty-auditor — ECC PreToolUse hook (tier-1, code-based grading). Sibling of the
// copywriter-auditor: that gate enforces PERSUASION, this one enforces TRUTHFULNESS (METHOD.md §5).
// Blocks Write/Edit of customer-facing copy that fabricates social proof, fakes scarcity/inventory,
// or states availability as certain without a timestamp/evidence marker.
// Input: Claude Code hook JSON on stdin. Exit 0 = allow; exit 2 = block (stderr shown to the agent).
// Audit logic lives in honesty-core.mjs so the test grades this exact gate.
import { readFileSync } from 'node:fs';
import { auditHonesty } from './honesty-core.mjs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data; try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

const tool = data.tool_name || '';
if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

const ti = data.tool_input || {};
const file = ti.file_path || '';
const content = ti.content ?? ti.new_string ?? '';

const { enforced, fails, warns } = auditHonesty(file, content);
if (!enforced) process.exit(0);

if (fails.length) {
  console.error('🏭 honesty-auditor BLOCKED this write (the never-lie charter):');
  for (const f of fails) console.error('  ✗ ' + f);
  for (const w of warns) console.error('  ⚠ ' + w);
  console.error('Show only what is real and evidenced (LISTED→CHECKED→CONFIRMED). Rewrite, then retry.');
  process.exit(2);
}
for (const w of warns) console.error('🏭 honesty-auditor ⚠ ' + w);
process.exit(0);
