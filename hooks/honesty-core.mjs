// honesty-core.mjs — shared honesty-audit logic for the "never lie" charter (METHOD.md §5).
// The copywriter-auditor (audit-core.mjs) grades PERSUASION; this grades TRUTHFULNESS.
//
// A product whose entire trust thesis is "we never fabricate" cannot ship the dark patterns generic
// copy tools happily produce. The rules below are the factory-side enforcement of the waimd-housing
// PRD's two hard product rules — §11 "WAIMD Must Never Lie" (the LISTED → CHECKED → CONFIRMED evidence
// ladder) and §19 Trust Architecture ("No fake reviews. No fake inventory. No invented 'verified'
// badges. No fake nurses. No vanity counters.") — but they are product-agnostic and bind all copy.
//
// Imported by BOTH the PreToolUse hook (honesty-auditor.mjs) and its test so both grade ONE gate.
import { COPY_FILE } from './audit-core.mjs';

// Evidence markers. The evidence-state names are UPPERCASE tokens (LISTED/CHECKED/CONFIRMED) and are
// matched case-SENSITIVELY on purpose: lowercase "confirmed" is ordinary English ("availability
// confirmed") and must never count as the CONFIRMED state. Timestamps are case-insensitive.
const STATE_TOKEN = /\b(LISTED|CHECKED|CONFIRMED)\b/;
const TIMESTAMP   = /(\b20\d\d-\d\d-\d\d\b|as of\b|last checked|checked on|verified on|last updated|updated on)/i;
const EVIDENCE    = { test: t => STATE_TOKEN.test(t) || TIMESTAMP.test(t) };

// PRD §11: ONLY the CONFIRMED state — a landlord/property rep directly confirming — may assert
// availability as certain. A bare date, LISTED, or CHECKED does NOT authorize it ("never turn a stale
// calendar into fake certainty"). Either the literal uppercase token or an explicit confirmation source.
const CONFIRMED_TOKEN  = /\bCONFIRMED\b/;
const CONFIRMED_SOURCE = /confirmed (?:by|with)\s+(?:the\s+)?(?:landlord|property manager|property representative|owner|host|leasing office)/i;
const CONFIRMED_GRADE  = { test: t => CONFIRMED_TOKEN.test(t) || CONFIRMED_SOURCE.test(t) };

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

// A2. Fabricated PERSONAS — PRD §19 "No fake nurses". A quoted line attributed to a named persona with
//     a role/credential is a testimonial; pre-launch it is invented. Real ones use the override.
const QUOTED       = /["“”].{10,}?["“”]|^\s*>\s*.{10,}/m;
const PERSONA_ATTR = /[—–-]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z.]*)?\s*,?\s*(RN|LPN|BSN|ICU|ER|OR|NICU|travel nurse|nurse|clinician|customer|client)\b/;

// B. Fake inventory / scarcity — fabricated counters (dark patterns). Vague urgency is a warn, not a block.
const FAKE_INVENTORY = /\bonly\s+\d+\s+(left|remaining|spots?|units?|rooms?|homes?|listings?|available)\b/i;
const FAKE_VIEWERS   = /\b\d+\s+(people|nurses|others|users)\s+(viewing|looking|booked|are booking|reserved)\b/i;
const FAKE_BOOKED    = /\b\d+\s+(booked|sold|reserved|claimed)\s+(today|this week|in the last|so far)\b/i;
const VAGUE_URGENCY  = /(selling out|almost gone|going fast|act now|hurry|limited time only)/i;

// B2. Invented trust badges — PRD §19 "No invented 'verified' badges". A badge-style verified/official/
//     trusted claim needs an evidence marker or an explicit attribution; otherwise it is decoration
//     asserting a verification that never happened.
const BADGE = /((?:✓|✔|✅|★|🛡|100%|fully|all|every)\s*[\w\s]{0,12}?\b(verified|vetted|certified|official|trusted|guaranteed)\b|\b(verified|vetted|certified)\s+(landlord|listing|property|host|unit|home|rental|nurse|profile)s?\b|\b(verified|vetted)\s+badge\b)/i;

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

  if (QUOTED.test(text) && PERSONA_ATTR.test(text))
    fails.push('fabricated persona testimonial — a quote attributed to a named nurse/customer ("no fake nurses"). Real testimonials need the "honesty-ok:" override naming where the evidence lives');

  if (FAKE_INVENTORY.test(text) || FAKE_VIEWERS.test(text) || FAKE_BOOKED.test(text))
    fails.push('fake scarcity/inventory counter — no fabricated "only N left" / "N viewing" / "N booked today" dark patterns');

  if (BADGE.test(text) && !hasEvidence)
    fails.push('invented trust badge — a "verified"/"vetted"/"official" claim with nothing behind it. Say who verified what, and when');

  if (AVAIL_CERTAINTY.test(text) && !CONFIRMED_GRADE.test(text))
    fails.push('availability asserted as certain without CONFIRMED-grade evidence — only a direct landlord/property-rep confirmation may say this. LISTED, CHECKED, or a bare date is NOT enough (never turn a stale calendar into fake certainty)');

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
