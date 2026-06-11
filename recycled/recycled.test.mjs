// recycled.test.mjs — deterministic guardrail tests (the per-slice gate, $0 LLM).
// Run via `make recycled-verify` (node --test). R1/R4/R7 are the guardrails to trust absolutely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { licenseGate, isSourcePath, rollupVerdict, frozenArchiveNote, classifyRepoAge } from './recycled-scan.mjs';

// ── R1: license gate, fail-closed ──
test('R1 licenseGate — permissive licenses are LIFT-OK (tier 2)', () => {
  for (const id of ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', '0BSD'])
    assert.equal(licenseGate(id, 2), 'LIFT-OK', `${id} should LIFT-OK`);
});
test('R1 licenseGate — copyleft viral licenses are REJECT (tier 2)', () => {
  for (const id of ['GPL-3.0', 'GPL-2.0', 'AGPL-3.0', 'SSPL-1.0', 'BUSL-1.1'])
    assert.equal(licenseGate(id, 2), 'REJECT', `${id} should REJECT`);
});
test('R1 licenseGate — weak copyleft is IDEA-ONLY (no lift, reimplement)', () => {
  for (const id of ['MPL-2.0', 'LGPL-3.0', 'LGPL-2.1'])
    assert.equal(licenseGate(id, 2), 'IDEA-ONLY', `${id} should IDEA-ONLY`);
});
test('R1 licenseGate — absent/unknown license REJECTs tier-2, fail-closed', () => {
  assert.equal(licenseGate(null, 2), 'REJECT');
  assert.equal(licenseGate('', 2), 'REJECT');
  assert.equal(licenseGate('NOASSERTION', 2), 'REJECT');
  assert.equal(licenseGate('WTFPL', 2), 'REJECT'); // unrecognized → reject
});
test('R1 licenseGate — tier-1 (own) always bypasses to OWN, even null or GPL', () => {
  assert.equal(licenseGate(null, 1), 'OWN');
  assert.equal(licenseGate('GPL-3.0', 1), 'OWN');
  assert.equal(licenseGate('MIT', 1), 'OWN');
});

// ── R2: source-path filter excludes build artifacts and deps ──
test('R2 isSourcePath — real source passes', () => {
  for (const p of ['src/lib/solver.ts', 'src/app/page.tsx', 'lib/parse.py', 'cmd/main.go', 'core/x.rs'])
    assert.equal(isSourcePath(p), true, `${p} should pass`);
});
test('R2 isSourcePath — node_modules / build artifacts / non-source are excluded', () => {
  for (const p of ['node_modules/foo/index.js', 'dist/bundle.js', '.next/server/page.js',
                   'packages/core/build/out.js', 'vendor/x.go', 'coverage/lcov.js', 'README.md', 'data/blob.bin'])
    assert.equal(isSourcePath(p), false, `${p} should be excluded`);
});

// ── R4: kill-pass rollup — default-to-kill ──
const survive = (skeptic, confidence = 0.9) => ({
  candidate_id: 'opp-1', skeptic, confidence, verdict: 'SURVIVE',
  bars: { not_frankenstein: 'PASS', not_horizontal_sprawl: 'PASS', ai_native_not_feature: 'PASS', is_zero_to_one: 'PASS', salvage_cheaper_than_rebuild: 'PASS' },
});
test('R4 rollupVerdict — 3 unanimous SURVIVE on all bars → SURVIVE', () => {
  assert.equal(rollupVerdict([survive(1), survive(2), survive(3)]).verdict, 'SURVIVE');
});
test('R4 rollupVerdict — 2 SURVIVE + 1 KILL → KILL', () => {
  const kill = { candidate_id: 'opp-1', skeptic: 3, verdict: 'KILL', confidence: 0.8, kill_reason: 'rebuild cheaper', bars: { not_frankenstein: 'PASS', not_horizontal_sprawl: 'PASS', ai_native_not_feature: 'PASS', is_zero_to_one: 'PASS', salvage_cheaper_than_rebuild: 'FAIL' } };
  assert.equal(rollupVerdict([survive(1), survive(2), kill]).verdict, 'KILL');
});
test('R4 rollupVerdict — one failed bar despite SURVIVE label → KILL', () => {
  const bad = survive(3); bad.bars.is_zero_to_one = 'FAIL';
  assert.equal(rollupVerdict([survive(1), survive(2), bad]).verdict, 'KILL');
});
test('R4 rollupVerdict — abstain (only 2 of 3 skeptics returned) → KILL', () => {
  assert.equal(rollupVerdict([survive(1), survive(2)]).verdict, 'KILL');
  assert.equal(rollupVerdict([]).verdict, 'KILL');
});
test('R4 rollupVerdict — low-confidence SURVIVE → KILL', () => {
  assert.equal(rollupVerdict([survive(1), survive(2), survive(3, 0.5)]).verdict, 'KILL');
});

// ── R7: frozen-archive note is always label-only and reversible (never delete) ──
test('R7 frozenArchiveNote — label-only, reversible, TRULY-DEAD', () => {
  const n = frozenArchiveNote('me/old-repo', 'no salvageable capability', { runId: 'r1' });
  assert.equal(n.archive_action, 'label-only');
  assert.equal(n.reversible, true);
  assert.equal(n.verdict, 'TRULY-DEAD');
});

// ── repo-age classifier (Stage 0 bucket) ──
test('classifyRepoAge — LIVE / DORMANT / DEAD by months', () => {
  const now = Date.parse('2026-06-11T00:00:00Z');
  assert.equal(classifyRepoAge('2026-05-01T00:00:00Z', now), 'LIVE');     // ~1.3mo
  assert.equal(classifyRepoAge('2026-01-01T00:00:00Z', now), 'DORMANT');  // ~5mo
  assert.equal(classifyRepoAge('2025-01-01T00:00:00Z', now), 'DEAD');     // ~17mo
  assert.equal(classifyRepoAge('not-a-date', now), 'UNKNOWN');
});
