// tests/posture.test.mjs — the posture switch must be able to TIGHTEN everything and LOOSEN almost
// nothing (D31). $0, no network, pure functions.
//
// The property under test is the one that makes the feature safe rather than dangerous: `dangerous`
// must not be a master switch. If someone can reach for it at 2am and silence the money, secret or
// never-lie gates, the switch is a liability — so every inviolable guard is asserted individually.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_POSTURE,
  INVIOLABLE,
  POSTURES,
  RELAXABLE,
  applyPosture,
  mayRelax,
  postureBanner,
  resolvePosture,
} from '../ops/posture.mjs';

const result = (fails = [], warns = []) => ({ fails, warns });

describe('resolution (fails safe, never to dangerous)', () => {
  test('the default is auto', () => {
    assert.equal(resolvePosture({}), 'auto');
    assert.equal(DEFAULT_POSTURE, 'auto');
  });

  test('valid postures resolve, case-insensitively and trimmed', () => {
    for (const p of POSTURES) {
      assert.equal(resolvePosture({ FACTORY_POSTURE: p }), p);
      assert.equal(resolvePosture({ FACTORY_POSTURE: `  ${p.toUpperCase()} ` }), p);
    }
  });

  test('anything unrecognised falls back to auto — NEVER to dangerous', () => {
    for (const bad of ['', '   ', 'yolo', 'off', 'none', 'DANGER', '1', undefined, null]) {
      const got = resolvePosture({ FACTORY_POSTURE: bad });
      assert.equal(got, 'auto', `${JSON.stringify(bad)} must fall back to auto, got ${got}`);
      assert.notEqual(got, 'dangerous');
    }
    assert.equal(resolvePosture(undefined), 'auto');
  });
});

describe('what may be relaxed', () => {
  test('every INVIOLABLE guard refuses relaxation', () => {
    for (const g of INVIOLABLE) assert.equal(mayRelax(g), false, `${g} must never be relaxable`);
  });

  test('the never-lie, money and secret gates are inviolable by name', () => {
    // Named explicitly so removing one from the set fails a test rather than silently widening it.
    for (const g of ['honesty', 'publish-gate', 'deploy-guard', 'secret-detection', 'kill-guard',
      'retired-provider', 'model-guard'])
      assert.ok(INVIOLABLE.has(g), `${g} must be in INVIOLABLE`);
  });

  test('an UNKNOWN guard is treated as inviolable (fail-closed)', () => {
    assert.equal(mayRelax('some-future-guard'), false);
    assert.equal(mayRelax(''), false);
    assert.equal(mayRelax(undefined), false);
  });

  test('only taste-level guards are relaxable', () => {
    for (const g of RELAXABLE) assert.equal(mayRelax(g), true);
    assert.equal(RELAXABLE.has('honesty'), false, 'honesty must never be listed as relaxable');
  });
});

describe('applying the posture', () => {
  test('auto preserves today\'s behaviour: fails block, warns warn', () => {
    const r = applyPosture('copywriter', result(['bad copy'], ['weak framing']), 'auto');
    assert.deepEqual(r.fails, ['bad copy']);
    assert.deepEqual(r.warns, ['weak framing']);
    assert.equal(r.blocked, true);
    assert.equal(r.relaxed, false);
  });

  test('strict promotes warnings to blocks', () => {
    const r = applyPosture('copywriter', result([], ['weak framing']), 'strict');
    assert.equal(r.blocked, true);
    assert.deepEqual(r.fails, ['weak framing']);
    assert.deepEqual(r.warns, []);
    assert.equal(r.promoted, true);
  });

  test('strict tightens INVIOLABLE guards too — tightening is always allowed', () => {
    const r = applyPosture('honesty', result([], ['soft doubt']), 'strict');
    assert.equal(r.blocked, true);
    assert.deepEqual(r.fails, ['soft doubt']);
  });

  test('dangerous degrades a RELAXABLE failure to a warning', () => {
    const r = applyPosture('copywriter', result(['generic phrase'], []), 'dangerous');
    assert.equal(r.blocked, false);
    assert.equal(r.relaxed, true);
    assert.deepEqual(r.fails, []);
    assert.ok(r.warns.includes('generic phrase'), 'the failure must still be surfaced, not swallowed');
  });

  test('dangerous CANNOT soften any inviolable guard', () => {
    for (const g of INVIOLABLE) {
      const r = applyPosture(g, result(['fabricated proof'], []), 'dangerous');
      assert.equal(r.blocked, true, `${g} must still block under posture=dangerous`);
      assert.deepEqual(r.fails, ['fabricated proof']);
      assert.equal(r.relaxed, false);
    }
  });

  test('dangerous cannot soften an unknown guard either', () => {
    const r = applyPosture('brand-new-guard', result(['boom'], []), 'dangerous');
    assert.equal(r.blocked, true);
  });

  test('a bogus posture value behaves as auto, not as dangerous', () => {
    const r = applyPosture('copywriter', result(['generic phrase'], []), 'yolo');
    assert.equal(r.blocked, true, 'an unrecognised posture must not relax anything');
  });

  test('a clean result never blocks in any posture', () => {
    for (const p of POSTURES)
      for (const g of ['copywriter', 'honesty'])
        assert.equal(applyPosture(g, result([], []), p).blocked, false);
  });

  test('the input result object is not mutated', () => {
    const input = result(['f'], ['w']);
    applyPosture('copywriter', input, 'dangerous');
    assert.deepEqual(input.fails, ['f'], 'applyPosture must be pure');
    assert.deepEqual(input.warns, ['w']);
  });
});

describe('operator visibility', () => {
  test('a non-default posture always announces itself', () => {
    assert.equal(postureBanner('auto'), null);
    assert.match(postureBanner('strict'), /STRICT/);
    const d = postureBanner('dangerous');
    assert.match(d, /DANGEROUS/);
    assert.match(d, /honesty/i, 'the dangerous banner must state what it does NOT relax');
  });
});
