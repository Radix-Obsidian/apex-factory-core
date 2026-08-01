#!/usr/bin/env node
// ops/stripe-teardown.mjs — evidence-gated teardown of the retired Stripe paywall (D29).
//
// Stripe provides NO API for revoking an API key: creation, rolling and deletion are Dashboard-only
// operations. So this tool does not revoke anything. What it does is remove the guesswork on either
// side of that click:
//
//   audit   (BEFORE revoking, while the key still works) — enumerate what is actually still live on
//           the account: subscriptions, un-archived prices/products, in-flight payments, webhook
//           endpoints, recent events. Anything it cannot read is reported UNVERIFIED, never clean.
//
//   verify  (AFTER revoking) — prove the key is dead. Only a genuine 401/invalid_api_key counts as
//           proof, and only that proof may flip `revocation_status` + `teardown_complete` in the
//           registry. Previously those flags would have been set on trust; now they need evidence.
//
// Read-only against Stripe. $0 (no model calls). NEVER prints, logs, or writes the key value.
// Run it on the host where the key lives — it reads the env var named by the registry's `secret_env`.
//
//   exit 0 — audit: nothing outstanding · verify: PROVEN REVOKED (registry updated)
//   exit 1 — audit: items still need action · verify: the key is STILL LIVE
//   exit 2 — INDETERMINATE (no key, network failure, unreadable registry) — nothing is ever changed
//
// Usage:  node ops/stripe-teardown.mjs audit  [--json] [--sku <slug>]
//         node ops/stripe-teardown.mjs verify [--json] [--sku <slug>]
import fs from 'node:fs';
import { loadRegistry, findSku, REGISTRY_PATH } from './registry.mjs';

const STRIPE = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 20_000;
const DEFAULT_SLUG = 'dot-navigator';

// ── pure core (no I/O — unit-tested with an injected fetch) ──

/**
 * Classify a single Stripe response into a revocation verdict.
 * Fail-closed: only an explicit auth rejection proves revocation. Anything ambiguous is
 * INDETERMINATE, which never authorises a state change.
 * @returns {'REVOKED'|'STILL_LIVE'|'UNVERIFIED'|'INDETERMINATE'}
 */
export function classifyStatus(status) {
  if (status === 401) return 'REVOKED';      // invalid_api_key — the key no longer authenticates
  if (status === 200) return 'STILL_LIVE';   // it authenticated: the key is very much alive
  if (status === 403) return 'UNVERIFIED';   // authenticated but out of scope — key still works!
  return 'INDETERMINATE';                    // 429/5xx/network — we know nothing
}

/**
 * A 403 means the key AUTHENTICATED but lacked scope — which still proves it is live. Verification
 * treats that as STILL_LIVE; only auditing treats it as "couldn't read this resource".
 */
export function verifyVerdict(status) {
  const c = classifyStatus(status);
  return c === 'UNVERIFIED' ? 'STILL_LIVE' : c;
}

/** Only a proven revocation may write the registry. Everything else leaves it untouched. */
export function mayFlipTeardown(verdict) {
  return verdict === 'REVOKED';
}

/** Summarise audit findings into {outstanding, unverified, clean}. Fail-closed: unverified ⇒ not clean. */
export function summarizeAudit(findings) {
  const outstanding = findings.filter(f => f.state === 'OUTSTANDING');
  const unverified = findings.filter(f => f.state === 'UNVERIFIED');
  return {
    outstanding: outstanding.length,
    unverified: unverified.length,
    clean: outstanding.length === 0 && unverified.length === 0,
  };
}

// ── I/O ──

/** One bounded, read-only GET. Returns {status, data} — never throws, never surfaces the key. */
export async function stripeGet(key, path, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${STRIPE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty/non-JSON body is fine */ }
    return { status: res.status, data };
  } catch (e) {
    // Abort/DNS/TLS — an unreachable API tells us nothing about the key.
    return { status: 0, data: null, error: String(e?.message || e) };
  } finally { clearTimeout(t); }
}

/** The resources worth checking before a paywall is torn down. */
const AUDIT_PROBES = [
  {
    key: 'subscriptions', label: 'Active subscriptions',
    path: '/subscriptions?status=all&limit=100',
    count: d => (d?.data || []).filter(s => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status)).length,
    fix: 'cancel or migrate them before revoking — revoking a key does not stop a subscription billing',
  },
  {
    key: 'prices', label: 'Un-archived prices',
    path: '/prices?active=true&limit=100',
    count: d => (d?.data || []).length,
    fix: 'archive the $9 per-doc and $39 Audit-Ready Packet prices in the Dashboard',
  },
  {
    key: 'products', label: 'Un-archived products',
    path: '/products?active=true&limit=100',
    count: d => (d?.data || []).length,
    fix: 'archive them so nothing new can be purchased',
  },
  {
    key: 'payment_intents', label: 'Payments in flight',
    path: '/payment_intents?limit=100',
    count: d => (d?.data || []).filter(p => ['requires_capture', 'requires_action', 'processing', 'requires_confirmation'].includes(p.status)).length,
    fix: 'capture, cancel or refund them — money mid-flight is not settled by a revocation',
  },
  {
    key: 'webhook_endpoints', label: 'Webhook endpoints',
    path: '/webhook_endpoints?limit=100',
    count: d => (d?.data || []).filter(w => w.status === 'enabled').length,
    fix: 'DELETE any endpoint you did not create — an attacker-added endpoint survives rolling the one key you knew about',
  },
];

export async function runAudit(key, fetchImpl = globalThis.fetch) {
  const findings = [];
  for (const probe of AUDIT_PROBES) {
    const { status, data, error } = await stripeGet(key, probe.path, fetchImpl);
    const cls = classifyStatus(status);
    if (cls === 'REVOKED') {
      findings.push({ ...probe, state: 'UNVERIFIED', detail: 'key already revoked — run the audit BEFORE revoking, or check the Dashboard' });
      continue;
    }
    if (cls === 'UNVERIFIED') {
      findings.push({ ...probe, state: 'UNVERIFIED', detail: 'key lacks scope to read this — check it in the Dashboard' });
      continue;
    }
    if (cls === 'INDETERMINATE') {
      findings.push({ ...probe, state: 'UNVERIFIED', detail: `could not read (${error || `HTTP ${status}`}) — check it in the Dashboard` });
      continue;
    }
    const n = probe.count(data);
    findings.push({
      ...probe,
      state: n > 0 ? 'OUTSTANDING' : 'CLEAR',
      count: n,
      detail: n > 0 ? `${n} item(s) still live` : 'none',
    });
  }
  return findings;
}

export async function runVerify(key, fetchImpl = globalThis.fetch) {
  // A single cheap authenticated read. We care only whether the credential authenticates.
  const { status, error } = await stripeGet(key, '/balance', fetchImpl);
  return { verdict: verifyVerdict(status), status, error };
}

/** Flip the teardown flags. Called ONLY on a proven revocation. */
export function applyRevocation(slug, todayIso, registryPath = REGISTRY_PATH) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const reg = JSON.parse(raw);
  const sku = reg.skus.find(s => s.slug === slug);
  if (!sku) throw new Error(`no SKU '${slug}' in the registry`);
  sku.billing = sku.billing || {};
  sku.billing.revocation_status = 'REVOKED';
  sku.billing.revoked_at = todayIso;
  sku.teardown_complete = true;
  fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
  return sku;
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const mode = argv.find(a => !a.startsWith('--')) || 'audit';
  const slugIdx = argv.indexOf('--sku');
  const slug = slugIdx >= 0 ? argv[slugIdx + 1] : DEFAULT_SLUG;

  const out = (obj, code) => {
    if (json) console.log(JSON.stringify(obj, null, 2));
    process.exit(code);
  };

  if (!['audit', 'verify'].includes(mode)) {
    console.error('usage: node ops/stripe-teardown.mjs [audit|verify] [--json] [--sku <slug>]');
    process.exit(2);
  }

  let sku;
  try { sku = findSku(loadRegistry(), slug); } catch (e) {
    console.error(`✗ registry unreadable: ${e.message}`); process.exit(2);
  }
  if (!sku) { console.error(`✗ no SKU '${slug}' in the registry`); process.exit(2); }

  const envName = sku.billing?.secret_env;
  const key = envName ? process.env[envName] : undefined;

  if (!envName || !key) {
    const msg = `INDETERMINATE — ${envName || 'billing.secret_env'} is not set in this environment.`;
    if (json) out({ mode, slug, verdict: 'INDETERMINATE', reason: msg }, 2);
    console.log(`— STRIPE TEARDOWN (${slug}) —\n`);
    console.log(`  ${msg}`);
    console.log('  Run this on the host where the key lives. Nothing was changed.');
    console.log('\n  Note: Stripe has NO API to revoke a key — that step is Dashboard-only:');
    console.log('    Developers → API keys → roll or delete the restricted key.');
    process.exit(2);
  }

  if (mode === 'audit') {
    const findings = await runAudit(key, globalThis.fetch);
    const sum = summarizeAudit(findings);
    if (json) out({ mode, slug, ...sum, findings: findings.map(({ count, fix, ...f }) => ({ ...f, count, fix })) }, sum.clean ? 0 : 1);
    const icon = { OUTSTANDING: '✗', UNVERIFIED: '~', CLEAR: '✓' };
    console.log(`— STRIPE TEARDOWN AUDIT (${slug}) —`);
    console.log('  Run this BEFORE revoking, while the key still works.\n');
    for (const f of findings) {
      console.log(`  ${icon[f.state]} ${f.label}: ${f.detail}`);
      if (f.state !== 'CLEAR') console.log(`      → ${f.fix}`);
    }
    console.log('\n  ⚠ API keys themselves CANNOT be enumerated via the Stripe API — by Stripe\'s design.');
    console.log('    Check Developers → API keys in the Dashboard for any key you did not create.');
    console.log(`\n  ${sum.outstanding} outstanding · ${sum.unverified} unverified`);
    console.log(sum.clean
      ? '\n  VERDICT: account reads clear — proceed to revoke, then run `make stripe-verify`.'
      : '\n  VERDICT: NOT CLEAR — handle the items above first. Unverified counts as not clear.');
    process.exit(sum.clean ? 0 : 1);
  }

  // verify
  const { verdict, status, error } = await runVerify(key, globalThis.fetch);
  const today = new Date().toISOString().slice(0, 10);

  if (verdict === 'REVOKED' && mayFlipTeardown(verdict)) {
    let updated;
    try { updated = applyRevocation(slug, today); } catch (e) {
      console.error(`✗ key is revoked, but the registry update failed: ${e.message}`); process.exit(2);
    }
    if (json) out({ mode, slug, verdict, status, registry_updated: true, revoked_at: today }, 0);
    console.log(`— STRIPE TEARDOWN VERIFY (${slug}) —\n`);
    console.log('  ✓ PROVEN REVOKED — Stripe rejected the credential (401 invalid_api_key).');
    console.log(`  Registry updated: revocation_status=REVOKED, revoked_at=${today}, teardown_complete=true`);
    console.log(`  (${updated.slug} will stop appearing as [TEARDOWN] in the operator digest.)`);
    console.log('\n  Still worth doing if you have not: unset the var on every host, and confirm no');
    console.log('  unfamiliar keys or webhook endpoints remain in the Dashboard.');
    process.exit(0);
  }

  if (verdict === 'STILL_LIVE') {
    if (json) out({ mode, slug, verdict, status, registry_updated: false }, 1);
    console.log(`— STRIPE TEARDOWN VERIFY (${slug}) —\n`);
    console.log(`  ✗ THE KEY IS STILL LIVE — Stripe accepted it (HTTP ${status}).`);
    console.log('  Nothing was changed. Revoke it: Developers → API keys → roll or delete.');
    process.exit(1);
  }

  if (json) out({ mode, slug, verdict, status, error, registry_updated: false }, 2);
  console.log(`— STRIPE TEARDOWN VERIFY (${slug}) —\n`);
  console.log(`  ~ INDETERMINATE — could not reach Stripe (${error || `HTTP ${status}`}).`);
  console.log('  Nothing was changed. A non-answer is never treated as proof of revocation.');
  process.exit(2);
}
