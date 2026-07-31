#!/usr/bin/env node
// ops/registry.mjs — the SKU portfolio registry: the object the post-launch loop iterates (D20).
// The factory's PRE-launch loop SHIPS a SKU; this registry is what lets the agents then OPERATE it
// (health, revenue, support). Pure loader + a deterministic structural validator (no schema lib, $0)
// + a tiny CLI. Never writes, never charges.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = path.join(HERE, '..', 'skus', 'registry.json');

// Load factory-core/.env so every ops CLI sees env-configured values (e.g. DOTNAV_STRIPE_RO_KEY) no
// matter how it's invoked — `make`, a direct `node ops/*.mjs`, or the heartbeat (which already exports
// them; loadEnvFile never overrides an already-set var). A missing or unparseable .env is non-fatal:
// revenue/etc. simply degrade to n/a. (registry.mjs is imported by every ops module, so this runs once.)
try { process.loadEnvFile?.(path.join(HERE, '..', '.env')); } catch { /* no/odd .env — ops degrade to n/a */ }

const STATUSES = new Set(['staged', 'live', 'paused', 'killed']);

// Providers that move real money. Each one MUST name a read-only key env var (never the key itself).
// Adding a provider here is what makes the secret_env requirement apply to it — D27 added `polar`
// after the founder moved off Stripe; a hardcoded 'stripe' check would have silently exempted it.
export const PAID_PROVIDERS = new Set(['stripe', 'polar']);

// Provider-agnostic raw-key shapes. secret_env holds a NAME; if it looks like an actual credential
// from ANY provider we reject it, so a paste-in never reaches git. Stripe: sk_/rk_/pk_ live|test.
// Polar: polar_oat_ (organization access token) / polar_. GitHub: ghp_/gho_/ghs_/ghu_/ghr_.
//
// Deliberately CASE-SENSITIVE: real credentials carry lowercase prefixes, while env var NAMES are
// UPPER_SNAKE_CASE. Without that distinction the guard flags its own env var (WAIMD_HOUSING_POLAR_RO_KEY
// contains "POLAR_RO") and rejects a perfectly valid registry entry.
export const RAW_KEY_SHAPE = /((sk|rk|pk)_(live|test)_[A-Za-z0-9]|polar_(oat_)?[a-z0-9]{4,}|gh[pousr]_[A-Za-z0-9]{8,})/;

export function loadRegistry(p = REGISTRY_PATH) {
  const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!reg || !Array.isArray(reg.skus)) throw new Error('registry: missing skus[]');
  return reg;
}

// Structural validation — a subset of skus/schema/sku.schema.json, enforced without a dep. {ok, errors[]}.
export function validateRegistry(reg) {
  const errors = [];
  const slugs = new Set();
  if (!reg || !Array.isArray(reg.skus)) return { ok: false, errors: ['registry: missing skus[]'] };
  for (const [i, s] of reg.skus.entries()) {
    const at = `skus[${i}]${s?.slug ? ` (${s.slug})` : ''}`;
    if (!s.slug || !/^[a-z0-9-]+$/.test(s.slug)) errors.push(`${at}: slug must be kebab-case`);
    if (slugs.has(s.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(s.slug);
    if (!s.name) errors.push(`${at}: missing name`);
    if (!STATUSES.has(s.status)) errors.push(`${at}: status must be one of ${[...STATUSES].join('|')}`);
    if (!s.repo) errors.push(`${at}: missing repo`);
    const b = s.billing;
    if (b && PAID_PROVIDERS.has(b.provider) && !b.secret_env) errors.push(`${at}: ${b.provider} billing requires secret_env (env var NAME)`);
    if (b && b.secret_env && RAW_KEY_SHAPE.test(b.secret_env)) errors.push(`${at}: secret_env looks like a RAW KEY — it must be an env var NAME, never the key`);
  }
  return { ok: errors.length === 0, errors };
}

// Selectors used across the ops modules.
export const liveSkus = reg => reg.skus.filter(s => s.status === 'live' || s.status === 'staged');
export const billableSkus = reg => reg.skus.filter(s => s.billing && s.billing.secret_env && s.status !== 'killed');
export const findSku = (reg, slug) => reg.skus.find(s => s.slug === slug) || null;

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] || 'list';
  const json = process.argv.includes('--json');
  const reg = loadRegistry();
  if (cmd === 'validate') {
    const v = validateRegistry(reg);
    if (json) { console.log(JSON.stringify(v, null, 2)); process.exit(v.ok ? 0 : 1); }
    console.log(v.ok ? `── registry VALID (${reg.skus.length} SKUs) ──` : 'registry INVALID:');
    for (const e of v.errors) console.log(`  ✗ ${e}`);
    process.exit(v.ok ? 0 : 1);
  }
  if (cmd === 'show') {
    const s = findSku(reg, process.argv[3]);
    if (!s) { console.error(`no SKU: ${process.argv[3]}`); process.exit(1); }
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }
  // list (default)
  if (json) { console.log(JSON.stringify(reg, null, 2)); process.exit(0); }
  console.log(`— SKU PORTFOLIO (${reg.skus.length}) —`);
  for (const s of reg.skus) {
    const pend = s.pending_founder_actions?.length ? ` · ⚠ ${s.pending_founder_actions.length} founder action(s)` : '';
    console.log(`  ${s.status.padEnd(6)} ${s.slug.padEnd(16)} ${s.live_url || '(no url)'}${pend}`);
  }
}
