#!/usr/bin/env node
// ops/revenue.mjs — per-SKU revenue telemetry + portfolio P&L. Pulls live subscription state from
// each SKU's Stripe account using a READ-ONLY restricted key whose env-var NAME lives in the registry
// (never the key itself). HONEST BY CONSTRUCTION (METHOD §5): if a key isn't set we report `n/a` —
// we never fabricate a dollar we can't read. $0 in LLM terms; one bounded HTTPS read per billable SKU.
import { loadRegistry, billableSkus, findSku } from './registry.mjs';

const STRIPE = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 20000;

// ── pure core (no I/O — unit-tested) ──
// Normalize one subscription's recurring amount to monthly cents (year/week/day → month).
export function subMonthlyCents(sub) {
  let cents = 0;
  for (const it of sub?.items?.data || []) {
    const price = it.price || {};
    if (price.unit_amount == null) continue; // metered/usage-based: no fixed amount to normalize — skip, don't silently count $0
    const amt = price.unit_amount * (it.quantity || 1);
    const count = price.recurring?.interval_count || 1;
    switch (price.recurring?.interval || 'month') {
      case 'year': cents += Math.round(amt / (12 * count)); break;
      case 'week': cents += Math.round((amt * 52) / (12 * count)); break;
      case 'day': cents += Math.round((amt * 365) / (12 * count)); break;
      default: cents += Math.round(amt / count); // month
    }
  }
  return cents;
}

// Aggregate subscriptions into an honest revenue summary. Trials are NOT counted as paying.
export function summarize(subs) {
  const counts = { active: 0, trialing: 0, past_due: 0, canceled: 0, other: 0 };
  let mrrCents = 0, payingCents = 0;
  for (const s of subs) {
    const st = s.status || 'other';
    if (st in counts) counts[st]++; else counts.other++;
    const m = subMonthlyCents(s);
    if (st === 'active' || st === 'trialing' || st === 'past_due') mrrCents += m; // committed (incl. trials)
    if (st === 'active' || st === 'past_due') payingCents += m;                   // the honest dollar
  }
  return {
    subscriptions: subs.length,
    counts,
    mrr_usd: +(mrrCents / 100).toFixed(2),
    paying_mrr_usd: +(payingCents / 100).toFixed(2),
    arr_usd: +((payingCents * 12) / 100).toFixed(2),
  };
}

// ── I/O ──
async function stripeGet(key, q) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${STRIPE}${q}`, { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal });
    if (!res.ok) return { ok: false, error: `stripe ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally { clearTimeout(t); }
}

async function allSubscriptions(key) {
  const subs = [];
  let after = '';
  for (let page = 0; page < 20; page++) { // cap 2000 subs
    const q = `/subscriptions?status=all&limit=100&expand[]=data.items${after ? `&starting_after=${after}` : ''}`;
    const r = await stripeGet(key, q);
    if (!r.ok) return r;
    subs.push(...r.data.data);
    if (!r.data.has_more) break;
    after = r.data.data[r.data.data.length - 1].id;
  }
  return { ok: true, data: subs };
}

export async function skuRevenue(sku) {
  if (!sku.billing?.secret_env) return { slug: sku.slug, ok: false, reason: 'no billing configured' };
  const key = process.env[sku.billing.secret_env];
  if (!key) return { slug: sku.slug, ok: false, reason: `n/a — ${sku.billing.secret_env} not set` };
  const r = await allSubscriptions(key);
  if (!r.ok) return { slug: sku.slug, ok: false, reason: r.error };
  const mode = sku.billing.mode || (/^(sk|rk)_live_/.test(key) ? 'live' : 'test');
  return { slug: sku.slug, ok: true, mode, ...summarize(r.data) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const slug = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
  const reg = loadRegistry();
  const targets = slug ? [findSku(reg, slug)].filter(Boolean) : billableSkus(reg);
  if (!targets.length) { console.log(slug ? `no billable SKU: ${slug}` : 'no billable SKUs in registry'); process.exit(0); }
  const rows = [];
  for (const s of targets) rows.push(await skuRevenue(s));
  if (json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  console.log('— PORTFOLIO REVENUE (Stripe, read-only) —');
  let totalPaying = 0;
  for (const r of rows) {
    if (!r.ok) { console.log(`  ${r.slug.padEnd(16)} ${r.reason}`); continue; }
    totalPaying += r.paying_mrr_usd;
    console.log(`  ${r.slug.padEnd(16)} [${r.mode}] paying MRR $${r.paying_mrr_usd} · committed $${r.mrr_usd} · subs ${r.subscriptions} (active ${r.counts.active}, trial ${r.counts.trialing}, past_due ${r.counts.past_due})`);
  }
  console.log(`  ─────────────`);
  console.log(`  TOTAL paying MRR: $${totalPaying.toFixed(2)}`);
}
