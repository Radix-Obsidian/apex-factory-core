// engine/gates.ts — the five hard gates (PRD §10). Any failure disqualifies the candidate.
//
// Order is fixed and meaningful: dates → economics → commute → hard requirements → evidence quality.
// The first failure wins, so a rejection reason is always the *earliest* thing wrong — stable and
// debuggable (§13), and stable across runs (§13 determinism).
//
// Gate 5 is the fail-closed one: a candidate whose evidence has decayed to a bare listing claim
// cannot be gated on. We never let an unverified claim satisfy a hard constraint.

import {
  type Candidate,
  type GateFailure,
  type HousingMission,
  REQUIREMENT_KEYS,
} from './types.ts';
import { effectiveEvidence } from './evidence.ts';
import { EVIDENCE_RANK } from './types.ts';

/** Gate 5 floor: evidence must be at least CHECKED to be gated on (§10 gate 5, §11). */
export const MIN_GATE_EVIDENCE = 'CHECKED' as const;

/** Gate 1 — dates. Does it plausibly cover the assignment period? */
export function gateDates(m: HousingMission, c: Candidate): GateFailure | null {
  // ISO dates compare correctly as strings; no Date objects, no timezone drift.
  if (!(c.availability_start <= m.start_date))
    return { gate: 'dates', reason: `available ${c.availability_start}, assignment starts ${m.start_date}` };
  if (!(c.availability_end >= m.end_date))
    return { gate: 'dates', reason: `available until ${c.availability_end}, assignment ends ${m.end_date}` };
  return null;
}

/**
 * Gate 2 — economics. "Does total expected cost satisfy the mission budget?" (§10)
 * The budget is monthly, so a supplied total is normalised to a monthly figure over the assignment.
 */
export function gateEconomics(m: HousingMission, c: Candidate): GateFailure | null {
  const monthly = monthlyCost(m, c);
  if (!(monthly <= m.budget_max))
    return { gate: 'economics', reason: `$${round2(monthly)}/mo exceeds budget $${m.budget_max}/mo` };
  return null;
}

/** Gate 3 — commute. Within the specified tolerance? */
export function gateCommute(m: HousingMission, c: Candidate): GateFailure | null {
  if (!(c.commute_minutes <= m.commute_max_minutes))
    return { gate: 'commute', reason: `${c.commute_minutes} min exceeds ${m.commute_max_minutes} min tolerance` };
  return null;
}

/** Gate 4 — hard requirements. All must-haves satisfied; one failure rejects. */
export function gateRequirements(m: HousingMission, c: Candidate): GateFailure | null {
  if (m.housing_type !== c.housing_type)
    return { gate: 'requirements', reason: `housing type ${c.housing_type}, mission needs ${m.housing_type}` };
  for (const k of REQUIREMENT_KEYS) {
    if (m.requirements[k] && !c.requirements[k])
      return { gate: 'requirements', reason: `missing required: ${k}` };
  }
  return null;
}

/**
 * Gate 5 — evidence quality. "How confident are we that the information is current?" (§10)
 * Fail-closed: after decay, anything weaker than CHECKED cannot be gated on (§11).
 */
export function gateEvidence(_m: HousingMission, c: Candidate, asOf: string): GateFailure | null {
  const eff = effectiveEvidence(c.evidence_status, c.evidence_checked_at, asOf);
  if (EVIDENCE_RANK[eff] < EVIDENCE_RANK[MIN_GATE_EVIDENCE])
    return {
      gate: 'evidence',
      reason: `evidence is ${eff} as of ${asOf} (needs ${MIN_GATE_EVIDENCE}); stale or unverified claims never qualify`,
    };
  return null;
}

/**
 * Run all five gates in order. Returns the FIRST failure, or null if the candidate qualifies.
 * @param asOf ISO date the decision is being made on — evidence decay is relative to it.
 */
export function runGates(m: HousingMission, c: Candidate, asOf: string): GateFailure | null {
  return (
    gateDates(m, c) ??
    gateEconomics(m, c) ??
    gateCommute(m, c) ??
    gateRequirements(m, c) ??
    gateEvidence(m, c, asOf)
  );
}

// ── shared helpers (also used by scoring, so both agree on the cost basis) ──

/** Assignment length in months, floored at 1 so a sub-month stay never divides cost upward. */
export function assignmentMonths(m: HousingMission): number {
  const start = Date.parse(`${m.start_date}T00:00:00Z`);
  const end = Date.parse(`${m.end_date}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  return Math.max(1, (end - start) / 86_400_000 / 30.4375);
}

/** The candidate's effective monthly cost: a supplied total wins over the sticker price. */
export function monthlyCost(m: HousingMission, c: Candidate): number {
  if (typeof c.estimated_total_cost === 'number' && Number.isFinite(c.estimated_total_cost))
    return c.estimated_total_cost / assignmentMonths(m);
  return c.monthly_price;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
