#!/usr/bin/env node
// ops/model-router.mjs — the single source of truth for task→model routing (D23).
// Formalizes MODELS.md's 4-rung ladder + the prose bullet list in loop.sh into ONE importable table,
// so loop.sh, heartbeat, workflows, and the model-guard hook all resolve models the same way.
// Pure logic, $0, no model calls. The default is Sonnet — NEVER Opus — so unknown work can't silently
// climb to the top rung. Opus/Fable are reachable only by explicitly-named code/architecture tasks.

const M = {
  fable: 'claude-fable-5',
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  free: 'openrouter/free',
};

// task-type → { rung, model }. Rungs mirror MODELS.md (0 = $0 OpenRouter-free … 4 = Fable scalpel).
export const TABLE = {
  // Rung 4 — Fable 5 (novel architecture only; via factory-architect, capped by hooks/fable-budget.mjs)
  'architecture-novel': { rung: 4, model: M.fable },
  // Rung 3 — Opus 4.8 (rationed, CODE only)
  'refactor-multifile': { rung: 3, model: M.opus },
  'tdd-known-shape': { rung: 3, model: M.opus },
  'brief-decomposition': { rung: 3, model: M.opus },
  // Rung 2 — Sonnet 4.6 (default workhorse: build + most reasoning + copy)
  'feature-dev': { rung: 2, model: M.sonnet },
  'tdd': { rung: 2, model: M.sonnet },
  'review': { rung: 2, model: M.sonnet },
  'planning': { rung: 2, model: M.sonnet },
  'copy': { rung: 2, model: M.sonnet },
  'docs': { rung: 2, model: M.sonnet },
  'research-synthesis': { rung: 2, model: M.sonnet },
  'report': { rung: 2, model: M.sonnet },
  // Rung 1 — Haiku 4.5 (cheap, bounded, high-frequency)
  'read': { rung: 1, model: M.haiku },
  'lookup': { rung: 1, model: M.haiku },
  'scaffold': { rung: 1, model: M.haiku },
  'test-stub': { rung: 1, model: M.haiku },
  'media-prompt': { rung: 1, model: M.haiku },
  'pdf': { rung: 1, model: M.haiku },
  'watcher': { rung: 1, model: M.haiku },
  'poll': { rung: 1, model: M.haiku },
  'status': { rung: 1, model: M.haiku },
  'digest': { rung: 1, model: M.haiku },
  'support': { rung: 1, model: M.haiku },
  // Rung 0 — $0 OpenRouter-free (off the Max allowance)
  'heartbeat-narration': { rung: 0, model: M.free },
  'eval-judge': { rung: 0, model: M.free },
};

// The tasks where Opus/Fable is legitimately permitted. Everything else (copy, docs, report, pdf,
// watcher, poll, status, digest, narration, support, research) is NON-code and must NOT reach Opus/Fable.
const CODE_TASKS = new Set([
  'architecture-novel', 'refactor-multifile', 'tdd-known-shape', 'brief-decomposition',
  'feature-dev', 'tdd', 'review', 'planning', 'scaffold', 'test-stub',
]);

// Agent → code/non-code, mirroring .claude/agents/*.md pins. Code agents may use Opus/Fable; the rest may not.
export const CODE_AGENTS = new Set(['factory-builder', 'factory-architect', 'factory-planner', 'factory-reviewer']);
export const NONCODE_AGENTS = new Set(['factory-copy', 'factory-scout', 'factory-support', 'factory-operator']);

export const MODELS = M;
export const DEFAULT_MODEL = M.sonnet; // never Opus by default

export function modelFor(task) { return (TABLE[task] && TABLE[task].model) || DEFAULT_MODEL; }
export function rungFor(task) { return TABLE[task] ? TABLE[task].rung : 2; }
export function isCodeTask(task) { return CODE_TASKS.has(task); }
export function isCodeAgent(agent) { return CODE_AGENTS.has(agent); }
export function isNonCodeAgent(agent) { return NONCODE_AGENTS.has(agent); }
export function isHeavyModel(model) { return /opus|fable/i.test(String(model || '')); }

// ---- self-test ----
function runTests() {
  const eq = (a, b, msg) => { if (a !== b) { console.error(`✗ ${msg}: got ${a}, want ${b}`); return 1; } return 0; };
  let f = 0;
  f += eq(modelFor('copy'), M.sonnet, "copy → Sonnet");
  f += eq(modelFor('report'), M.sonnet, "report → Sonnet");
  f += eq(modelFor('watcher'), M.haiku, "watcher → Haiku");
  f += eq(modelFor('pdf'), M.haiku, "pdf → Haiku");
  f += eq(modelFor('status'), M.haiku, "status → Haiku");
  f += eq(modelFor('refactor-multifile'), M.opus, "refactor-multifile → Opus");
  f += eq(modelFor('architecture-novel'), M.fable, "architecture-novel → Fable");
  f += eq(modelFor('heartbeat-narration'), M.free, "heartbeat-narration → OpenRouter free");
  f += eq(modelFor('something-unknown'), M.sonnet, "unknown → Sonnet default (never Opus)");
  f += eq(isCodeTask('report'), false, "report is NOT code");
  f += eq(isCodeTask('copy'), false, "copy is NOT code");
  f += eq(isCodeTask('watcher'), false, "watcher is NOT code");
  f += eq(isCodeTask('refactor-multifile'), true, "refactor IS code");
  f += eq(isCodeTask('feature-dev'), true, "feature-dev IS code");
  f += eq(isHeavyModel('claude-opus-4-8'), true, "opus is heavy");
  f += eq(isHeavyModel('claude-sonnet-4-6'), false, "sonnet is not heavy");
  if (f) { console.error(`router-test: ${f} FAILED`); process.exit(1); }
  console.log('router-test: OK (all assertions passed)');
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === 'test') runTests();
  else if (arg) console.log(modelFor(arg));
  else { console.log('usage: node ops/model-router.mjs <task-type> | test'); process.exit(1); }
}
