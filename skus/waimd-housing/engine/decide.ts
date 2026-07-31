// engine/decide.ts — assignment in → decision out. The orchestration layer (PRD §5, §14, §15).
//
//   CONFIRMED ASSIGNMENT + HARD CONSTRAINTS + CURRENT EVIDENCE → 3 VIABLE OPTIONS → 1 MOVE DECISION
//
// Two rules this file exists to enforce, neither of which a caller may override:
//   §14 — at most THREE choices. WAIMD collapses the option space; it never expands it.
//   §15 — if fewer than three qualify, the customer pays $0. `paid` is derived here, never passed in.

import {
  type Candidate,
  type Decision,
  type DisqualifiedCandidate,
  type HousingMission,
  type ScoredCandidate,
  REQUIREMENT_KEYS,
} from './types.ts';
import { runGates, monthlyCost, round2 } from './gates.ts';
import { scoreCandidate } from './score.ts';
import { effectiveEvidence, freshnessLabel, mayAssertAvailabilityConfirmed } from './evidence.ts';

/** PRD §14 — the three-choice rule. Not 50, not 100, not infinite scroll. */
export const MAX_CHOICES = 3;
/** PRD §15 — the price of a complete Decision. */
export const DECISION_PRICE_USD = 29;

/**
 * "Why WAIMD chose it" (§12) — derived strictly from the deterministic numbers. These are statements
 * of fact about the score inputs, not generated prose. A model may later render them; it may not
 * invent them.
 */
function buildWhy(m: HousingMission, c: Candidate): string[] {
  const why: string[] = [];
  const monthly = monthlyCost(m, c);
  const under = round2(m.budget_max - monthly);
  if (under > 0) why.push(`$${under} below budget`);
  const inside = m.commute_max_minutes - c.commute_minutes;
  if (inside > 0) why.push(`${inside} min inside commute limit`);
  const required = REQUIREMENT_KEYS.filter(k => m.requirements[k]);
  if (required.length) why.push(`${required.length}/${required.length} required features`);
  return why;
}

/**
 * "Watch-outs" (§12) — honest uncertainty, surfaced rather than hidden. This is the trust mechanic:
 * we say what we do NOT know.
 */
function buildWatchOuts(m: HousingMission, c: Candidate, asOf: string): string[] {
  const out: string[] = [];
  const eff = effectiveEvidence(c.evidence_status, c.evidence_checked_at, asOf);
  if (!mayAssertAvailabilityConfirmed(eff))
    out.push(`availability not confirmed — evidence is ${eff} (${freshnessLabel(c.evidence_checked_at, asOf)})`);
  const monthly = monthlyCost(m, c);
  if (monthly > m.budget_max * 0.95) out.push('within 5% of your budget ceiling — little headroom');
  if (c.commute_minutes > m.commute_max_minutes * 0.9) out.push('commute is near your stated limit');
  // Soft preferences that went unmet are a watch-out, never a silent omission.
  const prefs = m.preferences ?? {};
  for (const k of REQUIREMENT_KEYS)
    if (prefs[k] === true && !m.requirements[k] && !c.requirements[k]) out.push(`preference not met: ${k}`);
  return out;
}

/**
 * Rank scored candidates. Deterministic total order — ties are broken by evidence strength, then by
 * cheaper monthly cost, then by candidate id, so the same input set never produces two orderings.
 */
function rank(m: HousingMission, a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  if (b.score.evidence_freshness !== a.score.evidence_freshness)
    return b.score.evidence_freshness - a.score.evidence_freshness;
  const ca = monthlyCost(m, a.candidate);
  const cb = monthlyCost(m, b.candidate);
  if (ca !== cb) return ca - cb;
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0;
}

/**
 * Produce the Decision.
 *
 * @param mission    the Housing Mission (§6)
 * @param candidates the candidate pool
 * @param asOf       ISO `YYYY-MM-DD` the decision is made on — evidence decay is relative to it.
 *                   Required and explicit: the engine never reads the clock, which is what makes it
 *                   reproducible and testable (§13).
 */
export function decide(mission: HousingMission, candidates: readonly Candidate[], asOf: string): Decision {
  const qualified: ScoredCandidate[] = [];
  const disqualified: DisqualifiedCandidate[] = [];

  for (const c of candidates) {
    const failure = runGates(mission, c, asOf);
    if (failure) { disqualified.push({ candidate: c, failure }); continue; }
    qualified.push({
      candidate: c,
      score: scoreCandidate(mission, c, asOf),
      effective_evidence: effectiveEvidence(c.evidence_status, c.evidence_checked_at, asOf),
      why: buildWhy(mission, c),
      watch_outs: buildWatchOuts(mission, c, asOf),
    });
  }

  qualified.sort((a, b) => rank(mission, a, b));

  // §15 — solvable ONLY when three qualifying options exist. Derived, never supplied.
  const solvable = qualified.length >= MAX_CHOICES;
  const choices = qualified.slice(0, MAX_CHOICES); // §14 — hard cap

  return {
    mission_id: mission.id,
    choices,
    disqualified,
    solvable,
    paid: solvable,
    price_usd: solvable ? DECISION_PRICE_USD : 0,
  };
}

/**
 * The free tier (§15): a mission always yields a Match #1 preview; the full Decision is the paid
 * unlock. Returns null when nothing qualified — there is nothing honest to preview.
 */
export function preview(decision: Decision): ScoredCandidate | null {
  return decision.choices[0] ?? null;
}
