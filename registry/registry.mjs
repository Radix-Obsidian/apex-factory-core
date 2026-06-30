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
export const REPOS_FILE = path.join(HERE, 'repos.jsonl');
export const ASSETS_FILE = path.join(HERE, 'assets.jsonl');
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

// ── Repos domain: schema validation + integrity (unique `repo` key) ──
export function validateRepos(records, schema) {
  const errors = [];
  records.forEach((r, i) => errors.push(...validateAgainstSchema(r, schema, `repos[${i}]`)));
  const seen = new Map();
  records.forEach((r, i) => {
    const key = r && r.repo;
    if (key == null) return;
    if (seen.has(key)) errors.push(`repos[${i}].repo: duplicate key "${key}" (first seen at repos[${seen.get(key)}])`);
    else seen.set(key, i);
  });
  return errors;
}

// ── Assets domain: schema validation + integrity (unique `asset_id`) + referential integrity
// (`repo`, when set, must be a known repo key — the first cross-file "no dangling refs" guard). ──
export function validateAssets(records, schema, repoKeys = []) {
  const known = new Set(repoKeys);
  const errors = [];
  records.forEach((r, i) => errors.push(...validateAgainstSchema(r, schema, `assets[${i}]`)));
  const seen = new Map();
  records.forEach((r, i) => {
    const key = r && r.asset_id;
    if (key != null) {
      if (seen.has(key)) errors.push(`assets[${i}].asset_id: duplicate key "${key}" (first seen at assets[${seen.get(key)}])`);
      else seen.set(key, i);
    }
    if (r && r.repo != null && !known.has(r.repo)) {
      errors.push(`assets[${i}].repo: dangling reference "${r.repo}" — not a repo in repos.jsonl`);
    }
  });
  return errors;
}

// ── Whole-registry validation: each domain against its schema + cross-domain references. Pure. ──
export function validateAll({ repos = [], assets = [] } = {}, schemas = {}) {
  const errors = [];
  if (schemas.repo) errors.push(...validateRepos(repos, schemas.repo));
  if (schemas.asset) errors.push(...validateAssets(assets, schemas.asset, repos.map(r => r.repo)));
  return errors;
}

// ── ORG.md renderer (pure + deterministic — NO timestamps, so re-render is a no-op diff). ──
const byRepo = (a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0);
const byAssetId = (a, b) => (a.asset_id < b.asset_id ? -1 : a.asset_id > b.asset_id ? 1 : 0);
export function renderOrg({ repos = [], assets = [] } = {}) {
  const repoRows = [...repos].sort(byRepo);
  const assetRows = [...assets].sort(byAssetId);
  const L = [];
  L.push('# ORG.md — Apex company map (generated)');
  L.push('');
  L.push('> **Generated by `node registry/registry.mjs render` — do not hand-edit.**');
  L.push('> Source of truth = the JSONL files in `registry/`. Edit those, then `make org-render`.');
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
  L.push('## Coming in later slices');
  L.push('- **Marketing campaigns** (Slice 3) — channels, copy, Apollo sequences, Gamma decks.');
  L.push('- **Finance + experiments** (Slice 4) — burn vs revenue, SKU theses / hypotheses.');
  L.push('- **Google Drive mirror** (Slice 5) — this page + asset folders, phone-readable.');
  return L.join('\n') + '\n';
}

// ── CLI ──
function loadAll() {
  return {
    data: { repos: readJsonl(REPOS_FILE), assets: readJsonl(ASSETS_FILE) },
    schemas: { repo: loadSchema('repo-record.schema.json'), asset: loadSchema('asset-record.schema.json') },
  };
}
function cmdValidate() {
  const { data, schemas } = loadAll();
  const errors = validateAll(data, schemas);
  if (errors.length) {
    console.error(`✗ registry invalid (${errors.length} error(s)):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`✓ registry valid — ${data.repos.length} repo(s), ${data.assets.length} asset(s); schema + integrity + refs OK`);
}
function cmdRender(check) {
  const { data, schemas } = loadAll();
  const errors = validateAll(data, schemas);
  if (errors.length) { console.error('✗ refusing to render — registry invalid. Run `validate` first.'); process.exit(1); }
  const out = renderOrg(data);
  if (check) {
    const cur = fs.existsSync(ORG_FILE) ? fs.readFileSync(ORG_FILE, 'utf8') : '';
    if (cur !== out) { console.error('✗ ORG.md is stale — run `make org-render` and commit the result.'); process.exit(1); }
    console.log('✓ ORG.md up to date'); return;
  }
  fs.writeFileSync(ORG_FILE, out);
  console.log(`✓ rendered ORG.md (${data.repos.length} repos, ${data.assets.length} assets) → ${ORG_FILE}`);
}
function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'validate') return cmdValidate();
  if (cmd === 'render') return cmdRender(rest.includes('--check'));
  console.error('usage: registry.mjs <validate | render [--check]>'); process.exit(1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
