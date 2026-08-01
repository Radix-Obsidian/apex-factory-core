#!/usr/bin/env node
// Apex copywriter-auditor — ECC PreToolUse hook (tier-1, code-based grading).
// Blocks Write/Edit of customer-facing copy that is generic/commoditized or missing risk-reversal.
// Input: Claude Code hook JSON on stdin. Exit 0 = allow; exit 2 = block (stderr shown to the agent).
// Audit logic lives in audit-core.mjs so the eval harness tests this exact gate.
import { readFileSync } from 'node:fs';
import { auditCopy } from './audit-core.mjs';
import { applyPosture, postureBanner, resolvePosture } from '../ops/posture.mjs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data; try { data = JSON.parse(raw || '{}'); } catch { process.exit(0); }

const tool = data.tool_name || '';
if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

const ti = data.tool_input || {};
const file = ti.file_path || '';
const content = ti.content ?? ti.new_string ?? '';

const audit = auditCopy(file, content);
if (!audit.enforced) process.exit(0);

// D31 — persuasion is a taste gate, so it is posture-RELAXABLE. (The honesty gate is not.)
const posture = resolvePosture();
const { fails, warns, blocked, relaxed } = applyPosture('copywriter', audit, posture);
const banner = postureBanner(posture);

if (blocked) {
  console.error('🏭 copywriter-auditor BLOCKED this write:');
  for (const f of fails) console.error('  ✗ ' + f);
  for (const w of warns) console.error('  ⚠ ' + w);
  if (banner) console.error(banner);
  console.error('Rewrite per .cursorrules (Godin status / Hormozi risk-reversal / Enns authority), then retry.');
  process.exit(2);
}
if (relaxed) console.error('🏭 copywriter-auditor — posture=dangerous: the following would normally BLOCK:');
for (const w of warns) console.error('🏭 copywriter-auditor ⚠ ' + w);
if (banner) console.error(banner);
process.exit(0);
