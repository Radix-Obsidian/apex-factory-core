#!/usr/bin/env node
// ops/canary.mjs — uptime/health probe for each deployed SKU. One bounded HTTPS GET per SKU that has
// a live_url; reports status + latency and flags DOWN / DEGRADED / SLOW. $0, never hangs (AbortController
// timeout). The deterministic eyes the post-launch loop watches each live SKU with. Exits non-zero if
// any SKU is DOWN/DEGRADED so it can gate a cron.
import { loadRegistry, liveSkus, findSku } from './registry.mjs';

const TIMEOUT_MS = 12000;
const SLOW_MS = 3000;

// pure: classify a probe result. 5xx/timeout = DOWN; 4xx = DEGRADED; slow = SLOW; else OK.
export function assess(probe, slowMs = SLOW_MS) {
  if (probe.error) return { state: 'DOWN', note: probe.error };
  const s = probe.status;
  if (s >= 500) return { state: 'DOWN', note: `status ${s}` };
  if (s >= 400) return { state: 'DEGRADED', note: `status ${s}` };
  if (probe.latency_ms > slowMs) return { state: 'SLOW', note: `${probe.latency_ms}ms (status ${s})` };
  return { state: 'OK', note: `${probe.latency_ms}ms (status ${s})` };
}

async function probe(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'apex-canary/1' } });
    return { status: res.status, latency_ms: Date.now() - start };
  } catch (e) {
    return { error: String(e?.message || e), latency_ms: Date.now() - start };
  } finally { clearTimeout(t); }
}

export async function probeSku(sku) {
  if (!sku.live_url) return { state: 'NO_URL', note: 'no live_url in registry' };
  const url = sku.live_url.replace(/\/$/, '') + (sku.health?.path || '/');
  const p = await probe(url);
  return { url, ...p, ...assess(p, sku.health?.slow_ms || SLOW_MS) };
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const slug = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
  const reg = loadRegistry();
  const skus = slug ? [findSku(reg, slug)].filter(Boolean) : liveSkus(reg);
  const out = [];
  for (const s of skus) out.push({ slug: s.slug, ...(await probeSku(s)) });
  if (json) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
  console.log('— CANARY (per-SKU health) —');
  for (const r of out) console.log(`  ${r.slug.padEnd(16)} ${String(r.state).padEnd(9)} ${r.note}  ${r.url || ''}`);
  const bad = out.filter(r => r.state === 'DOWN' || r.state === 'DEGRADED');
  process.exit(bad.length ? 1 : 0);
}
