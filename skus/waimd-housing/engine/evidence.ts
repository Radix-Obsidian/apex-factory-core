// engine/evidence.ts — the LISTED → CHECKED → CONFIRMED ladder (PRD §11: "WAIMD Must Never Lie").
//
// The one rule that makes the rest defensible: certainty is EARNED, never assumed. Evidence decays
// with age and only ever decays DOWNWARD — nothing in this module can promote a state. That is the
// same fail-closed posture as gtm/waimd/kill-guard.mjs (unknown → refuse), applied to truth claims.
//
// "Never turn a stale calendar into fake certainty."

import { type EvidenceState, EVIDENCE_RANK } from './types.ts';

/**
 * Staleness TTLs in days, per state. A CONFIRMED fact (a human directly confirmed it) stays
 * trustworthy longer than a CHECKED one (we re-read a page), but neither is trustworthy forever.
 * Past its TTL a state drops exactly one rung — repeatedly, so very old evidence lands at LISTED.
 */
export const EVIDENCE_TTL_DAYS: Readonly<Record<EvidenceState, number>> = Object.freeze({
  CONFIRMED: 7,
  CHECKED: 3,
  LISTED: Number.POSITIVE_INFINITY, // the floor — a listing claim cannot decay below itself
});

const MS_PER_DAY = 86_400_000;

/** Parse an ISO `YYYY-MM-DD` into epoch ms at UTC midnight. Returns NaN if malformed. */
function isoToUtcMs(iso: string): number {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return Number.NaN;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

/**
 * Whole days between two ISO dates (`to - from`). Returns NaN if either is malformed.
 * UTC-anchored so the same inputs give the same answer in every timezone (§13 determinism).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = isoToUtcMs(fromIso);
  const b = isoToUtcMs(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.floor((b - a) / MS_PER_DAY);
}

function demote(state: EvidenceState): EvidenceState {
  if (state === 'CONFIRMED') return 'CHECKED';
  if (state === 'CHECKED') return 'LISTED';
  return 'LISTED';
}

/**
 * The effective evidence state as of `asOf`, after staleness decay.
 *
 * FAIL-CLOSED, by design:
 *   - an unknown/malformed state           → LISTED (the weakest claim, never the strongest)
 *   - a malformed or missing timestamp     → LISTED (we cannot prove freshness, so we claim nothing)
 *   - a timestamp in the FUTURE            → LISTED (nonsense input must not buy certainty)
 *   - age beyond the state's TTL           → demote one rung, repeatedly
 *
 * It can only ever return a state at or below the one it was given. Never above.
 */
export function effectiveEvidence(
  status: EvidenceState,
  checkedAtIso: string,
  asOfIso: string,
): EvidenceState {
  if (!(status in EVIDENCE_RANK)) return 'LISTED';

  const age = daysBetween(checkedAtIso, asOfIso);
  if (Number.isNaN(age)) return 'LISTED'; // unparseable → we know nothing
  if (age < 0) return 'LISTED';           // "checked" in the future → not evidence

  let current: EvidenceState = status;
  // Demote while the current state's TTL is exceeded. Bounded: LISTED has an infinite TTL, so this
  // terminates after at most two steps (CONFIRMED → CHECKED → LISTED).
  for (let i = 0; i < 2; i++) {
    const ttl = EVIDENCE_TTL_DAYS[current];
    if (age <= ttl) break;
    const next = demote(current);
    if (next === current) break;
    current = next;
  }

  // Belt and braces: the result may never outrank the input.
  return EVIDENCE_RANK[current] > EVIDENCE_RANK[status] ? status : current;
}

/**
 * PRD §11: "Only the third state may say: Availability confirmed."
 * The single predicate any customer-facing surface must consult before asserting availability.
 */
export function mayAssertAvailabilityConfirmed(effective: EvidenceState): boolean {
  return effective === 'CONFIRMED';
}

/** Human-readable freshness for the §12 card ("Source last checked: …"). */
export function freshnessLabel(checkedAtIso: string, asOfIso: string): string {
  const age = daysBetween(checkedAtIso, asOfIso);
  if (Number.isNaN(age) || age < 0) return 'freshness unknown';
  if (age === 0) return 'checked today';
  if (age === 1) return 'checked 1 day ago';
  return `checked ${age} days ago`;
}
