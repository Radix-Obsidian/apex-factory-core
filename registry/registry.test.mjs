// registry.test.mjs — deterministic guardrail tests for the Org Operating System ($0 LLM).
// Run via `make org-verify` (node --test). The validator + render purity are the floor to trust.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAgainstSchema, validateRepos, validateAssets, validateAll, renderOrg, loadSchema,
  readJsonl, REPOS_FILE, ASSETS_FILE, ORG_FILE } from './registry.mjs';

const repoSchema = loadSchema('repo-record.schema.json');
const assetSchema = loadSchema('asset-record.schema.json');
const validRepo = {
  repo: 'Acme/widget', role: 'sku', status: 'LIVE',
  url: 'https://github.com/Acme/widget', stripe_mode: 'test', sku: 'sku_009',
};
const validAsset = {
  asset_id: 'acme-logo', name: 'Acme logo', kind: 'logo', status: 'LIVE',
  location: 'assets/logo.svg', repo: 'Acme/widget', sku: 'sku_009', source: 'higgsfield',
};

// ── Generic validator ──
test('valid record produces zero errors', () => {
  assert.deepEqual(validateAgainstSchema(validRepo, repoSchema), []);
});
test('missing required field is caught', () => {
  const { url, ...noUrl } = validRepo;
  const errs = validateAgainstSchema(noUrl, repoSchema);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /url: required field missing/);
});
test('unexpected field is caught (additionalProperties:false)', () => {
  const errs = validateAgainstSchema({ ...validRepo, bogus: 1 }, repoSchema);
  assert.ok(errs.some(e => /bogus: unexpected field/.test(e)));
});
test('bad enum value is caught', () => {
  const errs = validateAgainstSchema({ ...validRepo, status: 'ZOMBIE' }, repoSchema);
  assert.ok(errs.some(e => /status: "ZOMBIE" not in enum/.test(e)));
});
test('wrong type is caught', () => {
  const errs = validateAgainstSchema({ ...validRepo, repo: 42 }, repoSchema);
  assert.ok(errs.some(e => /repo: expected type/.test(e)));
});
test('nullable field accepts null (sku: ["string","null"])', () => {
  assert.deepEqual(validateAgainstSchema({ ...validRepo, sku: null }, repoSchema), []);
});

// ── Integrity ──
test('duplicate repo key is flagged', () => {
  const errs = validateRepos([validRepo, { ...validRepo }], repoSchema);
  assert.ok(errs.some(e => /duplicate key "Acme\/widget"/.test(e)));
});
test('distinct repos pass integrity', () => {
  const errs = validateRepos([validRepo, { ...validRepo, repo: 'Acme/other' }], repoSchema);
  assert.deepEqual(errs, []);
});

// ── Assets domain: schema + integrity + referential (FK) ──
test('valid asset produces zero errors', () => {
  assert.deepEqual(validateAssets([validAsset], assetSchema, ['Acme/widget']), []);
});
test('asset.repo pointing at an unknown repo is a dangling reference', () => {
  const errs = validateAssets([validAsset], assetSchema, ['Acme/other']);
  assert.ok(errs.some(e => /dangling reference "Acme\/widget"/.test(e)), errs.join('; '));
});
test('asset.repo = null is allowed (not repo-bound)', () => {
  assert.deepEqual(validateAssets([{ ...validAsset, repo: null }], assetSchema, []), []);
});
test('duplicate asset_id is flagged', () => {
  const errs = validateAssets([validAsset, { ...validAsset }], assetSchema, ['Acme/widget']);
  assert.ok(errs.some(e => /duplicate key "acme-logo"/.test(e)));
});
test('validateAll wires repo keys into the asset FK check', () => {
  // asset references Acme/widget, which IS in repos → clean
  assert.deepEqual(validateAll({ repos: [validRepo], assets: [validAsset] }, { repo: repoSchema, asset: assetSchema }), []);
  // remove the repo → the asset ref dangles
  const errs = validateAll({ repos: [], assets: [validAsset] }, { repo: repoSchema, asset: assetSchema });
  assert.ok(errs.some(e => /dangling reference/.test(e)));
});

// ── Render determinism ──
test('renderOrg is deterministic + order-independent (sorted by repo)', () => {
  const a = renderOrg({ repos: [validRepo, { ...validRepo, repo: 'Acme/other' }] });
  const b = renderOrg({ repos: [{ ...validRepo, repo: 'Acme/other' }, validRepo] });
  assert.equal(a, b);                               // same data, any order → identical output
  assert.ok(a.indexOf('Acme/other') < a.indexOf('Acme/widget')); // sorted
});
test('renderOrg has no timestamp (re-render must be a no-op diff)', () => {
  const out = renderOrg({ repos: [validRepo] });
  assert.doesNotMatch(out, /\d{4}-\d{2}-\d{2}T/); // no ISO timestamps that would churn the file
});

// ── ORG.md is reproducible from committed data (criterion: render is a no-op diff) ──
test('committed ORG.md exactly matches render(registry/*.jsonl)', () => {
  const expected = renderOrg({ repos: readJsonl(REPOS_FILE), assets: readJsonl(ASSETS_FILE) });
  const actual = fs.readFileSync(ORG_FILE, 'utf8');
  assert.equal(actual, expected, 'ORG.md is stale — run `make org-render` and commit.');
});
test('committed registry is fully valid (schema + integrity + cross-refs)', () => {
  const data = { repos: readJsonl(REPOS_FILE), assets: readJsonl(ASSETS_FILE) };
  assert.deepEqual(validateAll(data, { repo: repoSchema, asset: assetSchema }), []);
});
