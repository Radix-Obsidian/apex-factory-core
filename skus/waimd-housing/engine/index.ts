// engine/index.ts — the WAIMD decision engine's public surface.
//
// Pure, deterministic, zero-dependency, no I/O, no LLM (PRD §13, §26). This directory is the product's
// brain: it is written to port VERBATIM into the Next.js product repo, where the app layer supplies
// persistence (Prisma → Supabase) and payments (Polar). Nothing here knows about either.
//
// Reference implementation + conformance suite live in apex-factory-core so the engine is proven
// BEFORE the beta exists:
//   make waimd-engine-test   — node:test unit + invariant suite
//   make waimd-eval          — tier-1 eval against the labeled corpus
//
// The engine never reads the clock: every entry point takes an explicit `asOf` ISO date. That is what
// makes a decision reproducible, auditable, and testable.

export type {
  Candidate,
  Decision,
  DisqualifiedCandidate,
  EvidenceState,
  GateFailure,
  GateName,
  HousingMission,
  HousingType,
  RequirementKey,
  Requirements,
  ScoreBreakdown,
  ScoredCandidate,
} from './types.ts';
export { EVIDENCE_RANK, REQUIREMENT_KEYS } from './types.ts';

export {
  EVIDENCE_TTL_DAYS,
  daysBetween,
  effectiveEvidence,
  freshnessLabel,
  mayAssertAvailabilityConfirmed,
} from './evidence.ts';

export {
  MIN_GATE_EVIDENCE,
  assignmentMonths,
  gateCommute,
  gateDates,
  gateEconomics,
  gateEvidence,
  gateRequirements,
  monthlyCost,
  runGates,
} from './gates.ts';

export {
  WEIGHTS,
  budgetFit,
  commuteFit,
  dateConfidence,
  evidenceFreshness,
  preferenceFit,
  scoreCandidate,
} from './score.ts';

export { DECISION_PRICE_USD, MAX_CHOICES, decide, preview } from './decide.ts';
