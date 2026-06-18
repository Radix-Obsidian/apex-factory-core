// recycled.test.mjs — deterministic guardrail tests (the per-slice gate, $0 LLM).
// Run via `make recycled-verify` (node --test). R1/R4/R7 are the guardrails to trust absolutely.
import test from 'node:test';
import assert from 'node:assert/strict';
import { licenseGate, isSourcePath, rollupVerdict, frozenArchiveNote, classifyRepoAge,
  buildManifest, dedupeBuildSpecs, verifyExtractPaths, evaluateGreenlight,
  projectCandidates, mergeCandidates, eligibleTopCandidate, markConsumed,
  groundTruthAdmissible, rollupVerdictGrounded, GROUND_TRUTH_MAX_AGE_DAYS,
  scoreSevenQuestions, scoreFirstPrinciples,
  makeOutcome, latestByCandidate, summarizeOutcomes,
  killRate, failureReasonDistribution, greenlightYield, durabilityPassRate,
  aggregateRuns, buildMetricsReport } from './recycled-scan.mjs';

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

// ── R16: ground-truth gate — the kill-skeptic must judge market bars against LIVE landscape, fail-closed ──
const NOW = Date.parse('2026-06-16T00:00:00Z');
const freshPacket = (over = {}) => ({
  searched_landscape: true,
  competitors: [{ name: 'LiteLLM', what_they_ship: 'mid-stream prefill failover', overlap: 'direct' }],
  sources: ['https://github.com/BerriAI/litellm/blob/main/litellm/router.py'],
  checked_at: '2026-06-15T00:00:00Z',
  ...over,
});
test('R16 groundTruthAdmissible — fresh, sourced, competitor-bearing packet is admissible', () => {
  assert.equal(groundTruthAdmissible(freshPacket(), { now: NOW }).ok, true);
});
test('R16 groundTruthAdmissible — missing/empty packet is INADMISSIBLE (competitively blind)', () => {
  assert.equal(groundTruthAdmissible(null, { now: NOW }).ok, false);
  assert.equal(groundTruthAdmissible(undefined, { now: NOW }).ok, false);
  assert.equal(groundTruthAdmissible({}, { now: NOW }).ok, false);
});
test('R16 groundTruthAdmissible — competitors but NO sources → inadmissible (uncited is a guess)', () => {
  assert.equal(groundTruthAdmissible(freshPacket({ sources: [] }), { now: NOW }).ok, false);
});
test('R16 groundTruthAdmissible — empty competitors WITHOUT attested search → inadmissible', () => {
  assert.equal(groundTruthAdmissible(freshPacket({ competitors: [], searched_landscape: false }), { now: NOW }).ok, false);
});
test('R16 groundTruthAdmissible — empty competitors WITH attested search + sources → admissible (honest empty field)', () => {
  assert.equal(groundTruthAdmissible(freshPacket({ competitors: [], searched_landscape: true }), { now: NOW }).ok, true);
});
test('R16 groundTruthAdmissible — missing/invalid checked_at → inadmissible', () => {
  assert.equal(groundTruthAdmissible(freshPacket({ checked_at: undefined }), { now: NOW }).ok, false);
  assert.equal(groundTruthAdmissible(freshPacket({ checked_at: 'whenever' }), { now: NOW }).ok, false);
});
test('R16 groundTruthAdmissible — stale beyond the max age → inadmissible', () => {
  const stale = freshPacket({ checked_at: '2026-04-01T00:00:00Z' }); // ~76d before NOW
  assert.equal(groundTruthAdmissible(stale, { now: NOW }).ok, false);
  assert.ok((NOW - Date.parse(stale.checked_at)) / 86_400_000 > GROUND_TRUTH_MAX_AGE_DAYS);
});
test('R16 groundTruthAdmissible — future checked_at → inadmissible (clock skew / forgery)', () => {
  assert.equal(groundTruthAdmissible(freshPacket({ checked_at: '2026-07-01T00:00:00Z' }), { now: NOW }).ok, false);
});

// ── R17: grounded kill-pass — inadmissible ground-truth short-circuits to KILL before skeptics are weighed ──
test('R17 rollupVerdictGrounded — admissible ground-truth + 3 unanimous SURVIVE → SURVIVE', () => {
  const r = rollupVerdictGrounded([survive(1), survive(2), survive(3)], freshPacket(), { now: NOW });
  assert.equal(r.verdict, 'SURVIVE');
  assert.equal(r.ground_truth_ok, true);
});
test('R17 rollupVerdictGrounded — INADMISSIBLE ground-truth + 3 unanimous SURVIVE → KILL (the blindness cure)', () => {
  // This is the exact 2026-06-16 false-positive: skeptics all say SURVIVE, but with no market awareness it must KILL.
  const r = rollupVerdictGrounded([survive(1), survive(2), survive(3)], null, { now: NOW });
  assert.equal(r.verdict, 'KILL');
  assert.equal(r.ground_truth_ok, false);
  assert.match(r.reason, /ground-truth gate/);
});
test('R17 rollupVerdictGrounded — admissible ground-truth still respects default-to-kill (a KILL skeptic → KILL)', () => {
  const kill = { skeptic: 3, verdict: 'KILL', confidence: 0.8, kill_reason: 'crowded me-too', bars: { not_frankenstein: 'PASS', not_horizontal_sprawl: 'PASS', real_demand: 'PASS', is_zero_to_one: 'FAIL', salvage_cheaper_than_rebuild: 'PASS' } };
  const r = rollupVerdictGrounded([survive(1), survive(2), kill], freshPacket(), { now: NOW });
  assert.equal(r.verdict, 'KILL');
  assert.equal(r.ground_truth_ok, true); // gate passed; the skeptic killed it
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

// ── honest-greenlight gate: survived + hours>=3 + zero-to-one + paths verified + durability + first-principles ──
const durOK = [{ candidate_id: 'c1', durability_pass: true, first_principles_pass: true }];
test('evaluateGreenlight — passes when survived + hours>=3 + zero-to-one + paths verified + durability/first-principles', () => {
  const base = {
    candidates: [{ candidate_id: 'c1', ai_native_test: 'PASS', zero_to_one_rank: 'true-zero-to-one', scores: { hours_saved_vs_rebuild: 4 } }],
    judged: [{ candidate_id: 'c1', rollup: { verdict: 'SURVIVE' } }],
    buildspecs: [{ spec_id: 's1', candidate_id: 'c1', product: 'P', extracts_verified: true }],
    durability: durOK,
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
    durability: durOK,
  };
  assert.equal(evaluateGreenlight(nonAi).count, 1);
});

// ── R18: Thiel 7-questions durability score (>=6 of 7), missing answers default-to-fail ──
const sevenAll = (over = {}) => ({
  engineering: { pass: true }, timing: { pass: true }, monopoly: { pass: true }, people: { pass: true },
  distribution: { pass: true }, durability: { pass: true }, secret: { pass: true }, ...over,
});
test('R18 scoreSevenQuestions — 7/7 and 6/7 pass; 5/7 fails; missing answers default-to-fail', () => {
  assert.equal(scoreSevenQuestions(sevenAll()).durability_pass, true);            // 7/7
  assert.equal(scoreSevenQuestions(sevenAll({ secret: { pass: false } })).durability_pass, true);  // 6/7
  const five = scoreSevenQuestions(sevenAll({ secret: { pass: false }, engineering: { pass: false } }));
  assert.equal(five.passed, 5);
  assert.equal(five.durability_pass, false);                                       // 5/7
  const missing = scoreSevenQuestions({ engineering: { pass: true } });            // 6 missing → fail
  assert.equal(missing.passed, 1);
  assert.equal(missing.durability_pass, false);
  assert.equal(scoreSevenQuestions(null).durability_pass, false);                  // null → fail-closed
});

// ── R19: Elon first-principles gate — core (reasoned_from_fundamentals) non-negotiable, then >=2 of 3 ──
test('R19 scoreFirstPrinciples — core required; analogy-only fails even at 2/3; null fail-closed', () => {
  const all = { reasoned_from_fundamentals: { pass: true }, requirements_questioned: { pass: true }, irreducible: { pass: true } };
  assert.equal(scoreFirstPrinciples(all).first_principles_pass, true);             // 3/3
  assert.equal(scoreFirstPrinciples({ ...all, irreducible: { pass: false } }).first_principles_pass, true); // core + 2/3
  // 2 of 3 but the CORE (reasoned_from_fundamentals) failed → must FAIL (analogy/me-too)
  const analogy = { reasoned_from_fundamentals: { pass: false }, requirements_questioned: { pass: true }, irreducible: { pass: true } };
  assert.equal(scoreFirstPrinciples(analogy).passed, 2);
  assert.equal(scoreFirstPrinciples(analogy).first_principles_pass, false);
  // core only (1/3) → fails the >=2 quality bar
  assert.equal(scoreFirstPrinciples({ reasoned_from_fundamentals: { pass: true } }).first_principles_pass, false);
  assert.equal(scoreFirstPrinciples(null).first_principles_pass, false);           // null → fail-closed
});

// ── R20: evaluateGreenlight requires BOTH durability_pass AND first_principles_pass ──
test('R20 evaluateGreenlight — a kill-pass-clean, paths-verified spec is REJECTED without durability + first-principles', () => {
  const base = {
    candidates: [{ candidate_id: 'c1', ai_native_test: 'PASS', zero_to_one_rank: 'true-zero-to-one', scores: { hours_saved_vs_rebuild: 4 } }],
    judged: [{ candidate_id: 'c1', rollup: { verdict: 'SURVIVE' } }],
    buildspecs: [{ spec_id: 's1', candidate_id: 'c1', product: 'P', extracts_verified: true }],
  };
  assert.equal(evaluateGreenlight(base).count, 0);                                                    // no durability data → rejected
  assert.equal(evaluateGreenlight({ ...base, durability: [{ candidate_id: 'c1', durability_pass: false, first_principles_pass: true }] }).count, 0); // <6/7
  assert.equal(evaluateGreenlight({ ...base, durability: [{ candidate_id: 'c1', durability_pass: true, first_principles_pass: false }] }).count, 0); // analogy/me-too
  assert.equal(evaluateGreenlight({ ...base, durability: [{ candidate_id: 'c1', durability_pass: true, first_principles_pass: true }] }).count, 1);  // both → greenlit
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

// ── R21: outcome-capture (D15) — validates + normalizes at the boundary, fails fast on garbage ──
test('R21 makeOutcome — builds a validated event; coerces revenue; rejects bad label/revenue/empty id/bad ts', () => {
  const ts = '2026-06-17T00:00:00.000Z';
  assert.deepEqual(
    makeOutcome('cand-1', 'made_money', { revenue: '500', checked_at: ts }),
    { candidate_id: 'cand-1', outcome_label: 'made_money', revenue: 500, checked_at: ts });
  assert.equal(makeOutcome('c', 'failed', { checked_at: ts }).revenue, null);   // no revenue → null
  assert.equal(makeOutcome('  c  ', 'unknown', { checked_at: ts }).candidate_id, 'c'); // trimmed
  assert.throws(() => makeOutcome('', 'made_money', { checked_at: ts }), /candidate_id is required/);
  assert.throws(() => makeOutcome('c', 'rich', { checked_at: ts }), /label must be one of/);
  assert.throws(() => makeOutcome('c', 'made_money', { revenue: -5, checked_at: ts }), /revenue must be/);
  assert.throws(() => makeOutcome('c', 'made_money', { revenue: 'lots', checked_at: ts }), /revenue must be/);
  assert.throws(() => makeOutcome('c', 'made_money', { revenue: true, checked_at: ts }), /revenue must be/);  // boolean must not coerce to 1
  assert.throws(() => makeOutcome('c', 'made_money', { revenue: [5], checked_at: ts }), /revenue must be/);   // array must not coerce
  assert.throws(() => makeOutcome('c', 'made_money', { checked_at: 'not-a-date' }), /checked_at must be/);
});

// ── R22: append-only log → current state; latest checked_at wins per candidate; honest counts; immutable ──
test('R22 latestByCandidate + summarizeOutcomes — latest observation supersedes; counts; inputs not mutated', () => {
  const log = [
    { candidate_id: 'a', outcome_label: 'unknown', revenue: null, checked_at: '2026-01-01T00:00:00.000Z' },
    { candidate_id: 'a', outcome_label: 'made_money', revenue: 500, checked_at: '2026-06-01T00:00:00.000Z' },
    { candidate_id: 'b', outcome_label: 'failed', revenue: null, checked_at: '2026-03-01T00:00:00.000Z' },
  ];
  const snapshot = JSON.stringify(log);
  const latest = latestByCandidate(log);
  assert.equal(latest.length, 2);
  const a = latest.find(r => r.candidate_id === 'a');
  assert.equal(a.outcome_label, 'made_money');   // the June observation supersedes January
  assert.equal(a.revenue, 500);
  const s = summarizeOutcomes(log);
  assert.deepEqual(s.by_label, { made_money: 1, failed: 1, unknown: 0 }); // counts CURRENT state, not raw log
  assert.equal(s.revenue_total, 500);
  assert.equal(s.candidates, 2);
  assert.equal(s.observations, 3);
  assert.equal(JSON.stringify(log), snapshot);    // inputs not mutated
  // corrupt rows (missing/junk checked_at, non-string candidate_id) are skipped, never crash the reducer
  const dirty = [...log, { candidate_id: 'c', outcome_label: 'failed', checked_at: undefined }, { candidate_id: 42 }, null];
  const fromDirty = latestByCandidate(dirty);
  assert.equal(fromDirty.length, 2);              // still just a + b; the 3 corrupt rows dropped
  assert.ok(fromDirty.every(r => typeof r.checked_at === 'string')); // no undefined-timestamp row leaks through
});

// ── R23: cross-run kill-rate (D16) — rollup rows only; null rate on no decisions (no 0/0=NaN) ──
test('R23 killRate — counts rollup decisions only; KILL/SURVIVE/rate; null rate when empty', () => {
  const rows = [
    { candidate_id: 'a', skeptic: 1, verdict: 'KILL', bars: { x: 'FAIL' } },   // skeptic row — NOT a decision
    { candidate_id: 'a', skeptic: 'rollup', verdict: 'KILL' },
    { candidate_id: 'b', skeptic: 'rollup', verdict: 'SURVIVE' },
    { candidate_id: 'c', skeptic: 'rollup', verdict: 'KILL' },
  ];
  assert.deepEqual(killRate(rows), { rollups: 3, killed: 2, survived: 1, rate: 2 / 3 });
  assert.equal(killRate([]).rate, null);  // no decisions → null, never NaN
  assert.equal(killRate(null).rollups, 0);
});

// ── R24: failure-reason distribution (D16) — THE SCHEMA-DRIFT GUARD: bar keys read dynamically across runs ──
test('R24 failureReasonDistribution — dynamic bar keys (old+new schema); gate kills bucketed; skeptic-kill ≠ gate kill', () => {
  const rows = [
    { skeptic: 1, bars: { not_frankenstein: 'PASS', ai_native_not_feature: 'FAIL', is_zero_to_one: 'FAIL' } }, // OLD schema
    { skeptic: 2, bars: { not_frankenstein: 'PASS', real_demand: 'FAIL', is_zero_to_one: 'FAIL' } },           // NEW schema
    { candidate_id: 'x', skeptic: 'rollup', verdict: 'KILL', ground_truth_ok: true, kill_reason: 'commodity' }, // normal skeptic-driven kill
    { candidate_id: 'y', skeptic: 'rollup', verdict: 'KILL', ground_truth_ok: false, kill_reason: 'ground-truth gate: no packet' },
    { candidate_id: 'z', skeptic: 'rollup', verdict: 'KILL', kill_reason: 'abstain: only 1 skeptic' },
  ];
  const d = failureReasonDistribution(rows);
  assert.equal(d.by_bar.is_zero_to_one, 2);            // counted across BOTH schemas
  assert.equal(d.by_bar.ai_native_not_feature, 1);     // old key NOT hardcoded away
  assert.equal(d.by_bar.real_demand, 1);               // new key counted
  assert.equal(d.by_bar.not_frankenstein, undefined);  // PASS never counted
  assert.deepEqual(d.by_gate, { ground_truth_gate: 1, abstain: 1 }); // skeptic-driven rollup KILL is NOT a gate kill
});

// ── R25: greenlight-yield (D16) — null yield on 0 candidates (no divide-by-zero, no fake denominator) ──
test('R25 greenlightYield — fraction when candidates>0; yield:null on 0 candidates', () => {
  assert.deepEqual(greenlightYield(1, 4), { greenlights: 1, candidates: 4, yield: 0.25 });
  assert.deepEqual(greenlightYield(0, 10), { greenlights: 0, candidates: 10, yield: 0 });
  assert.equal(greenlightYield(0, 0).yield, null);                 // 0/0 → null, never NaN
  assert.equal(greenlightYield(undefined, undefined).yield, null);
});

// ── R26: durability-gate pass rate (D16) — n:0 cleanly on empty (no rate over nothing) ──
test('R26 durabilityPassRate — counts passes; n:0 on empty', () => {
  const rows = [
    { candidate_id: 'a', durability_pass: true, first_principles_pass: false },
    { candidate_id: 'b', durability_pass: true, first_principles_pass: true },
  ];
  assert.deepEqual(durabilityPassRate(rows), { n: 2, durability_pass: 2, first_principles_pass: 1 });
  assert.deepEqual(durabilityPassRate([]), { n: 0, durability_pass: 0, first_principles_pass: 0 });
});

// ── R27: aggregateRuns + buildMetricsReport (D16) — injected reader; honest nulls/notes, never faked ──
test('R27 aggregateRuns + buildMetricsReport — injectable reader; assembles KPIs with honest gaps', () => {
  const empty = aggregateRuns('/nonexistent/runs/root', { readJsonl: () => [] });
  assert.equal(empty.runs, 0);                          // missing root → 0 runs, not a crash
  const report = buildMetricsReport({
    runs: 2, candidates: 10, greenlights: 0, durability: [], outcomes: [],
    verdicts: [{ skeptic: 'rollup', verdict: 'KILL' }, { skeptic: 'rollup', verdict: 'KILL' }],
  });
  assert.equal(report.computable.kill_rate.rate, 1);
  assert.equal(report.computable.greenlight_yield.yield, 0);
  assert.equal(report.computable.ideas_killed_per_greenlight, null); // 0 greenlights → undefined, not div-by-zero
  assert.ok(report.computable.durability_gate.note);                 // empty durability → honest note, not a fake rate
  assert.ok(report.not_yet_measurable.cycle_time);                   // honest gap surfaced
});
