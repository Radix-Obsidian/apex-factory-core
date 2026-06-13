// recycled.test.mjs — deterministic guardrail tests (the per-slice gate, $0 LLM).
// Run via `make recycled-verify` (node --test). R1/R4/R7 are the guardrails to trust absolutely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { licenseGate, isSourcePath, rollupVerdict, frozenArchiveNote, classifyRepoAge,
  buildManifest, dedupeBuildSpecs, verifyExtractPaths, evaluateGreenlight,
  projectCandidates, mergeCandidates, eligibleTopCandidate, markConsumed } from './recycled-scan.mjs';

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
  bars: { not_frankenstein: 'PASS', not_horizontal_sprawl: 'PASS', real_demand: 'PASS', is_zero_to_one: 'PASS', salvage_cheaper_than_rebuild: 'PASS' },
});
test('R4 rollupVerdict — 3 unanimous SURVIVE on all bars → SURVIVE', () => {
  assert.equal(rollupVerdict([survive(1), survive(2), survive(3)]).verdict, 'SURVIVE');
});
test('R4 rollupVerdict — 2 SURVIVE + 1 KILL → KILL', () => {
  const kill = { candidate_id: 'opp-1', skeptic: 3, verdict: 'KILL', confidence: 0.8, kill_reason: 'rebuild cheaper', bars: { not_frankenstein: 'PASS', not_horizontal_sprawl: 'PASS', real_demand: 'PASS', is_zero_to_one: 'PASS', salvage_cheaper_than_rebuild: 'FAIL' } };
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

// ── R3: source manifest — non-truncated direct, truncated → per-subtree fallback, never silently partial ──
test('R3 buildManifest — non-truncated returns filtered source, no fallback', () => {
  const rec = () => ({ truncated: false, entries: [
    { type: 'blob', path: 'src/a.ts' }, { type: 'blob', path: 'node_modules/x/i.js' }, { type: 'blob', path: 'README.md' },
  ]});
  const m = buildManifest('root', rec, () => { throw new Error('shallow must not be called when not truncated'); });
  assert.deepEqual(m.paths, ['src/a.ts']);
  assert.equal(m.fallback_used, false);
});
test('R3 buildManifest — truncated descends per subtree, prunes node_modules, never silently partial', () => {
  const rec = () => ({ truncated: true, entries: [] });
  const trees = {
    root: [{ type: 'tree', path: 'src', sha: 's1' }, { type: 'tree', path: 'node_modules', sha: 'nm' }, { type: 'blob', path: 'README.md' }],
    s1: [{ type: 'blob', path: 'a.ts' }, { type: 'tree', path: 'lib', sha: 's2' }],
    s2: [{ type: 'blob', path: 'b.ts' }],
    nm: [{ type: 'blob', path: 'evil.js' }],
  };
  const shallow = sha => ({ truncated: false, entries: trees[sha] });
  const m = buildManifest('root', rec, shallow);
  assert.equal(m.fallback_used, true);
  assert.deepEqual(m.paths.sort(), ['src/a.ts', 'src/lib/b.ts']); // README not source; node_modules pruned
});

// ── R5: at most one BuildSpec per source_repo, best (lowest) rank kept ──
test('R5 dedupeBuildSpecs — ≤1 per source_repo, best rank wins', () => {
  const out = dedupeBuildSpecs([
    { spec_id: 'a', source_repo: 'me/x', rank: 2 },
    { spec_id: 'b', source_repo: 'me/x', rank: 1 },
    { spec_id: 'c', source_repo: 'me/y', rank: 1 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find(s => s.source_repo === 'me/x').spec_id, 'b');
});

// ── R6: extract-path verification flags hallucinated lifts ──
test('R6 verifyExtractPaths — unresolved path → extracts_verified false', () => {
  const exists = (_repo, p) => p !== 'src/ghost.ts';
  const bad = verifyExtractPaths([{ spec_id: 'a', source_repo: 'me/x', extract_list: [{ from: 'src/a.ts' }, { from: 'src/ghost.ts' }] }], exists);
  assert.equal(bad[0].extracts_verified, false);
  const ok = verifyExtractPaths([{ spec_id: 'b', source_repo: 'me/x', extract_list: [{ from: 'src/a.ts' }] }], exists);
  assert.equal(ok[0].extracts_verified, true);
});

// ── honest-greenlight gate: survived + hours>=3 + zero-to-one + paths verified (AI is a plus, NOT a gate) ──
test('evaluateGreenlight — passes when survived + hours>=3 + zero-to-one + paths verified', () => {
  const base = {
    candidates: [{ candidate_id: 'c1', ai_native_test: 'PASS', zero_to_one_rank: 'true-zero-to-one', scores: { hours_saved_vs_rebuild: 4 } }],
    judged: [{ candidate_id: 'c1', rollup: { verdict: 'SURVIVE' } }],
    buildspecs: [{ spec_id: 's1', candidate_id: 'c1', product: 'P', extracts_verified: true }],
  };
  assert.equal(evaluateGreenlight(base).count, 1);
  const lowHours = structuredClone(base); lowHours.candidates[0].scores.hours_saved_vs_rebuild = 2;
  assert.equal(evaluateGreenlight(lowHours).count, 0);
  const killed = structuredClone(base); killed.judged[0].rollup.verdict = 'KILL';
  assert.equal(evaluateGreenlight(killed).count, 0);
  const unverified = structuredClone(base); unverified.buildspecs[0].extracts_verified = false;
  assert.equal(evaluateGreenlight(unverified).count, 0);
});
test('evaluateGreenlight — a NON-AI candidate still greenlights (broadened bar: AI is a plus, not a gate)', () => {
  const nonAi = {
    candidates: [{ candidate_id: 'c1', ai_native_test: 'FAIL', zero_to_one_rank: 'true-zero-to-one', scores: { hours_saved_vs_rebuild: 5 } }],
    judged: [{ candidate_id: 'c1', rollup: { verdict: 'SURVIVE' } }],
    buildspecs: [{ spec_id: 's1', candidate_id: 'c1', product: 'NoLeakAi-type non-AI tool', extracts_verified: true }],
  };
  assert.equal(evaluateGreenlight(nonAi).count, 1);
});

// ── Phase B: factory consumption queue (projection → eligible pick → consume) ──
test('R9 projectCandidates — thin shape; OWN→license-confirmed, tier-2→needs confirm; consumed:false', () => {
  const out = projectCandidates([
    { spec_id: 's1', candidate_id: 'c1', product: 'P1', source_repo: 'me/own', wedge: 'w', rough_dev_effort: '8d' },
    { spec_id: 's2', product: 'P2', source_repo: 'ext/mit', source_tier: '2' },
  ], { runId: 'run-x' });
  assert.equal(out[0].rank, 1); assert.equal(out[1].rank, 2);
  assert.equal(out[0].spec_id, 's1'); assert.equal(out[0].wedge, 'w'); assert.equal(out[0].created_by_run, 'run-x');
  assert.equal(out[0].consumed, false);
  assert.equal(out[0].license_human_confirmed, true);   // OWN (Tier-1) → we own it
  assert.equal(out[1].license_human_confirmed, false);  // Tier-2 external → human must confirm
});
test('R10 eligibleTopCandidate — lowest rank among unconsumed + license-confirmed; null when dry', () => {
  const q = [
    { spec_id: 's1', rank: 2, consumed: false, license_human_confirmed: true },
    { spec_id: 's2', rank: 1, consumed: true, license_human_confirmed: true },   // best rank but already spent
    { spec_id: 's3', rank: 1, consumed: false, license_human_confirmed: false }, // best rank but unconfirmed
  ];
  assert.equal(eligibleTopCandidate(q).spec_id, 's1');
  assert.equal(eligibleTopCandidate([]), null);
  assert.equal(eligibleTopCandidate(q.map(c => ({ ...c, consumed: true }))), null);
});
test('R11 mergeCandidates — dedupe by spec_id; re-projection never un-consumes; inputs not mutated', () => {
  const existing = [{ spec_id: 's1', rank: 1, product: 'old', consumed: true, license_human_confirmed: true }];
  const incoming = projectCandidates([{ spec_id: 's1', product: 'refreshed', source_repo: 'me/own' }, { spec_id: 's2', product: 'new', source_repo: 'me/own' }], { runId: 'r2' });
  const merged = mergeCandidates(existing, incoming);
  assert.equal(merged.length, 2);                       // s1 deduped, s2 added
  const s1 = merged.find(c => c.spec_id === 's1');
  assert.equal(s1.product, 'refreshed');                // fields refreshed
  assert.equal(s1.consumed, true);                      // but stays consumed — never resurrected
  assert.equal(existing[0].product, 'old');             // input array untouched (immutability)
});
test('R12 markConsumed — sets consumed on the target only, returns a new array', () => {
  const q = [{ spec_id: 's1', consumed: false }, { spec_id: 's2', consumed: false }];
  const out = markConsumed(q, 's1');
  assert.equal(out.find(c => c.spec_id === 's1').consumed, true);
  assert.equal(out.find(c => c.spec_id === 's2').consumed, false);
  assert.equal(q[0].consumed, false);                   // original untouched
});
test('R13 mergeCandidates — a human license confirmation is STICKY across re-projection (never reverted)', () => {
  // Operator cleared a Tier-2 gate; a later projection of the same (still Tier-2) spec must NOT revert it.
  const existing = [{ spec_id: 's1', rank: 1, source_repo: 'ext/mit', consumed: false, license_human_confirmed: true }];
  const reproject = projectCandidates([{ spec_id: 's1', source_repo: 'ext/mit', source_tier: '2', product: 'P' }], { runId: 'r3' });
  assert.equal(reproject[0].license_human_confirmed, false);  // projection always emits false for Tier-2
  const merged = mergeCandidates(existing, reproject);
  assert.equal(merged.find(c => c.spec_id === 's1').license_human_confirmed, true); // …but the merge keeps it confirmed
});
test('R14 mergeCandidates — duplicate spec_id within the incoming batch collapses to the lowest rank', () => {
  const merged = mergeCandidates([], [
    { spec_id: 's1', rank: 5, product: 'hi-rank' },
    { spec_id: 's1', rank: 2, product: 'lo-rank' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].rank, 2);                      // lowest (best) rank wins, no last-wins inversion
});
test('R15 eligibleTopCandidate — a NaN/missing rank does not corrupt the sort', () => {
  const q = [
    { spec_id: 's1', rank: NaN, consumed: false, license_human_confirmed: true },
    { spec_id: 's2', rank: 3, consumed: false, license_human_confirmed: true },
  ];
  assert.equal(eligibleTopCandidate(q).spec_id, 's2');  // finite rank beats NaN (treated as +inf)
});
