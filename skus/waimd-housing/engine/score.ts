// engine/score.ts — the deterministic 100-point score (PRD §13: "Do Not Build a Fake 'AI Score'").
//
// The whole point of this file: the score has deterministic foundations. Same inputs → same number,
// every time, in every timezone, on every machine. A model may EXPLAIN this result; a model may never
// PRODUCE it. There is no hook, no override, no injection point — scoring is a pure function of
// (mission, candidate, asOf), which is what makes debugging possible.

import {
  type Candidate,
  type HousingMission,
  type ScoreBreakdown,
  EVIDENCE_RANK,
  REQUIREMENT_KEYS,
} from './types.ts';
import { effectiveEvidence, daysBetween, EVIDENCE_TTL_DAYS } from './evidence.ts';
import { monthlyCost, round2 } from './gates.ts';

/** PRD §13 — the weights. Asserted to sum to 100 at module load; a bad edit fails loudly, now. */
export const WEIGHTS = Object.freeze({
  budget_fit: 30,
  commute_fit: 25,
  date_confidence: 20,
  evidence_freshness: 15,
  preference_fit: 10,
});

const WEIGHT_TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (WEIGHT_TOTAL !== 100) {
  throw new Error(`waimd score weights must sum to 100 (got ${WEIGHT_TOTAL}) — PRD §13`);
}

/** Clamp to [0,1]. */
function unit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Budget fit (30) — reward headroom under the ceiling. At the ceiling scores 0 of the headroom
 * bonus but still qualifies (gate 2 is `<=`); at half the ceiling or below it saturates.
 */
export function budgetFit(m: HousingMission, c: Candidate): number {
  const monthly = monthlyCost(m, c);
  if (!(m.budget_max > 0)) return 0;
  const headroom = (m.budget_max - monthly) / m.budget_max; // 0 at ceiling, 1 if free
  return round2(WEIGHTS.budget_fit * unit(headroom / 0.5));  // saturates at 50% under budget
}

/** Commute fit (25) — reward being well inside the tolerance; saturates at half the limit. */
export function commuteFit(m: HousingMission, c: Candidate): number {
  if (!(m.commute_max_minutes > 0)) return 0;
  const inside = (m.commute_max_minutes - c.commute_minutes) / m.commute_max_minutes;
  return round2(WEIGHTS.commute_fit * unit(inside / 0.5));
}

/**
 * Date confidence (20) — how much slack the availability window leaves around the assignment.
 * A window that exactly covers the dates is tighter (and riskier) than one with margin either side.
 * Saturates at 14 days of combined slack.
 */
export function dateConfidence(m: HousingMission, c: Candidate): number {
  const before = daysBetween(c.availability_start, m.start_date); // >=0 when it opens early enough
  const after = daysBetween(m.end_date, c.availability_end);      // >=0 when it runs late enough
  if (Number.isNaN(before) || Number.isNaN(after)) return 0;
  const slack = Math.max(0, before) + Math.max(0, after);
  return round2(WEIGHTS.date_confidence * unit(slack / 14));
}

/**
 * Evidence freshness (15) — the effective (post-decay) state carries most of the weight, with a
 * recency bonus inside that state's TTL. CONFIRMED-and-fresh saturates; LISTED scores 0.
 */
export function evidenceFreshness(c: Candidate, asOf: string): number {
  const eff = effectiveEvidence(c.evidence_status, c.evidence_checked_at, asOf);
  const base = EVIDENCE_RANK[eff] / EVIDENCE_RANK.CONFIRMED; // LISTED 0, CHECKED .5, CONFIRMED 1
  if (base === 0) return 0;

  const age = daysBetween(c.evidence_checked_at, asOf);
  const ttl = EVIDENCE_TTL_DAYS[eff];
  const recency = !Number.isFinite(ttl) || Number.isNaN(age) || age < 0
    ? 0
    : unit(1 - age / ttl); // 1 when checked today, → 0 at the TTL edge

  // 80% of the weight from the state itself, 20% from recency within it.
  return round2(WEIGHTS.evidence_freshness * unit(base * 0.8 + base * recency * 0.2));
}

/**
 * Preference fit (10) — soft wants only (§13). Preferences already covered by a hard requirement are
 * ignored so they aren't double-counted; with no soft preferences declared, this scores full marks
 * (nothing was asked for, so nothing is missing).
 */
export function preferenceFit(m: HousingMission, c: Candidate): number {
  const prefs = m.preferences ?? {};
  const wanted = REQUIREMENT_KEYS.filter(k => prefs[k] === true && !m.requirements[k]);
  if (wanted.length === 0) return WEIGHTS.preference_fit;
  const met = wanted.filter(k => c.requirements[k]).length;
  return round2(WEIGHTS.preference_fit * (met / wanted.length));
}

/** The full breakdown. Pure: (mission, candidate, asOf) → numbers. Nothing else can influence it. */
export function scoreCandidate(m: HousingMission, c: Candidate, asOf: string): ScoreBreakdown {
  const budget_fit = budgetFit(m, c);
  const commute_fit = commuteFit(m, c);
  const date_confidence = dateConfidence(m, c);
  const evidence_freshness = evidenceFreshness(c, asOf);
  const preference_fit = preferenceFit(m, c);
  const total = round2(budget_fit + commute_fit + date_confidence + evidence_freshness + preference_fit);
  return { budget_fit, commute_fit, date_confidence, evidence_freshness, preference_fit, total };
}
