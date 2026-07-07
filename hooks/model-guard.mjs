#!/usr/bin/env node
// PreToolUse hook (matcher: Task) — fail-closed model-tier enforcement (D23).
// Blocks Opus/Fable from being spent on NON-code work (copy, docs, reports, PDFs, watchers, pollers,
// status checks, digests). Policy used to be prose in MODELS.md; this makes it code that says "no".
// Exit 2 = block (the model sees the message and must drop to the right tier). Everything else passes.
//
// Rules (only EXPLICIT model overrides are enforced here; the interactive session model is governed by
// MODELS.md's session/watcher convention + settings, not this hook):
//   - code agents (builder/architect/planner/reviewer)      → Opus/Fable allowed (their own pin governs)
//   - non-code agents (copy/scout/support/operator)         → Opus/Fable override BLOCKED
//   - generic agents (general-purpose/Explore/claude/…):
//        heavy override + code task-type hint               → allowed
//        heavy override + non-code/unknown task-type        → BLOCKED (fail-closed)
//        no heavy override                                  → allowed (session/pins govern)
import { isCodeAgent, isNonCodeAgent, isCodeTask, isHeavyModel, modelFor } from '../ops/model-router.mjs';

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch {}
  const tool = input.tool_name || input.toolName || '';
  const ti = input.tool_input || input.toolInput || {};
  if (tool !== 'Task') process.exit(0); // only guards agent spawns

  const agent = ti.subagent_type || ti.subagentType || '';
  const requested = ti.model || ti.modelName || '';
  const taskType = ti.task_type || ti.taskType || '';
  const heavy = isHeavyModel(requested);

  // Code agents: their frontmatter pin governs; Opus/Fable is legitimate. Allow.
  if (isCodeAgent(agent)) process.exit(0);

  const block = (why, suggest) => {
    console.error(`model-guard: BLOCKED — ${why}. Opus/Fable is reserved for code/architecture (MODELS.md D23). ` +
      `Use ${suggest} instead. Retry with the right tier (e.g. model: '${suggest}') or a code agent.`);
    process.exit(2);
  };

  // Non-code agents may never be overridden onto Opus/Fable.
  if (isNonCodeAgent(agent)) {
    if (heavy) block(`non-code agent '${agent}' requested a heavy model ('${requested}')`, modelFor('copy'));
    process.exit(0);
  }

  // Generic / unknown agent with an explicit heavy override: allow only if the task is declared code.
  if (heavy) {
    if (taskType && isCodeTask(taskType)) process.exit(0); // declared code work — permitted
    block(`generic agent requested '${requested}' for ${taskType ? `non-code task '${taskType}'` : 'an undeclared task'}`,
      modelFor(taskType || 'copy'));
  }

  process.exit(0); // no heavy override — session/pins govern
});
