#!/usr/bin/env node
// ops/waimd-ready.mjs — the pre-$70 production-readiness gate for waimd-housing (D27).
//
// The founder approved the PRD but is withholding the $70 Meta authorization until: "the finished beta
// has been tested / evals have been tested / everything's tested / stable on a production-grade level."
// This command is what turns that sentence into a verdict nobody has to take on trust — including me.
//
// It is deliberately HARSH and FAIL-CLOSED:
//   - a check whose evidence cannot be found is RED, never "probably fine"
//   - it cannot go GREEN while the product repo or the beta does not exist
//   - it exits non-zero unless every blocking check passes, so "not ready" can never read as approval
//
// Deterministic, read-only, $0: no model calls, no network, never writes, never charges.
//
//   exit 0 — READY (every blocking check green)
//   exit 1 — NOT READY (at least one blocking check red)
//
// Usage:  node ops/waimd-ready.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRegistry, findSku } from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SLUG = 'waimd-housing';

const exists = p => fs.existsSync(path.join(ROOT, p));

/** Run a command; true only on exit 0. Never throws — a missing tool is a failed check, not a crash. */
function passes(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe', timeout: 120_000 });
    return true;
  } catch { return false; }
}

/** @typedef {{key:string,label:string,state:'GREEN'|'RED'|'AMBER',blocking:boolean,detail:string}} Check */

export function runChecks() {
  /** @type {Check[]} */
  const checks = [];
  const add = (key, label, state, blocking, detail) => checks.push({ key, label, state, blocking, detail });

  let sku = null;
  try { sku = findSku(loadRegistry(), SLUG); } catch { /* registry unreadable — caught below */ }

  // ── 1. Spec + registry integrity ──
  add('spec', 'PRD committed (verbatim constitution)',
    exists(`skus/${SLUG}/PRD.md`) ? 'GREEN' : 'RED', true,
    exists(`skus/${SLUG}/PRD.md`) ? 'skus/waimd-housing/PRD.md' : 'missing');

  add('registry', 'SKU registered and registry structurally valid',
    sku && passes('node', ['ops/registry.mjs', 'validate']) ? 'GREEN' : 'RED', true,
    sku ? `status: ${sku.status}` : 'SKU not found in skus/registry.json');

  // ── 2. "Evals have been tested" ──
  add('engine', 'Decision engine: unit + invariant suite',
    exists(`skus/${SLUG}/engine/index.ts`) && passes('node', ['--test', 'tests/waimd-housing/engine.test.ts'])
      ? 'GREEN' : 'RED', true,
    'node --test tests/waimd-housing/engine.test.ts');

  add('eval', 'Decision engine: tier-1 eval vs labeled corpus',
    exists('evals/waimd-engine-corpus.jsonl') && passes('node', ['evals/waimd-engine.mjs'])
      ? 'GREEN' : 'RED', true,
    'node evals/waimd-engine.mjs (F1 + gate attribution at target)');

  // ── 3. "Everything's tested" — the factory guardrails this SKU depends on ──
  add('honesty', 'Honesty gate (never-lie charter) green',
    passes('bash', ['tests/honesty-auditor.test.sh']) ? 'GREEN' : 'RED', true,
    'tests/honesty-auditor.test.sh');

  add('killgate', 'Validation kill-gate armed and tested',
    passes('bash', ['tests/waimd-gate.test.sh']) ? 'GREEN' : 'RED', true,
    'tests/waimd-gate.test.sh (PRD §24 verdicts)');

  add('ops', 'Ops layer green (registry/revenue/support/canary)',
    passes('node', ['--test', 'ops/ops.test.mjs']) ? 'GREEN' : 'RED', true,
    'node --test ops/ops.test.mjs');

  // ── 4. "The finished beta has been tested" — the product itself ──
  // WAIMD_HOUSING_PATH lets a non-sibling checkout (container, CI, a different layout) point the gate
  // at the real clone without editing committed config. The registry stays the source of truth.
  const repoPath = process.env.WAIMD_HOUSING_PATH || sku?.local_path || `../${SLUG}`;
  const repoAbs = path.resolve(ROOT, repoPath);
  const dirHere = fs.existsSync(repoAbs);
  // A directory is NOT a repo. An empty `git clone` of a fresh GitHub repo produces a directory
  // containing only .git — checking existence alone would report "scaffolded" for nothing at all.
  // Scaffolded means the spine is actually present: a package.json plus a Next.js app dir.
  const scaffolded = dirHere
    && fs.existsSync(path.join(repoAbs, 'package.json'))
    && fs.existsSync(path.join(repoAbs, 'app'));
  add('repo', 'Product repo scaffolded (chassis spine present)',
    scaffolded ? 'GREEN' : 'RED', true,
    scaffolded ? repoPath
      : dirHere ? `${repoPath} exists but is EMPTY — no package.json/app: the chassis spine was never applied`
        : `${repoPath} not present — founder-gated (D21): create from the chassis template`);

  add('beta', 'Beta vertical slice built (intake → decision → checkout)',
    scaffolded ? 'AMBER' : 'RED', true,
    scaffolded ? 'spine present; slice completeness not yet asserted' : 'blocked: repo not scaffolded');

  add('e2e', 'End-to-end run on the 3 synthetic missions (§32 Day 6)',
    'RED', true,
    scaffolded ? 'not yet run' : 'blocked: repo not scaffolded. Synthetic fixtures only — no fake customer evidence');

  // ── 5. Payment provider — Polar, and TEST mode until the publish gate ──
  const billing = sku?.billing ?? {};
  const providerOk = billing.provider === 'polar' && !!billing.secret_env;
  const keySet = billing.secret_env ? !!process.env[billing.secret_env] : false;
  add('payments', `Payment provider configured (${billing.provider ?? 'none'})`,
    providerOk && keySet ? 'GREEN' : providerOk ? 'AMBER' : 'RED', true,
    providerOk
      ? (keySet ? `${billing.secret_env} set, mode: ${billing.mode}` : `${billing.secret_env} not set in this environment`)
      : 'registry billing.provider must be polar with a secret_env NAME');

  add('testmode', 'Billing still in TEST mode (publish gate D5 not yet crossed)',
    billing.mode === 'test' ? 'GREEN' : 'RED', true,
    `mode: ${billing.mode ?? 'unset'} — must be "test" until PUBLISH_APPROVAL_TOKEN`);

  // ── 6. Factory acceptance checks against the product repo (D18/D19/D22) ──
  // These validators are structural: run against an EMPTY tree they scan nothing and can exit 0
  // vacuously (caching-check literally passes at "0 direct Anthropic calls"). Gating them on
  // `scaffolded` stops an empty directory from manufacturing a green.
  for (const [key, label, script] of [
    ['design', 'Brand kit / design-check (D18)', 'scripts/design-check.mjs'],
    ['closedloop', 'Owns the outcome / closed-loop-check (D19)', 'scripts/closed-loop-check.mjs'],
    ['caching', 'Prompt-caching discipline / caching-check (D22)', 'scripts/caching-check.mjs'],
  ]) {
    add(key, label,
      scaffolded && passes('node', [script, repoPath]) ? 'GREEN' : 'RED', true,
      scaffolded ? `node ${script} ${repoPath}` : 'blocked: repo not scaffolded (a vacuous pass is not a pass)');
  }

  // ── 7. Non-blocking posture note: the money gate itself ──
  add('spend', 'Meta $70 authorization', 'AMBER', false,
    'founder decision — this gate must be fully GREEN first (PRD NEXT DECISION GATE)');

  return checks;
}

export function verdict(checks) {
  const blocking = checks.filter(c => c.blocking);
  const red = blocking.filter(c => c.state === 'RED');
  const amber = blocking.filter(c => c.state === 'AMBER');
  return {
    ready: red.length === 0 && amber.length === 0,
    red: red.length,
    amber: amber.length,
    green: blocking.filter(c => c.state === 'GREEN').length,
    total: blocking.length,
  };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const checks = runChecks();
  const v = verdict(checks);

  if (json) {
    console.log(JSON.stringify({ ...v, checks }, null, 2));
    process.exit(v.ready ? 0 : 1);
  }

  const icon = { GREEN: '✓', AMBER: '~', RED: '✗' };
  console.log('— WAIMD PRODUCTION-READINESS GATE (pre-$70) —\n');
  for (const c of checks) {
    const tag = c.blocking ? '' : ' (non-blocking)';
    console.log(`  ${icon[c.state]} ${c.label}${tag}`);
    console.log(`      ${c.detail}`);
  }
  console.log(`\n  ${v.green}/${v.total} blocking checks green · ${v.amber} amber · ${v.red} red`);
  if (v.ready) {
    console.log('\n  VERDICT: READY — every blocking check passed.');
    console.log('  The $70 Meta authorization is now a founder decision, not a technical one.');
  } else {
    console.log('\n  VERDICT: NOT READY — do NOT authorize the $70 spend.');
    console.log('  Amber and red are both blocking here: unproven is not the same as proven.');
  }
  process.exit(v.ready ? 0 : 1);
}
