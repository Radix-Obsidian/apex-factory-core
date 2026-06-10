// audit-core.mjs — shared copy-audit logic.
// Imported by BOTH the PreToolUse hook (copywriter-auditor.mjs) and the eval harness
// (evals/eval-regex-gate.mjs) so the eval measures the REAL gate, not a copy of it.

// Files we treat as customer-facing copy (everything else is ignored — never block code).
export const COPY_FILE = /(landing|marketing|pricing|checkout|offer|hero|cta|copy|sales|storefront)/i;
// Surfaces where a risk-reversal/guarantee is mandatory (Hormozi).
export const OFFER_FILE = /(checkout|offer|pricing|sales)/i;

// Godin: banned generic / commoditized language.
const BANNED = ['delve','robust','tapestry','world-class','cutting-edge','seamless','one-stop',
  'game-changer','game changer','synergy','revolutionize','revolutionary','unlock your potential',
  'next level','best-in-class','state-of-the-art','elevate your','empower your'];
// Hormozi: risk reversal / guarantee signal.
const RISK = /(guarantee|money[- ]back|refund|risk[- ]free|no questions asked|or your money back|full refund)/i;
// Godin/Enns: status/tribe or authority framing.
const STATUS = /(people like|for those who|you're the kind|not for everyone|members|insiders|join the|by application|apply to)/i;

/**
 * Audit a copy payload.
 * @returns {{enforced:boolean, fails:string[], warns:string[]}}
 *   enforced=false  -> not a copy file / empty: the gate does not apply
 *   fails.length>0  -> BLOCK (the write is rejected)
 */
export function auditCopy(file, content) {
  if (!COPY_FILE.test(file) || !String(content).trim()) return { enforced: false, fails: [], warns: [] };
  const text = String(content);
  const lc = text.toLowerCase();
  const fails = [];

  const hit = BANNED.filter(w => lc.includes(w));
  if (hit.length) fails.push(`generic/commoditized phrases: ${hit.join(', ')}`);

  if (OFFER_FILE.test(file) && !RISK.test(text))
    fails.push('no risk-reversal/guarantee (Hormozi) on an offer/checkout surface');

  const warns = STATUS.test(text) ? [] : ['weak status/tribe or authority framing (Godin/Enns)'];
  return { enforced: true, fails, warns };
}

/** Convenience for the eval: 'bad' (would block) | 'good' (would pass) | 'ignore' (not enforced). */
export function verdict(file, content) {
  const r = auditCopy(file, content);
  if (!r.enforced) return 'ignore';
  return r.fails.length ? 'bad' : 'good';
}
