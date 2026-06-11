#!/usr/bin/env node
// PreToolUse hook (matcher: Task) — enforces the Fable 5 per-run budget at the tool-call layer.
// factory-architect is the ONLY Fable agent (MODELS.md), so we cap its invocations at FABLE_MAX_PER_RUN
// (default 2). Exit 2 = block (the model sees the message and must decompose + use Sonnet instead).
// Counter lives in runs/.fable-budget; loop.sh resets it at the start of each run. All other tools pass.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COUNT_FILE = path.join(HERE, '..', 'runs', '.fable-budget');
const MAX = Number(process.env.FABLE_MAX_PER_RUN || 2);

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch {}
  const tool = input.tool_name || input.toolName || '';
  const ti = input.tool_input || input.toolInput || {};
  const sub = ti.subagent_type || ti.subagentType || '';

  if (tool !== 'Task' || sub !== 'factory-architect') process.exit(0); // not a Fable call — allow

  let n = 0;
  try { n = parseInt(fs.readFileSync(COUNT_FILE, 'utf8'), 10) || 0; } catch {}
  if (n >= MAX) {
    console.error(`Fable budget exhausted (${n}/${MAX} factory-architect calls this run). Do NOT invoke ` +
      `factory-architect again — decompose the task into smaller subtasks and use factory-builder (Sonnet). See MODELS.md.`);
    process.exit(2); // block
  }
  try { fs.mkdirSync(path.dirname(COUNT_FILE), { recursive: true }); fs.writeFileSync(COUNT_FILE, String(n + 1)); } catch {}
  process.exit(0); // allow, counted
});
