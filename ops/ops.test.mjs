// ops/ops.test.mjs — deterministic guardrail tests for the post-launch operations layer (D20).
// $0 LLM, no network: every test runs against the pure cores or the local registry file. Run via
// `node --test ops/ops.test.mjs` (or `make ops-verify`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRegistry, validateRegistry } from './registry.mjs';
import { subMonthlyCents, summarize, skuRevenue } from './revenue.mjs';
import { assess } from './canary.mjs';
import { triage } from './support.mjs';

// ── registry validation ──
test('the shipped registry.json loads and is structurally valid', () => {
  const reg = loadRegistry();
  const v = validateRegistry(reg);
  assert.equal(v.ok, true, `registry invalid: ${v.errors.join('; ')}`);
  assert.ok(reg.skus.length >= 1);
});

test('validateRegistry rejects bad slug, status, missing name, dup slug, and a raw key in secret_env', () => {
  const bad = {
    version: 1,
    skus: [
      { slug: 'Bad Slug', name: 'x', status: 'live', repo: 'r' },                       // bad slug
      { slug: 'ok', status: 'nope', repo: 'r' },                                        // bad status + missing name
      { slug: 'ok', name: 'dup', status: 'live', repo: 'r' },                           // duplicate slug
      { slug: 'leaky', name: 'y', status: 'live', repo: 'r', billing: { provider: 'stripe', secret_env: 'sk_live_abc' } }, // raw key
    ],
  };
  const v = validateRegistry(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => /kebab-case/.test(e)));
  assert.ok(v.errors.some(e => /status must be/.test(e)));
  assert.ok(v.errors.some(e => /missing name/.test(e)));
  assert.ok(v.errors.some(e => /duplicate slug/.test(e)));
  assert.ok(v.errors.some(e => /RAW KEY/.test(e)));
});

// ── D27: Polar is a first-class paid provider (the portfolio moved off Stripe) ──
test('every PAID provider requires secret_env — not just stripe', () => {
  const reg = {
    version: 1,
    skus: [
      { slug: 'polar-no-key', name: 'p', status: 'live', repo: 'r', billing: { provider: 'polar' } },
      { slug: 'stripe-no-key', name: 's', status: 'live', repo: 'r', billing: { provider: 'stripe' } },
      { slug: 'free', name: 'f', status: 'live', repo: 'r', billing: { provider: 'none' } }, // no key needed
    ],
  };
  const v = validateRegistry(reg);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => /polar-no-key.*polar billing requires secret_env/.test(e)),
    'a polar SKU without secret_env must be rejected (a hardcoded stripe check would exempt it)');
  assert.ok(v.errors.some(e => /stripe-no-key.*stripe billing requires secret_env/.test(e)));
  assert.equal(v.errors.some(e => /\(free\)/.test(e)), false, 'provider "none" needs no key');
});

test('the raw-key guard is provider-agnostic — a pasted Polar token is rejected', () => {
  for (const leak of ['polar_oat_abc123', 'polar_abc123', 'sk_live_abc', 'rk_test_abc']) {
    const v = validateRegistry({
      version: 1,
      skus: [{ slug: 'leak', name: 'l', status: 'live', repo: 'r', billing: { provider: 'polar', secret_env: leak } }],
    });
    assert.ok(v.errors.some(e => /RAW KEY/.test(e)), `${leak} should be caught as a raw key`);
  }
  // An env var NAME must still pass.
  const ok = validateRegistry({
    version: 1,
    skus: [{ slug: 'fine', name: 'f', status: 'live', repo: 'r', billing: { provider: 'polar', secret_env: 'WAIMD_HOUSING_POLAR_RO_KEY' } }],
  });
  assert.equal(ok.ok, true, `an env var NAME must validate: ${ok.errors.join('; ')}`);
});

test('a non-Stripe provider never reaches the Stripe API', async () => {
  // Set the env var so the ONLY thing that can stop it is the provider check.
  process.env.TEST_POLAR_RO_KEY = 'polar_oat_would_leak_if_sent';
  try {
    const r = await skuRevenue({
      slug: 'polar-sku', status: 'live',
      billing: { provider: 'polar', secret_env: 'TEST_POLAR_RO_KEY' },
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /polar revenue reader not implemented/,
      'a Polar credential must never be sent to api.stripe.com');
  } finally { delete process.env.TEST_POLAR_RO_KEY; }
});

// ── revenue math ──
test('subMonthlyCents normalizes year/week/day to monthly', () => {
  const monthly = { items: { data: [{ price: { unit_amount: 4999, recurring: { interval: 'month', interval_count: 1 } }, quantity: 1 }] } };
  const yearly = { items: { data: [{ price: { unit_amount: 120000, recurring: { interval: 'year', interval_count: 1 } }, quantity: 1 }] } };
  assert.equal(subMonthlyCents(monthly), 4999);
  assert.equal(subMonthlyCents(yearly), 10000); // 120000/12
});

test('summarize excludes trials from paying MRR but counts them as committed', () => {
  const price = { unit_amount: 4999, recurring: { interval: 'month' } };
  const subs = [
    { status: 'active', items: { data: [{ price, quantity: 1 }] } },
    { status: 'trialing', items: { data: [{ price, quantity: 1 }] } },
    { status: 'canceled', items: { data: [{ price, quantity: 1 }] } },
  ];
  const s = summarize(subs);
  assert.equal(s.subscriptions, 3);
  assert.equal(s.counts.active, 1);
  assert.equal(s.counts.trialing, 1);
  assert.equal(s.paying_mrr_usd, 49.99);          // active only
  assert.equal(s.mrr_usd, 99.98);                 // active + trial
});

// ── canary classification ──
test('assess maps probe results to OK/SLOW/DEGRADED/DOWN', () => {
  assert.equal(assess({ status: 200, latency_ms: 100 }).state, 'OK');
  assert.equal(assess({ status: 200, latency_ms: 9000 }, 3000).state, 'SLOW');
  assert.equal(assess({ status: 404, latency_ms: 50 }).state, 'DEGRADED');
  assert.equal(assess({ status: 503, latency_ms: 50 }).state, 'DOWN');
  assert.equal(assess({ error: 'timeout', latency_ms: 12000 }).state, 'DOWN');
});

// ── support triage / andon cord ──
test('triage escalates irreversible/sensitive messages to the founder', () => {
  assert.equal(triage('I want a refund please').category, 'escalate');
  assert.equal(triage('please cancel my subscription').category, 'escalate');
  assert.equal(triage('my lawyer will be in touch').category, 'escalate');
  assert.equal(triage('delete my account and all my data (GDPR)').category, 'escalate');
});

test('triage routes ordinary questions to draft and acknowledgements to info', () => {
  assert.equal(triage('how do I find my audit window?').category, 'support');
  assert.equal(triage('thanks, that worked!').category, 'info');
});

test('triage escalates charge-synonym, account-closure, and data-removal phrasings (andon-cord regression)', () => {
  assert.equal(triage('unauthorized charge on my card').category, 'escalate');
  assert.equal(triage('I was charged twice this month').category, 'escalate');
  assert.equal(triage('I want my money back').category, 'escalate');
  assert.equal(triage('please remove my data').category, 'escalate');
  assert.equal(triage('close my account').category, 'escalate');
  assert.equal(triage('terminate my account now').category, 'escalate');
});

test('subMonthlyCents skips metered/usage items (null unit_amount) instead of counting $0', () => {
  const metered = { items: { data: [{ price: { unit_amount: null, recurring: { interval: 'month' } } }] } };
  const mixed = { items: { data: [
    { price: { unit_amount: null, recurring: { interval: 'month' } } },
    { price: { unit_amount: 4999, recurring: { interval: 'month' } }, quantity: 1 },
  ] } };
  assert.equal(subMonthlyCents(metered), 0);
  assert.equal(subMonthlyCents(mixed), 4999);
});
