#!/usr/bin/env node
// registry.mjs — the Org Operating System's deterministic floor (Slice 1: repos).
// NO LLM. The trustworthy layer the org map stands on: a JSON-Schema-subset validator, the
// per-domain integrity checks, the JSONL readers, and the ORG.md renderer. Everything here is a
// pure function or a local file read — never deletes, never charges, never builds.
//
// Source of truth = the JSONL files in this dir (registry/*.jsonl). ORG.md is GENERATED from
// them by `render` and must never be hand-edited. Later slices add domains (assets, campaigns,
// finance, experiments) by dropping in a schema + a *.jsonl + a render section — the engine
// below (validator, readers, CLI) is reused unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(HERE, 'schemas');
export const SKUS_FILE = path.join(HERE, 'skus.jsonl');
export const REPOS_FILE = path.join(HERE, 'repos.jsonl');
export const ASSETS_FILE = path.join(HERE, 'assets.jsonl');
export const CAMPAIGNS_FILE = path.join(HERE, 'campaigns.jsonl');
export const FINANCE_FILE = path.join(HERE, 'finance.jsonl');
export const EXPERIMENTS_FILE = path.join(HERE, 'experiments.jsonl');
// The salvage queue lives at the control-plane root (written by recycled/recycled-scan.mjs).
export const RECYCLED_CANDIDATES_FILE = path.join(HERE, '..', 'recycled-candidates.jsonl');
// Drive mirror pointers (written by the agent's Slice-5 sync, read here to link ORG.md). Optional.
export const DRIVE_FILE = path.join(HERE, 'drive.json');
export const ORG_FILE = path.join(HERE, '..', 'ORG.md');

// ── JSONL + JSON helpers (mirrors recycled/recycled-scan.mjs) ──
export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
export function writeJsonl(file, records) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, (records || []).map(r => JSON.stringify(r)).join('\n') + (records?.length ? '\n' : ''));
  return file;
}
export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
export function readJson(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
export function loadSchema(name) { return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, name), 'utf8')); }

// ── Generic JSON-Schema-subset validator (pure). Supports: type (incl. arrays of types &
// integer), required, additionalProperties:false, properties (recursive), items, enum.
// Returns a flat list of human-readable error strings ([] = valid). Reused by every domain. ──
const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
function matchesType(v, type) {
  const types = Array.isArray(type) ? type : [type];
  const t = typeOf(v);
  return types.some(ty => ty === t || (ty === 'integer' && t === 'number' && Number.isInteger(v)));
}
export function validateAgainstSchema(rec, schema, p = '') {
  const at = p || '(root)';
  const errors = [];
  if (schema.type && !matchesType(rec, schema.type)) {
    errors.push(`${at}: expected type ${JSON.stringify(schema.type)}, got ${typeOf(rec)}`);
    return errors; // type is wrong — deeper checks would be noise
  }
  if (schema.enum && !schema.enum.includes(rec)) {
    errors.push(`${at}: ${JSON.stringify(rec)} not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (typeOf(rec) === 'object' && (schema.type === 'object' || schema.properties)) {
    const props = schema.properties || {};
    for (const req of schema.required || []) {
      if (!(req in rec)) errors.push(`${p ? p + '.' : ''}${req}: required field missing`);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(rec)) {
        if (!(k in props)) errors.push(`${p ? p + '.' : ''}${k}: unexpected field (additionalProperties:false)`);
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (k in rec) errors.push(...validateAgainstSchema(rec[k], sub, p ? `${p}.${k}` : k));
    }
  }
  if (typeOf(rec) === 'array' && schema.items) {
    rec.forEach((item, i) => errors.push(...validateAgainstSchema(item, schema.items, `${p}[${i}]`)));
  }
  return errors;
}

// ── Per-domain integrity helpers (shared across domains — each new domain is a few lines). ──
function checkSchema(records, schema, label) {
  const errors = [];
  records.forEach((r, i) => errors.push(...validateAgainstSchema(r, schema, `${label}[${i}]`)));
  return errors;
}
function checkUniqueKey(records, label, idField) {
  const errors = [], seen = new Map();
  records.forEach((r, i) => {
    const key = r && r[idField];
    if (key == null) return;
    if (seen.has(key)) errors.push(`${label}[${i}].${idField}: duplicate key "${key}" (first seen at ${label}[${seen.get(key)}])`);
    else seen.set(key, i);
  });
  return errors;
}
// Referential integrity (generic): a record's `field`, when set, must be a known key — else a
// dangling reference. Reused for repo FKs and the experiment→recycled-candidate link.
function checkForeignKey(records, label, field, knownKeys, targetName) {
  const known = new Set(knownKeys), errors = [];
  records.forEach((r, i) => {
    const v = r && r[field];
    if (v != null && !known.has(v)) errors.push(`${label}[${i}].${field}: dangling reference "${v}" — not found in ${targetName}`);
  });
  return errors;
}

// ── SKUs domain (the product spine): schema + unique `sku_id` + repo FK ──
export function validateSkus(records, schema, repoKeys = []) {
  return [...checkSchema(records, schema, 'skus'), ...checkUniqueKey(records, 'skus', 'sku_id'),
    ...checkForeignKey(records, 'skus', 'repo', repoKeys, 'repos.jsonl')];
}
// ── Repos domain: schema + unique `repo` key + sku FK ──
export function validateRepos(records, schema, skuIds = []) {
  return [...checkSchema(records, schema, 'repos'), ...checkUniqueKey(records, 'repos', 'repo'),
    ...checkForeignKey(records, 'repos', 'sku', skuIds, 'skus.jsonl')];
}
// ── Assets domain: schema + unique `asset_id` + repo FK + sku FK ──
export function validateAssets(records, schema, repoKeys = [], skuIds = []) {
  return [...checkSchema(records, schema, 'assets'), ...checkUniqueKey(records, 'assets', 'asset_id'),
    ...checkForeignKey(records, 'assets', 'repo', repoKeys, 'repos.jsonl'),
    ...checkForeignKey(records, 'assets', 'sku', skuIds, 'skus.jsonl')];
}
// ── Campaigns domain: schema + unique `campaign_id` + repo FK + sku FK ──
export function validateCampaigns(records, schema, repoKeys = [], skuIds = []) {
  return [...checkSchema(records, schema, 'campaigns'), ...checkUniqueKey(records, 'campaigns', 'campaign_id'),
    ...checkForeignKey(records, 'campaigns', 'repo', repoKeys, 'repos.jsonl'),
    ...checkForeignKey(records, 'campaigns', 'sku', skuIds, 'skus.jsonl')];
}
// ── Finance domain: schema + unique `snapshot_id` (company-level; no FK) ──
export function validateFinance(records, schema) {
  return [...checkSchema(records, schema, 'finance'), ...checkUniqueKey(records, 'finance', 'snapshot_id')];
}
// ── Experiments domain: schema + unique `experiment_id` + repo FK + sku FK + candidate_ref FK into
// the existing recycled-candidates queue (ties the org index to the salvage harness). ──
export function validateExperiments(records, schema, repoKeys = [], skuIds = [], candidateIds = []) {
  return [...checkSchema(records, schema, 'experiments'), ...checkUniqueKey(records, 'experiments', 'experiment_id'),
    ...checkForeignKey(records, 'experiments', 'repo', repoKeys, 'repos.jsonl'),
    ...checkForeignKey(records, 'experiments', 'sku', skuIds, 'skus.jsonl'),
    ...checkForeignKey(records, 'experiments', 'candidate_ref', candidateIds, 'recycled-candidates.jsonl')];
}

// ── Whole-registry validation: each domain against its schema + cross-domain references. Pure.
// SKUs are the spine: every domain's `sku` must resolve to a known sku_id (no orphan products). ──
export function validateAll({ repos = [], assets = [], campaigns = [], finance = [], experiments = [], skus = [] } = {}, schemas = {}, candidateIds = []) {
  const errors = [], repoKeys = repos.map(r => r.repo), skuIds = skus.map(s => s.sku_id);
  if (schemas.sku) errors.push(...validateSkus(skus, schemas.sku, repoKeys));
  if (schemas.repo) errors.push(...validateRepos(repos, schemas.repo, skuIds));
  if (schemas.asset) errors.push(...validateAssets(assets, schemas.asset, repoKeys, skuIds));
  if (schemas.campaign) errors.push(...validateCampaigns(campaigns, schemas.campaign, repoKeys, skuIds));
  if (schemas.finance) errors.push(...validateFinance(finance, schemas.finance));
  if (schemas.experiment) errors.push(...validateExperiments(experiments, schemas.experiment, repoKeys, skuIds, candidateIds));
  return errors;
}

// ── ORG.md renderer (pure + deterministic — NO timestamps, so re-render is a no-op diff). ──
const byRepo = (a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0);
const byAssetId = (a, b) => (a.asset_id < b.asset_id ? -1 : a.asset_id > b.asset_id ? 1 : 0);
const byCampaignId = (a, b) => (a.campaign_id < b.campaign_id ? -1 : a.campaign_id > b.campaign_id ? 1 : 0);
const bySnapshotId = (a, b) => (a.snapshot_id < b.snapshot_id ? -1 : a.snapshot_id > b.snapshot_id ? 1 : 0);
const byExperimentId = (a, b) => (a.experiment_id < b.experiment_id ? -1 : a.experiment_id > b.experiment_id ? 1 : 0);
const usd = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US')}`);
const bySkuId = (a, b) => (a.sku_id < b.sku_id ? -1 : a.sku_id > b.sku_id ? 1 : 0);
export function renderOrg({ repos = [], assets = [], campaigns = [], finance = [], experiments = [], skus = [], drive = null } = {}) {
  const repoRows = [...repos].sort(byRepo);
  const assetRows = [...assets].sort(byAssetId);
  const campaignRows = [...campaigns].sort(byCampaignId);
  const financeRows = [...finance].sort(bySnapshotId);
  const experimentRows = [...experiments].sort(byExperimentId);
  const skuRows = [...skus].sort(bySkuId);
  const L = [];
  L.push('# ORG.md — Apex company map (generated)');
  L.push('');
  L.push('> **Generated by `node registry/registry.mjs render` — do not hand-edit.**');
  L.push('> Source of truth = the JSONL files in `registry/`. Edit those, then `make org-render`.');
  if (drive && drive.org_doc_url) {
    L.push(`> 📁 **Phone-readable Google Drive mirror:** [ORG doc](${drive.org_doc_url}) · [folder](${drive.folder_url})`);
  }
  L.push('');
  L.push('## SKUs (the product spine)');
  L.push('');
  L.push('| SKU | Name | Status | Repo | Stripe | Launch target |');
  L.push('|-----|------|--------|------|--------|---------------|');
  for (const s of skuRows) {
    L.push(`| \`${s.sku_id}\` | ${s.name} | ${s.status} | ${s.repo ? '`' + s.repo + '`' : '—'} | ${s.stripe_mode || 'none'} | ${s.launch_target || '—'} |`);
  }
  L.push('');
  L.push(`_SKUs tracked: ${skuRows.length}._`);
  L.push('');
  L.push('## Repos');
  L.push('');
  L.push('| Repo | Role | Status | Stripe | Deploy | SKU | URL |');
  L.push('|------|------|--------|--------|--------|-----|-----|');
  for (const r of repoRows) {
    L.push(`| \`${r.repo}\` | ${r.role} | ${r.status} | ${r.stripe_mode || 'none'} | ${r.deploy_target || 'none'} | ${r.sku || '—'} | ${r.url} |`);
  }
  L.push('');
  L.push(`_Repos tracked: ${repoRows.length}._`);
  L.push('');
  L.push('## Assets');
  L.push('');
  L.push('| Asset | Kind | Status | Repo | SKU | Location |');
  L.push('|-------|------|--------|------|-----|----------|');
  for (const a of assetRows) {
    L.push(`| ${a.name} | ${a.kind} | ${a.status} | ${a.repo ? '`' + a.repo + '`' : '—'} | ${a.sku || '—'} | ${a.location} |`);
  }
  L.push('');
  L.push(`_Assets tracked: ${assetRows.length}._`);
  L.push('');
  L.push('## Marketing campaigns');
  L.push('');
  L.push('| Campaign | Channel | Status | SKU | Repo | Result |');
  L.push('|----------|---------|--------|-----|------|--------|');
  for (const c of campaignRows) {
    L.push(`| ${c.name} | ${c.channel} | ${c.status} | ${c.sku || '—'} | ${c.repo ? '`' + c.repo + '`' : '—'} | ${c.result || '—'} |`);
  }
  L.push('');
  L.push(`_Campaigns tracked: ${campaignRows.length}._`);
  L.push('');
  L.push('## Finance (Stripe revenue is the only scoreboard)');
  L.push('');
  L.push('| Period | Stripe revenue | Anthropic spend (proxy) | Higgsfield credits | Net | Notes |');
  L.push('|--------|----------------|-------------------------|--------------------|-----|-------|');
  for (const f of financeRows) {
    L.push(`| ${f.period} | ${usd(f.stripe_revenue_usd)} | ${usd(f.anthropic_spend_proxy_usd)} | ${f.higgsfield_credits == null ? '—' : f.higgsfield_credits} | ${usd(f.net_usd)} | ${f.notes || '—'} |`);
  }
  L.push('');
  L.push('## Experiments (SKU theses / hypotheses)');
  L.push('');
  L.push('| Experiment | Status | SKU | Hypothesis | Metric | Candidate |');
  L.push('|------------|--------|-----|------------|--------|-----------|');
  for (const e of experimentRows) {
    L.push(`| \`${e.experiment_id}\` | ${e.status} | ${e.sku || '—'} | ${e.hypothesis} | ${e.metric || '—'} | ${e.candidate_ref || '—'} |`);
  }
  L.push('');
  L.push(`_Experiments tracked: ${experimentRows.length}._`);
  // Per-SKU rollup: everything belonging to each product, in one glance. The spine in action.
  L.push('');
  L.push('## Per-SKU view');
  const named = (xs, f) => xs.map(f).join(', ') || '—';
  for (const s of skuRows) {
    L.push('');
    L.push(`### \`${s.sku_id}\` — ${s.name} · ${s.status}`);
    if (s.thesis) L.push(`_${s.thesis}_`);
    L.push(`- **Repo:** ${named(repoRows.filter(r => r.sku === s.sku_id), r => '`' + r.repo + '`')}`);
    L.push(`- **Assets:** ${named(assetRows.filter(a => a.sku === s.sku_id), a => a.name)}`);
    L.push(`- **Campaigns:** ${named(campaignRows.filter(c => c.sku === s.sku_id), c => c.name)}`);
    L.push(`- **Experiments:** ${named(experimentRows.filter(e => e.sku === s.sku_id), e => '`' + e.experiment_id + '`')}`);
    if (s.drive_folder) L.push(`- **Drive:** [folder](${s.drive_folder})`);
  }
  return L.join('\n') + '\n';
}

// ── CLI ──
function loadAll() {
  return {
    data: {
      skus: readJsonl(SKUS_FILE),
      repos: readJsonl(REPOS_FILE), assets: readJsonl(ASSETS_FILE), campaigns: readJsonl(CAMPAIGNS_FILE),
      finance: readJsonl(FINANCE_FILE), experiments: readJsonl(EXPERIMENTS_FILE), drive: readJson(DRIVE_FILE),
    },
    schemas: {
      sku: loadSchema('sku-record.schema.json'),
      repo: loadSchema('repo-record.schema.json'),
      asset: loadSchema('asset-record.schema.json'),
      campaign: loadSchema('campaign-record.schema.json'),
      finance: loadSchema('finance-snapshot.schema.json'),
      experiment: loadSchema('experiment-record.schema.json'),
    },
    candidateIds: readJsonl(RECYCLED_CANDIDATES_FILE).map(c => c.spec_id).filter(Boolean),
  };
}
function cmdValidate() {
  const { data, schemas, candidateIds } = loadAll();
  const errors = validateAll(data, schemas, candidateIds);
  if (errors.length) {
    console.error(`✗ registry invalid (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  const d = data;
  console.log(`✓ registry valid — ${d.skus.length} SKU(s), ${d.repos.length} repo(s), ${d.assets.length} asset(s), ${d.campaigns.length} campaign(s), ${d.finance.length} finance, ${d.experiments.length} experiment(s); schema + integrity + refs OK`);
}
function cmdRender(check) {
  const { data, schemas, candidateIds } = loadAll();
  const errors = validateAll(data, schemas, candidateIds);
  if (errors.length) { console.error('✗ refusing to render — registry invalid. Run `validate` first.'); process.exit(1); }
  const out = renderOrg(data);
  if (check) {
    const cur = fs.existsSync(ORG_FILE) ? fs.readFileSync(ORG_FILE, 'utf8') : '';
    if (cur !== out) { console.error('✗ ORG.md is stale — run `make org-render` and commit the result.'); process.exit(1); }
    console.log('✓ ORG.md up to date'); return;
  }
  fs.writeFileSync(ORG_FILE, out);
  console.log(`✓ rendered ORG.md (${data.skus.length} SKUs, ${data.repos.length} repos, ${data.assets.length} assets, ${data.campaigns.length} campaigns, ${data.finance.length} finance, ${data.experiments.length} experiments) → ${ORG_FILE}`);
}
function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'validate') return cmdValidate();
  if (cmd === 'render') return cmdRender(rest.includes('--check'));
  console.error('usage: registry.mjs <validate | render [--check]>'); process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
