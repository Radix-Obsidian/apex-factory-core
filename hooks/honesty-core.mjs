// honesty-core.mjs — shared honesty-audit logic for the "never lie" charter (METHOD.md §5).
// The copywriter-auditor (audit-core.mjs) grades PERSUASION; this grades TRUTHFULNESS.
//
// A product whose entire trust thesis is "we never fabricate" (the waimd-housing decision engine and
// its LISTED / CHECKED / CONFIRMED evidence model — see skus/waimd-housing/) cannot ship the dark
// patterns that generic copy tools happily produce: invented social-proof counters, fake scarcity /
// inventory, or availability stated as certain without a timestamp. Persuasion was already gated;
// honesty was not — this closes that gap in code, fail-closed on the fabrication.
//
// Imported by BOTH the PreToolUse hook (honesty-auditor.mjs) and its test so both grade ONE gate.
import { COPY_FILE } from './audit-core.mjs';

// An availability/certainty claim is legitimate only when the copy carries an evidence marker: an ISO
// date, an "as of / last checked" timestamp, or an explicit evidence state from the product's model.
const EVIDENCE = /(\b20\d\d-\d\d-\d\d\b|as of\b|last checked|checked on|verified on|last updated|updated on|\bLISTED\b|\bCHECKED\b|\bCONFIRMED\b)/;

// Explicit, auditable escape hatch for a claim that IS backed (e.g. a real testimonial once it exists):
//   <!-- honesty-ok: 3 real pilot reviews, see ops/inbox/waimd-housing.jsonl -->
const OVERRIDE = /honesty-ok:/i;

// A. Fabricated social proof — counts of PEOPLE-as-customers or reviews/ratings. A pre-launch product
//    has none, so any such number is invented. Scoped to customer nouns on purpose — it must NOT fire
//    on the product's own honest "3 options / 3 choices / 3 candidates" language.
const SOCIAL_COUNT = /\b[\d,]{1,12}\+?\s*(nurses|clinicians|travel[- ]?nurses|travelers|customers|clients|users|members|families|reviews|ratings|testimonials)\b/i;
const SOCIAL_VERB  = /(trust(ed)?|joined?|love|rely|chose|choose|rated|use us|switched|recommend)/i;
const TRUSTED_BY   = /\btrusted by\s+[\d,]+/i;
const JOIN_N       = /\bjoin\s+[\d,]{2,}/i;
const STAR_RATING  = /(\brated\s+[0-5](?:\.\d+)?\b|\b[0-5](?:\.\d+)?[-\s]*(?:★|stars?\b|\/\s*5\b|out of 5))/i;

// B. Fake inventory / scarcity — fabricated counters (dark patterns). Vague urgency is a warn, not a block.
const FAKE_INVENTORY = /\bonly\s+\d+\s+(left|remaining|spots?|units?|rooms?|homes?|listings?|available)\b/i;
const FAKE_VIEWERS   = /\b\d+\s+(people|nurses|others|users)\s+(viewing|looking|booked|are booking|reserved)\b/i;
const FAKE_BOOKED    = /\b\d+\s+(booked|sold|reserved|claimed)\s+(today|this week|in the last|so far)\b/i;
const VAGUE_URGENCY  = /(selling out|almost gone|going fast|act now|hurry|limited time only)/i;

// C. Un-timestamped certainty about AVAILABILITY. Deliberately NARROW so it never catches the
//    money-back GUARANTEE the copywriter gate REQUIRES — only availability/booking asserted as certain.
const AVAIL_CERTAINTY = /(availability confirmed|confirmed available|guaranteed available|guaranteed to be available|definitely available|100%\s*available|available now,?\s*guaranteed)/i;

/**
 * Audit a copy payload for honesty.
 * @returns {{enforced:boolean, fails:string[], warns:string[]}}
 *   enforced=false  -> not a copy file / empty: the gate does not apply
 *   fails.length>0  -> BLOCK (the write is rejected)
 */
export function auditHonesty(file, content) {
  if (!COPY_FILE.test(file) || !String(content).trim()) return { enforced: false, fails: [], warns: [] };
  const text = String(content);
  if (OVERRIDE.test(text))
    return { enforced: true, fails: [], warns: ['honesty-ok override present — claim asserted as backed; the evidence must be real'] };

  const hasEvidence = EVIDENCE.test(text);
  const fails = [], warns = [];

  if (TRUSTED_BY.test(text) || JOIN_N.test(text) || STAR_RATING.test(text) ||
      (SOCIAL_COUNT.test(text) && SOCIAL_VERB.test(text)))
    fails.push('fabricated social proof — invented customer/review counts or star ratings (a pre-launch product has none; use "honesty-ok:" only for real, backed proof)');

  if (FAKE_INVENTORY.test(text) || FAKE_VIEWERS.test(text) || FAKE_BOOKED.test(text))
    fails.push('fake scarcity/inventory counter — no fabricated "only N left" / "N viewing" / "N booked today" dark patterns');

  if (AVAIL_CERTAINTY.test(text) && !hasEvidence)
    fails.push('availability stated as certain without an evidence marker — needs an as-of date / CHECKED / CONFIRMED (the LISTED→CHECKED→CONFIRMED model)');

  if (VAGUE_URGENCY.test(text))
    warns.push('vague urgency/scarcity — only claim it if it is literally true and evidenced');

  return { enforced: true, fails, warns };
}

/** Convenience for tests: 'bad' (would block) | 'good' (would pass) | 'ignore' (not enforced). */
export function honestyVerdict(file, content) {
  const r = auditHonesty(file, content);
  if (!r.enforced) return 'ignore';
  return r.fails.length ? 'bad' : 'good';
}
