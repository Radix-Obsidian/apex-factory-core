// tests/waimd-housing/engine.test.ts — conformance suite for the WAIMD decision engine.
//
// $0 LLM, no network, no clock: every test is a pure function call against the real engine the
// product will ship. Run via `node --test tests/waimd-housing/engine.test.ts` (or `make
// waimd-engine-test`). Follows the ops/ops.test.mjs convention: node:test, zero dependencies.
//
// These tests exist to make the PRD's hard rules FALSIFIABLE:
//   §10 five gates · §11 fail-closed evidence · §13 deterministic score · §14 max 3 · §15 $0 under 3

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Candidate,
  type HousingMission,
  type Requirements,
  DECISION_PRICE_USD,
  EVIDENCE_RANK,
  MAX_CHOICES,
  MIN_GATE_EVIDENCE,
  WEIGHTS,
  decide,
  effectiveEvidence,
  gateCommute,
  gateDates,
  gateEconomics,
  gateEvidence,
  gateRequirements,
  mayAssertAvailabilityConfirmed,
  monthlyCost,
  preview,
  runGates,
  scoreCandidate,
} from '../../skus/waimd-housing/engine/index.ts';

const ASOF = '2026-08-01';

const reqs = (o: Partial<Requirements> = {}): Requirements => ({
  parking: false, laundry: false, furnished: false, pets: false, private_bath: false, ...o,
});

// The PRD's own worked example (§6): Phoenix, Aug 17 → Nov 16, ≤$1,800, ≤20 min, entire furnished.
const mission = (o: Partial<HousingMission> = {}): HousingMission => ({
  id: 'WAIMD-0001',
  facility: 'Banner University Medical Center',
  city: 'Phoenix',
  state: 'AZ',
  start_date: '2026-08-17',
  end_date: '2026-11-16',
  budget_max: 1800,
  housing_type: 'entire_place',
  commute_max_minutes: 20,
  requirements: reqs({ parking: true, laundry: true, furnished: true }),
  ...o,
});

const candidate = (o: Partial<Candidate> = {}): Candidate => ({
  id: 'c1',
  mission_id: 'WAIMD-0001',
  source_name: 'furnished-finder',
  source_url: 'https://example.test/listing/1',
  monthly_price: 1640,
  availability_start: '2026-08-01',
  availability_end: '2026-12-01',
  commute_minutes: 11,
  housing_type: 'entire_place',
  requirements: reqs({ parking: true, laundry: true, furnished: true }),
  evidence_status: 'CHECKED',
  evidence_checked_at: ASOF,
  ...o,
});

// ── §11 the evidence ladder: fail-closed, decays downward only ──
describe('evidence ladder (§11)', () => {
  test('fresh states are preserved', () => {
    assert.equal(effectiveEvidence('CONFIRMED', ASOF, ASOF), 'CONFIRMED');
    assert.equal(effectiveEvidence('CHECKED', ASOF, ASOF), 'CHECKED');
    assert.equal(effectiveEvidence('LISTED', ASOF, ASOF), 'LISTED');
  });

  test('stale evidence decays DOWNWARD, never upward', () => {
    // CONFIRMED TTL is 7d, CHECKED 3d — 30 days old lands at the floor.
    assert.equal(effectiveEvidence('CONFIRMED', '2026-07-02', ASOF), 'LISTED');
    assert.equal(effectiveEvidence('CHECKED', '2026-07-25', ASOF), 'LISTED');
    // LISTED is the floor and cannot decay below itself.
    assert.equal(effectiveEvidence('LISTED', '2020-01-01', ASOF), 'LISTED');
  });

  test('a state never outranks the one it was given', () => {
    const states = ['LISTED', 'CHECKED', 'CONFIRMED'] as const;
    for (const s of states)
      for (const days of [0, 1, 3, 4, 7, 8, 60])
        for (const asOf of [ASOF]) {
          const checked = new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000)
            .toISOString().slice(0, 10);
          const eff = effectiveEvidence(s, checked, asOf);
          assert.ok(EVIDENCE_RANK[eff] <= EVIDENCE_RANK[s], `${s} @${days}d → ${eff} outranked its input`);
        }
  });

  test('malformed, missing, or FUTURE timestamps fail closed to LISTED', () => {
    assert.equal(effectiveEvidence('CONFIRMED', 'not-a-date', ASOF), 'LISTED');
    assert.equal(effectiveEvidence('CONFIRMED', '', ASOF), 'LISTED');
    // Nonsense input must never buy certainty.
    assert.equal(effectiveEvidence('CONFIRMED', '2026-09-01', ASOF), 'LISTED');
  });

  test('an unknown state fails closed to LISTED', () => {
    assert.equal(effectiveEvidence('TOTALLY_VERIFIED' as never, ASOF, ASOF), 'LISTED');
  });

  test('ONLY CONFIRMED may assert availability (§11)', () => {
    assert.equal(mayAssertAvailabilityConfirmed('CONFIRMED'), true);
    assert.equal(mayAssertAvailabilityConfirmed('CHECKED'), false);
    assert.equal(mayAssertAvailabilityConfirmed('LISTED'), false);
    // A CONFIRMED claim that has gone stale may no longer be asserted.
    assert.equal(mayAssertAvailabilityConfirmed(effectiveEvidence('CONFIRMED', '2026-06-01', ASOF)), false);
  });
});

// ── §10 the five gates ──
describe('hard gates (§10)', () => {
  test('gate 1 rejects a window that starts too late or ends too early', () => {
    assert.equal(gateDates(mission(), candidate({ availability_start: '2026-08-20' }))?.gate, 'dates');
    assert.equal(gateDates(mission(), candidate({ availability_end: '2026-10-01' }))?.gate, 'dates');
    assert.equal(gateDates(mission(), candidate()), null);
  });

  test('gate 2 rejects over budget, and uses total cost when supplied', () => {
    assert.equal(gateEconomics(mission(), candidate({ monthly_price: 2200 }))?.gate, 'economics');
    assert.equal(gateEconomics(mission(), candidate()), null);
    // 3-month assignment: $9,000 total ≈ $2,957/mo → over the $1,800 ceiling despite a low sticker.
    const c = candidate({ monthly_price: 900, estimated_total_cost: 9000 });
    assert.equal(gateEconomics(mission(), c)?.gate, 'economics');
    assert.ok(monthlyCost(mission(), c) > 1800);
  });

  test('gate 3 rejects a commute over tolerance (boundary is inclusive)', () => {
    assert.equal(gateCommute(mission(), candidate({ commute_minutes: 21 }))?.gate, 'commute');
    assert.equal(gateCommute(mission(), candidate({ commute_minutes: 20 })), null);
  });

  test('gate 4 rejects ONE missing must-have, and a housing-type mismatch', () => {
    const missing = candidate({ requirements: reqs({ parking: true, laundry: true }) }); // no furnished
    assert.match(gateRequirements(mission(), missing)?.reason ?? '', /furnished/);
    assert.equal(gateRequirements(mission(), candidate({ housing_type: 'private_room' }))?.gate, 'requirements');
    assert.equal(gateRequirements(mission(), candidate()), null);
  });

  test('gate 5 fails closed: a stale/unverified claim can never qualify', () => {
    assert.equal(gateEvidence(mission(), candidate({ evidence_status: 'LISTED' }), ASOF)?.gate, 'evidence');
    // CONFIRMED but 30 days old → decays to LISTED → rejected.
    assert.equal(
      gateEvidence(mission(), candidate({ evidence_status: 'CONFIRMED', evidence_checked_at: '2026-07-01' }), ASOF)?.gate,
      'evidence',
    );
    assert.equal(gateEvidence(mission(), candidate(), ASOF), null);
    assert.equal(MIN_GATE_EVIDENCE, 'CHECKED');
  });

  test('gate PRECEDENCE is fixed: the earliest failure is reported', () => {
    // Fails dates AND economics AND commute — must report `dates`.
    const bad = candidate({ availability_start: '2026-09-01', monthly_price: 5000, commute_minutes: 90 });
    assert.equal(runGates(mission(), bad, ASOF)?.gate, 'dates');
    // Fix dates → economics surfaces next.
    assert.equal(runGates(mission(), candidate({ monthly_price: 5000, commute_minutes: 90 }), ASOF)?.gate, 'economics');
    // Fix economics → commute.
    assert.equal(runGates(mission(), candidate({ commute_minutes: 90 }), ASOF)?.gate, 'commute');
  });
});

// ── §13 deterministic scoring ──
describe('deterministic score (§13)', () => {
  test('weights are exactly the PRD weights and sum to 100', () => {
    assert.deepEqual(WEIGHTS, {
      budget_fit: 30, commute_fit: 25, date_confidence: 20, evidence_freshness: 15, preference_fit: 10,
    });
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  });

  test('the same inputs always produce a byte-identical score', () => {
    const m = mission(), c = candidate();
    const first = JSON.stringify(scoreCandidate(m, c, ASOF));
    for (let i = 0; i < 50; i++) assert.equal(JSON.stringify(scoreCandidate(m, c, ASOF)), first);
  });

  test('total equals the sum of its parts and stays within 0..100', () => {
    const cases = [
      candidate(),
      candidate({ monthly_price: 1799, commute_minutes: 20 }),
      candidate({ monthly_price: 200, commute_minutes: 1, evidence_status: 'CONFIRMED' }),
      candidate({ evidence_status: 'LISTED' }),
    ];
    for (const c of cases) {
      const s = scoreCandidate(mission(), c, ASOF);
      const parts = s.budget_fit + s.commute_fit + s.date_confidence + s.evidence_freshness + s.preference_fit;
      assert.ok(Math.abs(s.total - parts) < 0.01, 'total must equal the sum of components');
      assert.ok(s.total >= 0 && s.total <= 100, `total ${s.total} out of range`);
    }
  });

  test('the score cannot be injected — it is a pure function of its inputs', () => {
    const c = candidate() as Candidate & { score?: number; total?: number; WAIMD_FIT?: number };
    c.score = 999; c.total = 999; c.WAIMD_FIT = 100;
    const honest = scoreCandidate(mission(), candidate(), ASOF);
    assert.deepEqual(scoreCandidate(mission(), c, ASOF), honest, 'injected fields must not influence scoring');
  });

  test('cheaper + closer + better-evidenced scores strictly higher', () => {
    const good = scoreCandidate(mission(), candidate({ monthly_price: 900, commute_minutes: 5, evidence_status: 'CONFIRMED' }), ASOF);
    const weak = scoreCandidate(mission(), candidate({ monthly_price: 1790, commute_minutes: 19, evidence_status: 'CHECKED' }), ASOF);
    assert.ok(good.total > weak.total, `${good.total} should beat ${weak.total}`);
  });

  test('evidence that decayed to LISTED scores zero freshness', () => {
    const s = scoreCandidate(mission(), candidate({ evidence_status: 'CONFIRMED', evidence_checked_at: '2026-06-01' }), ASOF);
    assert.equal(s.evidence_freshness, 0);
  });
});

// ── §14 / §15 the decision ──
describe('the Decision (§14, §15)', () => {
  const threeGood = [
    candidate({ id: 'a', monthly_price: 1600, commute_minutes: 10 }),
    candidate({ id: 'b', monthly_price: 1500, commute_minutes: 8, evidence_status: 'CONFIRMED' }),
    candidate({ id: 'c', monthly_price: 1700, commute_minutes: 15 }),
  ];

  test('never returns more than three choices, however many qualify (§14)', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      candidate({ id: `c${i}`, monthly_price: 1000 + i, commute_minutes: 5 }));
    const d = decide(mission(), many, ASOF);
    assert.equal(d.choices.length, MAX_CHOICES);
    assert.equal(d.solvable, true);
  });

  test('fewer than three qualifying options → NOT solvable, paid=false, $0 (§15)', () => {
    const d = decide(mission(), threeGood.slice(0, 2), ASOF);
    assert.equal(d.choices.length, 2);
    assert.equal(d.solvable, false);
    assert.equal(d.paid, false);
    assert.equal(d.price_usd, 0);
  });

  test('exactly three qualifying options → solvable, chargeable at $29', () => {
    const d = decide(mission(), threeGood, ASOF);
    assert.equal(d.solvable, true);
    assert.equal(d.paid, true);
    assert.equal(d.price_usd, DECISION_PRICE_USD);
  });

  test('paid is DERIVED and cannot be forged by the input', () => {
    const forged = threeGood.slice(0, 1).map(c => ({ ...c, paid: true, solvable: true, price_usd: 29 }));
    const d = decide(mission(), forged as Candidate[], ASOF);
    assert.equal(d.paid, false, 'a candidate claiming paid/solvable must not make the decision chargeable');
    assert.equal(d.price_usd, 0);
  });

  test('an all-disqualified pool yields no choices, no charge, and a reason for each', () => {
    const d = decide(mission(), [
      candidate({ id: 'x', monthly_price: 9999 }),
      candidate({ id: 'y', commute_minutes: 99 }),
      candidate({ id: 'z', evidence_status: 'LISTED' }),
    ], ASOF);
    assert.equal(d.choices.length, 0);
    assert.equal(d.paid, false);
    assert.equal(d.disqualified.length, 3);
    for (const dq of d.disqualified) assert.ok(dq.failure.reason.length > 0, 'every rejection needs a reason');
    assert.equal(preview(d), null, 'nothing qualified → nothing honest to preview');
  });

  test('ranking is a deterministic TOTAL order — repeated runs and shuffles agree', () => {
    const pool = [
      candidate({ id: 'a', monthly_price: 1600, commute_minutes: 10 }),
      candidate({ id: 'b', monthly_price: 1600, commute_minutes: 10 }), // exact tie with a
      candidate({ id: 'c', monthly_price: 1500, commute_minutes: 8 }),
      candidate({ id: 'd', monthly_price: 1700, commute_minutes: 12 }),
    ];
    const expected = decide(mission(), pool, ASOF).choices.map(c => c.candidate.id);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...pool].reverse();
      assert.deepEqual(decide(mission(), shuffled, ASOF).choices.map(c => c.candidate.id), expected,
        'input order must not change the ranking');
    }
  });

  test('the whole decision is byte-identical across repeated runs (§13 determinism)', () => {
    const first = JSON.stringify(decide(mission(), threeGood, ASOF));
    for (let i = 0; i < 25; i++) assert.equal(JSON.stringify(decide(mission(), threeGood, ASOF)), first);
  });

  test('the engine never reads the clock — asOf drives evidence, not "now"', () => {
    const c = [candidate({ id: 'a', evidence_status: 'CONFIRMED', evidence_checked_at: '2026-08-01' })];
    // Same inputs, a later asOf: the evidence has decayed and the candidate no longer qualifies.
    assert.equal(decide(mission(), c, '2026-08-01').choices.length, 1);
    assert.equal(decide(mission(), c, '2026-09-15').choices.length, 0);
  });

  test('the preview is Match #1 — the top-ranked choice (§15 free tier)', () => {
    const d = decide(mission(), threeGood, ASOF);
    assert.equal(preview(d)?.candidate.id, d.choices[0]?.candidate.id);
  });

  test('watch-outs surface honest uncertainty rather than hiding it (§12)', () => {
    // A merely-CHECKED candidate must be flagged as not-confirmed.
    const d = decide(mission(), [candidate({ evidence_status: 'CHECKED' })], ASOF);
    assert.ok(d.choices[0]!.watch_outs.some(w => /not confirmed/i.test(w)),
      'a non-CONFIRMED candidate must carry an availability watch-out');
  });

  test('a CONFIRMED-and-fresh candidate carries no availability watch-out', () => {
    const d = decide(mission(), [candidate({ evidence_status: 'CONFIRMED' })], ASOF);
    assert.equal(d.choices[0]!.watch_outs.some(w => /not confirmed/i.test(w)), false);
  });
});
