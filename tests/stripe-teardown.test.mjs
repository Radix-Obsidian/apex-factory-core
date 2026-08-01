// tests/stripe-teardown.test.mjs — the teardown tool must be EVIDENCE-gated, not trust-gated (D29).
//
// $0 LLM, no network: the classification core is pure and the HTTP path takes an injected fetch, so
// every case here is deterministic. Follows the ops/ops.test.mjs convention (node:test, no deps).
//
// The property that matters: `teardown_complete` may ONLY be set by a proven revocation. A timeout, a
// 500, a scope error, or an unreachable API must never be mistaken for "the key is dead."
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EVIDENCE_GRADES,
  applyRevocation,
  classifyStatus,
  mayFlipTeardown,
  runAudit,
  runVerify,
  stripeGet,
  summarizeAudit,
  verifyVerdict,
} from '../ops/stripe-teardown.mjs';

/** A fetch stand-in that returns a fixed status/body, or throws to simulate a network failure. */
const fakeFetch = (status, body = {}) => async () => {
  if (status === 'throw') throw new Error('ECONNREFUSED');
  return { status, json: async () => body };
};

describe('classification (fail-closed)', () => {
  test('only an explicit auth rejection proves revocation', () => {
    assert.equal(classifyStatus(401), 'REVOKED');
    assert.equal(classifyStatus(200), 'STILL_LIVE');
    assert.equal(classifyStatus(403), 'UNVERIFIED');
    for (const s of [0, 429, 500, 502, 503, undefined, null]) {
      assert.equal(classifyStatus(s), 'INDETERMINATE', `HTTP ${s} must be indeterminate`);
    }
  });

  test('a 403 still proves the key AUTHENTICATED — verification treats it as live', () => {
    // Scope errors are the subtle one: the request failed, but the credential worked.
    assert.equal(verifyVerdict(403), 'STILL_LIVE');
    assert.equal(verifyVerdict(401), 'REVOKED');
    assert.equal(verifyVerdict(200), 'STILL_LIVE');
    assert.equal(verifyVerdict(500), 'INDETERMINATE');
  });

  test('ONLY a proven revocation may flip the teardown flags', () => {
    assert.equal(mayFlipTeardown('REVOKED'), true);
    for (const v of ['STILL_LIVE', 'UNVERIFIED', 'INDETERMINATE', '', undefined, 'true'])
      assert.equal(mayFlipTeardown(v), false, `${v} must not authorise a flip`);
  });
});

describe('verify against an injected fetch', () => {
  test('401 ⇒ REVOKED', async () => {
    const r = await runVerify('rk_test_x', fakeFetch(401, { error: { code: 'invalid_api_key' } }));
    assert.equal(r.verdict, 'REVOKED');
  });

  test('200 ⇒ STILL_LIVE (refuse, change nothing)', async () => {
    const r = await runVerify('rk_test_x', fakeFetch(200, { object: 'balance' }));
    assert.equal(r.verdict, 'STILL_LIVE');
    assert.equal(mayFlipTeardown(r.verdict), false);
  });

  test('a network failure is INDETERMINATE, never proof', async () => {
    const r = await runVerify('rk_test_x', fakeFetch('throw'));
    assert.equal(r.verdict, 'INDETERMINATE');
    assert.equal(mayFlipTeardown(r.verdict), false);
    assert.match(r.error ?? '', /ECONNREFUSED/);
  });

  test('a 500 is INDETERMINATE — an outage is not a revocation', async () => {
    assert.equal((await runVerify('k', fakeFetch(500))).verdict, 'INDETERMINATE');
  });

  test('stripeGet never throws and never echoes the key', async () => {
    const r = await stripeGet('rk_test_SECRET', '/balance', fakeFetch('throw'));
    assert.equal(r.status, 0);
    assert.equal(JSON.stringify(r).includes('rk_test_SECRET'), false, 'the key must never appear in output');
  });
});

describe('audit (fail-closed reporting)', () => {
  test('live items are OUTSTANDING', async () => {
    const findings = await runAudit('k', fakeFetch(200, {
      data: [{ status: 'active' }, { status: 'canceled' }],
    }));
    const subs = findings.find(f => f.key === 'subscriptions');
    assert.equal(subs.state, 'OUTSTANDING');
    assert.equal(subs.count, 1, 'only active/trialing/past_due/unpaid count');
    assert.equal(summarizeAudit(findings).clean, false);
  });

  test('an empty account reads CLEAR', async () => {
    const findings = await runAudit('k', fakeFetch(200, { data: [] }));
    assert.ok(findings.every(f => f.state === 'CLEAR'));
    assert.equal(summarizeAudit(findings).clean, true);
  });

  test('what it cannot read is UNVERIFIED — never silently clean', async () => {
    for (const status of [403, 500, 'throw', 401]) {
      const findings = await runAudit('k', fakeFetch(status));
      assert.ok(findings.every(f => f.state === 'UNVERIFIED'), `HTTP ${status} must report unverified`);
      const sum = summarizeAudit(findings);
      assert.equal(sum.clean, false, `HTTP ${status} must not read as clean`);
      assert.equal(sum.unverified, findings.length);
    }
  });

  test('unverified alone blocks "clear" even with zero outstanding items', () => {
    const sum = summarizeAudit([
      { state: 'CLEAR' }, { state: 'UNVERIFIED' },
    ]);
    assert.equal(sum.outstanding, 0);
    assert.equal(sum.clean, false, 'unproven is not the same as proven');
  });
});

describe('registry flip', () => {
  const withTempRegistry = fn => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waimd-teardown-'));
    const p = path.join(dir, 'registry.json');
    fs.writeFileSync(p, JSON.stringify({
      version: 1,
      skus: [{
        slug: 'dot-navigator', name: 'n', status: 'killed', repo: 'r',
        billing: { provider: 'stripe', mode: 'killed', secret_env: 'X_RO_KEY', revocation_status: 'PENDING_FOUNDER' },
        teardown_complete: false,
      }],
    }, null, 2));
    try { return fn(p); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };

  test('applyRevocation records evidence and completes the teardown', () => {
    withTempRegistry(p => {
      applyRevocation('dot-navigator', '2026-08-01', p, EVIDENCE_GRADES.PROVEN);
      const sku = JSON.parse(fs.readFileSync(p, 'utf8')).skus[0];
      assert.equal(sku.billing.revocation_status, 'REVOKED');
      assert.equal(sku.billing.revoked_at, '2026-08-01');
      assert.equal(sku.teardown_complete, true);
      assert.equal(sku.billing.mode, 'killed', 'the paywall stays killed');
      assert.equal(sku.billing.secret_env, 'X_RO_KEY', 'history is retained, not stripped (R7)');
    });
  });

  test('an unknown slug throws rather than silently writing nothing', () => {
    withTempRegistry(p => {
      assert.throws(() => applyRevocation('nope', '2026-08-01', p, EVIDENCE_GRADES.PROVEN), /no SKU/);
    });
  });

  test('attested and proven are recorded as DIFFERENT grades, never conflated', () => {
    withTempRegistry(p => {
      applyRevocation('dot-navigator', '2026-08-01', p, EVIDENCE_GRADES.ATTESTED);
      const sku = JSON.parse(fs.readFileSync(p, 'utf8')).skus[0];
      assert.equal(sku.billing.revocation_status, 'REVOKED_ATTESTED');
      assert.match(sku.billing.revocation_evidence, /founder attestation/);
      assert.equal(sku.teardown_complete, true, 'a deleted key still completes the teardown');
      // The label must never claim machine verification it does not have.
      assert.equal(/machine-verified/.test(sku.billing.revocation_evidence), false);
    });
  });

  test('a proven revocation says so explicitly', () => {
    withTempRegistry(p => {
      applyRevocation('dot-navigator', '2026-08-01', p, EVIDENCE_GRADES.PROVEN);
      const sku = JSON.parse(fs.readFileSync(p, 'utf8')).skus[0];
      assert.equal(sku.billing.revocation_status, 'REVOKED');
      assert.match(sku.billing.revocation_evidence, /machine-verified/);
    });
  });

  test('an unrecognised evidence grade is refused outright', () => {
    withTempRegistry(p => {
      for (const bogus of ['TOTALLY_REVOKED', 'true', '', undefined, 'PENDING_FOUNDER'])
        assert.throws(() => applyRevocation('dot-navigator', '2026-08-01', p, bogus),
          /unknown evidence grade/, `grade ${bogus} must be refused`);
      // Nothing was written by any of the refused attempts.
      assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).skus[0].teardown_complete, false);
    });
  });

  test('the shipped registry still shows the teardown as INCOMPLETE', () => {
    // Guards against anyone (me included) marking this done before it is proven.
    const reg = JSON.parse(fs.readFileSync(new URL('../skus/registry.json', import.meta.url), 'utf8'));
    const dn = reg.skus.find(s => s.slug === 'dot-navigator');
    assert.equal(dn.teardown_complete, false, 'teardown must not be marked complete without proof');
    assert.equal(dn.billing.revocation_status, 'PENDING_FOUNDER');
  });
});
