// engine/types.ts — the WAIMD decision engine's data contract.
//
// Field names follow the PRD's own vocabulary: the Housing Mission (§6) and the minimal data model
// (§27). Mission is the primitive — not user, not listing, not landlord (§30).
//
// Pure types. No I/O, no dependencies, no framework coupling: this directory is the product's brain
// and ports verbatim into the Next.js repo.

/** PRD §11 — the evidence ladder. Ordered: certainty is earned, never assumed. */
export type EvidenceState = 'LISTED' | 'CHECKED' | 'CONFIRMED';

/** Rank order for comparisons. Higher = more certain. */
export const EVIDENCE_RANK: Readonly<Record<EvidenceState, number>> = Object.freeze({
  LISTED: 0,
  CHECKED: 1,
  CONFIRMED: 2,
});

/** PRD §8 — the five hard requirements a mission may declare. */
export interface Requirements {
  parking: boolean;
  laundry: boolean;
  furnished: boolean;
  pets: boolean;
  private_bath: boolean;
}

export type RequirementKey = keyof Requirements;

export const REQUIREMENT_KEYS: readonly RequirementKey[] = Object.freeze([
  'parking', 'laundry', 'furnished', 'pets', 'private_bath',
] as const);

export type HousingType = 'entire_place' | 'private_room';

/**
 * PRD §6/§27 — the Housing Mission. Dates are ISO `YYYY-MM-DD` strings: the engine compares them
 * lexicographically, which is correct for ISO dates and keeps the engine free of timezone behaviour
 * (a Date-based comparison would make the same input score differently depending on where it ran —
 * that would break the determinism guarantee in §13).
 */
export interface HousingMission {
  id: string;                          // human-visible, e.g. "WAIMD-0047" (§9)
  facility: string;
  city: string;
  state?: string;
  start_date: string;                  // ISO YYYY-MM-DD
  end_date: string;                    // ISO YYYY-MM-DD
  budget_max: number;                  // monthly USD ceiling
  housing_type: HousingType;
  commute_max_minutes: number;
  requirements: Requirements;          // hard must-haves (§8) — all must be satisfied
  preferences?: Partial<Requirements>; // soft wants (§13 "preference fit", 10 pts)
}

/** PRD §27 — a candidate property, plus the evidence attached to it (§11). */
export interface Candidate {
  id: string;
  mission_id: string;
  source_name: string;
  source_url: string;
  monthly_price: number;
  /** Total expected cost for the stay; gate 2 uses this when present (§10 "total expected cost"). */
  estimated_total_cost?: number;
  availability_start: string;          // ISO YYYY-MM-DD
  availability_end: string;            // ISO YYYY-MM-DD
  commute_minutes: number;
  housing_type: HousingType;
  requirements: Requirements;          // what this candidate actually offers
  evidence_status: EvidenceState;
  evidence_checked_at: string;         // ISO YYYY-MM-DD — when the evidence was established
}

export type GateName = 'dates' | 'economics' | 'commute' | 'requirements' | 'evidence';

export interface GateFailure {
  gate: GateName;
  reason: string;
}

/** The 100-point breakdown (§13). Every field is derived; nothing may be injected. */
export interface ScoreBreakdown {
  budget_fit: number;         // 30
  commute_fit: number;        // 25
  date_confidence: number;    // 20
  evidence_freshness: number; // 15
  preference_fit: number;     // 10
  total: number;              // 0..100
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: ScoreBreakdown;
  /** The evidence state after staleness decay (§11) — what may actually be shown to a customer. */
  effective_evidence: EvidenceState;
  /** Deterministic, human-readable rationale inputs (§12 "Why WAIMD chose it"). */
  why: string[];
  /** Honest uncertainty surfaced to the customer (§12 "Watch-outs"). */
  watch_outs: string[];
}

export interface DisqualifiedCandidate {
  candidate: Candidate;
  failure: GateFailure;
}

/**
 * The Decision (§14, §15). `paid` is false when fewer than three options qualify — the customer pays
 * $0. The engine decides this; no caller may override it.
 */
export interface Decision {
  mission_id: string;
  choices: ScoredCandidate[];          // at most 3 (§14)
  disqualified: DisqualifiedCandidate[];
  solvable: boolean;                   // three qualifying options were produced
  paid: boolean;                       // chargeable — always equals `solvable` (§15)
  price_usd: number;                   // 29 when paid, 0 otherwise
}
