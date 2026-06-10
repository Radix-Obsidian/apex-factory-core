#!/usr/bin/env node
// Apex copywriter-auditor — ECC PreToolUse hook (tier-1, code-based grading).
// Blocks Write/Edit of customer-facing copy that is generic/commoditized or missing risk-reversal.
// Input: Claude Code hook JSON on stdin. Exit 0 = allow; exit 2 = block (stderr shown to the agent).
// Audit logic lives in audit-core.mjs so the eval harness tests this exact gate.
import { readFileSync } from 'node:fs';
import { auditCopy } from './audit-core.mjs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data; try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

const tool = data.tool_name || '';
if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

const ti = data.tool_input || {};
const file = ti.file_path || '';
const content = ti.content ?? ti.new_string ?? '';

const { enforced, fails, warns } = auditCopy(file, content);
if (!enforced) process.exit(0);

if (fails.length) {
  console.error('🏭 copywriter-auditor BLOCKED this write:');
  for (const f of fails) console.error('  ✗ ' + f);
  for (const w of warns) console.error('  ⚠ ' + w);
  console.error('Rewrite per .cursorrules (Godin status / Hormozi risk-reversal / Enns authority), then retry.');
  process.exit(2);
}
for (const w of warns) console.error('🏭 copywriter-auditor ⚠ ' + w);
process.exit(0);
