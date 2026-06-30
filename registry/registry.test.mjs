// registry.test.mjs — deterministic guardrail tests for the Org Operating System ($0 LLM).
// Run via `make org-verify` (node --test). The validator + render purity are the floor to trust.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAgainstSchema, validateRepos, validateAssets, validateCampaigns, validateFinance,
  validateExperiments, validateAll, renderOrg, loadSchema, readJsonl,
  REPOS_FILE, ASSETS_FILE, CAMPAIGNS_FILE, FINANCE_FILE, EXPERIMENTS_FILE, ORG_FILE } from './registry.mjs';

const repoSchema = loadSchema('repo-record.schema.json');
const assetSchema = loadSchema('asset-record.schema.json');
const campaignSchema = loadSchema('campaign-record.schema.json');
const financeSchema = loadSchema('finance-snapshot.schema.json');
const experimentSchema = loadSchema('experiment-record.schema.json');
const allSchemas = { repo: repoSchema, asset: assetSchema, campaign: campaignSchema, finance: financeSchema, experiment: experimentSchema };
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

// ── Campaigns domain: schema + integrity + repo FK ──
const validCampaign = {
  campaign_id: 'acme-launch', name: 'Acme launch', channel: 'content', status: 'PLANNED',
  sku: 'sku_009', repo: 'Acme/widget', copy_ref: null, apollo_sequence_id: null, gamma_deck_url: null,
};
test('valid campaign produces zero errors', () => {
  assert.deepEqual(validateCampaigns([validCampaign], campaignSchema, ['Acme/widget']), []);
});
test('campaign with a bad channel enum is caught', () => {
  const errs = validateCampaigns([{ ...validCampaign, channel: 'billboard' }], campaignSchema, ['Acme/widget']);
  assert.ok(errs.some(e => /channel: "billboard" not in enum/.test(e)));
});
test('campaign.repo dangling reference is caught', () => {
  const errs = validateCampaigns([validCampaign], campaignSchema, ['Acme/other']);
  assert.ok(errs.some(e => /dangling reference "Acme\/widget"/.test(e)));
});
test('validateAll covers campaigns too', () => {
  const schemas = { repo: repoSchema, asset: assetSchema, campaign: campaignSchema };
  assert.deepEqual(validateAll({ repos: [validRepo], campaigns: [validCampaign] }, schemas), []);
  const errs = validateAll({ repos: [], campaigns: [validCampaign] }, schemas);
  assert.ok(errs.some(e => /dangling reference/.test(e)));
});

// ── Finance domain: schema + unique key ──
const validFinance = { snapshot_id: '2026-06', period: '2026-06', stripe_revenue_usd: 0, anthropic_spend_proxy_usd: null, higgsfield_credits: null, net_usd: null };
test('valid finance snapshot produces zero errors', () => {
  assert.deepEqual(validateFinance([validFinance], financeSchema), []);
});
test('finance with non-number revenue is caught', () => {
  const errs = validateFinance([{ ...validFinance, stripe_revenue_usd: 'lots' }], financeSchema);
  assert.ok(errs.some(e => /stripe_revenue_usd: expected type/.test(e)));
});
test('duplicate snapshot_id is flagged', () => {
  const errs = validateFinance([validFinance, { ...validFinance }], financeSchema);
  assert.ok(errs.some(e => /duplicate key "2026-06"/.test(e)));
});

// ── Experiments domain: schema + repo FK + candidate_ref FK into recycled-candidates ──
const validExperiment = {
  experiment_id: 'exp-x', hypothesis: 'X sells.', status: 'PROPOSED', sku: 'sku_009',
  repo: 'Acme/widget', source: 'trend-discovery', candidate_ref: null, metric: 'first dollar',
};
test('valid experiment produces zero errors', () => {
  assert.deepEqual(validateExperiments([validExperiment], experimentSchema, ['Acme/widget'], []), []);
});
test('experiment.repo dangling reference is caught', () => {
  const errs = validateExperiments([validExperiment], experimentSchema, ['Acme/other'], []);
  assert.ok(errs.some(e => /repo: dangling reference "Acme\/widget"/.test(e)));
});
test('experiment.candidate_ref must exist in recycled-candidates when set', () => {
  const withRef = { ...validExperiment, candidate_ref: 'spec-123' };
  // unknown candidate → dangling
  assert.ok(validateExperiments([withRef], experimentSchema, ['Acme/widget'], []).some(e => /candidate_ref: dangling reference "spec-123"/.test(e)));
  // known candidate → clean
  assert.deepEqual(validateExperiments([withRef], experimentSchema, ['Acme/widget'], ['spec-123']), []);
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
function committedData() {
  return {
    repos: readJsonl(REPOS_FILE), assets: readJsonl(ASSETS_FILE), campaigns: readJsonl(CAMPAIGNS_FILE),
    finance: readJsonl(FINANCE_FILE), experiments: readJsonl(EXPERIMENTS_FILE),
  };
}
test('committed ORG.md exactly matches render(registry/*.jsonl)', () => {
  const expected = renderOrg(committedData());
  const actual = fs.readFileSync(ORG_FILE, 'utf8');
  assert.equal(actual, expected, 'ORG.md is stale — run `make org-render` and commit.');
});
test('committed registry is fully valid (schema + integrity + cross-refs)', () => {
  assert.deepEqual(validateAll(committedData(), allSchemas), []);
});
