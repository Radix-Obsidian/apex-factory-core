#!/usr/bin/env node
// ops/posture.mjs — the factory's security posture switch (D31).
//
// Borrowed from qm's strict/auto/dangerous model (D30), with one deliberate hardening: in qm the
// posture governs the whole tool surface. Here it governs ADVISORY guards only. A posture switch that
// can disable the money and truth boundaries is not a safety feature — it is a footgun with a
// friendly name, and the one someone reaches for at 2am under deadline pressure.
//
//   strict     — warnings are promoted to blocks. Nothing advisory gets waved through.
//   auto       — DEFAULT. Failures block, warnings warn. Today's behaviour.
//   dangerous  — style/persuasion failures degrade to warnings, so a rush can ship ugly copy.
//                It CANNOT touch anything in INVIOLABLE.
//
// Deterministic, read-only, $0. Unknown/malformed posture falls back to `auto` — never to `dangerous`.
import { fileURLToPath } from 'node:url';

export const POSTURES = Object.freeze(['strict', 'auto', 'dangerous']);
export const DEFAULT_POSTURE = 'auto';
export const POSTURE_ENV = 'FACTORY_POSTURE';

/**
 * Guards no posture may EVER relax. These are the boundaries that, once crossed, cannot be walked
 * back: money that left, a lie a customer believed, a credential that leaked, a dead SKU that woke up.
 *
 * `honesty` is in this list on purpose. For a product whose entire wedge is "we never fabricate"
 * (waimd-housing PRD §11/§19), a switch that turns off the never-lie gate would be the single most
 * expensive convenience in the repo.
 */
export const INVIOLABLE = Object.freeze(new Set([
  'publish-gate',       // deploy-guard.sh publish — the irreversible charge boundary (D5)
  'deploy-guard',       // live keys must never reach a preview deploy (D28: Stripe AND Polar)
  'secret-detection',   // raw credentials must never be committed
  'honesty',            // the never-lie charter — fabricated proof/scarcity/certainty (D25–D26)
  'kill-guard',         // a killed SKU's outreach stays frozen (D24)
  'retired-provider',   // no resurrecting a retired paywall (D28)
  'model-guard',        // fail-closed spend routing (D23)
]));

/** Guards a posture MAY relax — advisory quality gates whose failure costs taste, not trust. */
export const RELAXABLE = Object.freeze(new Set(['copywriter', 'caching']));

/** Resolve the active posture. Unknown, empty, or malformed ⇒ `auto`. Never silently `dangerous`. */
export function resolvePosture(env = process.env) {
  const raw = String(env?.[POSTURE_ENV] ?? '').trim().toLowerCase();
  return POSTURES.includes(raw) ? raw : DEFAULT_POSTURE;
}

/** True only for a guard that is genuinely relaxable. Unknown guards are treated as inviolable. */
export function mayRelax(guard) {
  return RELAXABLE.has(guard) && !INVIOLABLE.has(guard);
}

/**
 * Apply the posture to one guard's result.
 *
 * @param {string} guard   guard id, e.g. 'copywriter' | 'honesty'
 * @param {{fails:string[], warns:string[]}} result
 * @param {string} posture
 * @returns {{fails:string[], warns:string[], blocked:boolean, relaxed:boolean, promoted:boolean}}
 */
export function applyPosture(guard, result, posture = resolvePosture()) {
  const fails = [...(result?.fails ?? [])];
  const warns = [...(result?.warns ?? [])];
  const p = POSTURES.includes(posture) ? posture : DEFAULT_POSTURE;

  // An inviolable guard is returned untouched in EVERY posture — including strict, which may still
  // promote its warnings, but never dangerous, which may never soften it.
  if (!mayRelax(guard)) {
    if (p === 'strict' && warns.length)
      return { fails: [...fails, ...warns], warns: [], blocked: true, relaxed: false, promoted: true };
    return { fails, warns, blocked: fails.length > 0, relaxed: false, promoted: false };
  }

  if (p === 'strict' && warns.length)
    return { fails: [...fails, ...warns], warns: [], blocked: true, relaxed: false, promoted: true };

  if (p === 'dangerous' && fails.length)
    return { fails: [], warns: [...warns, ...fails], blocked: false, relaxed: true, promoted: false };

  return { fails, warns, blocked: fails.length > 0, relaxed: false, promoted: false };
}

/** One-line banner for a hook to print when a non-default posture is active. */
export function postureBanner(posture = resolvePosture()) {
  if (posture === 'auto') return null;
  return posture === 'strict'
    ? '🏭 posture=STRICT — advisory warnings are blocking.'
    : '🏭 posture=DANGEROUS — style gates are advisory. Money, secrets and honesty gates are UNAFFECTED.';
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const posture = resolvePosture();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      posture, default: DEFAULT_POSTURE, env: POSTURE_ENV,
      inviolable: [...INVIOLABLE], relaxable: [...RELAXABLE],
    }, null, 2));
    process.exit(0);
  }
  console.log(`— FACTORY SECURITY POSTURE —\n`);
  console.log(`  active: ${posture.toUpperCase()}${posture === DEFAULT_POSTURE ? '  (default)' : ''}`);
  console.log(`  set with: ${POSTURE_ENV}=strict|auto|dangerous\n`);
  console.log('  strict    — advisory warnings block');
  console.log('  auto      — failures block, warnings warn  (default)');
  console.log('  dangerous — style/persuasion failures degrade to warnings\n');
  console.log('  NEVER relaxable by any posture:');
  for (const g of [...INVIOLABLE].sort()) console.log(`    ✓ ${g}`);
  console.log('\n  Relaxable (taste, not trust):');
  for (const g of [...RELAXABLE].sort()) console.log(`    ~ ${g}`);
  const banner = postureBanner(posture);
  if (banner) console.log(`\n  ${banner}`);
}
