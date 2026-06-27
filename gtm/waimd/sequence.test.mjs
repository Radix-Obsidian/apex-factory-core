// sequence.test.mjs — the drip scheduler is pure, so this is the highest-signal coverage: it proves the
// Day 1 / 4 / 8 cadence, the "stop if engaged" branch, and idempotency without sending anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enroll, recordSent, markEngaged, nextDue, isActive } from "./sequence.mjs";

const DAY = 86_400_000;
const NOW = new Date();
// Anchored to NOW (not a fresh Date.now()) so exact-boundary "due" cases are deterministic, not flaky.
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

test("enroll stamps step 1 + enrollment time, not done", () => {
  const l = enroll({ dotNumber: "1" }, NOW.toISOString());
  assert.equal(l.seqStep, 1);
  assert.ok(l.seqSentAt[1]);
  assert.ok(l.seqEnrolledAt);
  assert.ok(!l.seqDone);
  assert.ok(isActive(l));
});

test("nextDue: step 2 waits 3 days after step 1", () => {
  assert.equal(nextDue({ seqStep: 1, seqSentAt: { 1: ago(0) } }, NOW), null);
  assert.equal(nextDue({ seqStep: 1, seqSentAt: { 1: ago(2) } }, NOW), null);
  assert.equal(nextDue({ seqStep: 1, seqSentAt: { 1: ago(3) } }, NOW), 2);
});

test("nextDue: step 3 waits 4 days after step 2", () => {
  assert.equal(nextDue({ seqStep: 2, seqSentAt: { 1: ago(7), 2: ago(3) } }, NOW), null);
  assert.equal(nextDue({ seqStep: 2, seqSentAt: { 1: ago(8), 2: ago(4) } }, NOW), 3);
});

test("nextDue: no step after 3 (completed)", () => {
  const done = recordSent({ seqStep: 2, seqSentAt: { 1: ago(8), 2: ago(4) } }, 3, ago(0));
  assert.ok(done.seqDone);
  assert.equal(done.seqStopReason, "completed");
  assert.equal(nextDue(done, NOW), null);
});

test("nextDue: engaged lead is dropped (stop if clicked)", () => {
  const engaged = markEngaged({ seqStep: 1, seqSentAt: { 1: ago(10) } }, ago(1));
  assert.ok(engaged.engaged);
  assert.equal(engaged.seqStopReason, "engaged");
  assert.equal(nextDue(engaged, NOW), null);
  assert.equal(isActive(engaged), false);
});

test("nextDue is pure + idempotent (does not mutate or advance)", () => {
  const lead = { seqStep: 1, seqSentAt: { 1: ago(3) } };
  const snapshot = JSON.stringify(lead);
  assert.equal(nextDue(lead, NOW), 2);
  assert.equal(nextDue(lead, NOW), 2); // same answer, no state change
  assert.equal(JSON.stringify(lead), snapshot);
});

test("recordSent is immutable + guards the step anchor", () => {
  const before = { seqStep: 1, seqSentAt: { 1: ago(3) } };
  const after = recordSent(before, 2, NOW.toISOString());
  assert.equal(before.seqStep, 1); // original untouched
  assert.equal(after.seqStep, 2);
  assert.ok(after.seqSentAt[2]);
});

test("not-enrolled lead is never due (enrollment is the step-1 senders' job)", () => {
  assert.equal(nextDue({ status: "queued" }, NOW), null);
  assert.equal(isActive({ status: "queued" }), false);
});
