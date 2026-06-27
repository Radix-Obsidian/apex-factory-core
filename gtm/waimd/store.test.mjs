// store.test.mjs — the step-1 selector that drains the backlog: queued + reachable + not suppressed,
// ordered most-urgent (soonest audit) first, which also sends the oldest carriers first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { queuedForSend } from "./store.mjs";

test("queuedForSend: queued+reachable only, most-urgent first, excludes sent/no-email/suppressed", () => {
  const store = new Map([
    ["1", { dotNumber: "1", email: "a@x.com", status: "queued", auditDueDate: "2026-08-01" }],
    ["2", { dotNumber: "2", email: "b@x.com", status: "queued", auditDueDate: "2026-07-01" }], // sooner → first
    ["3", { dotNumber: "3", email: "c@x.com", status: "sent", auditDueDate: "2026-06-01" }], // sent → out
    ["4", { dotNumber: "4", email: null, status: "queued", auditDueDate: "2026-06-15" }], // no email → out
    ["5", { dotNumber: "5", email: "e@x.com", status: "queued", auditDueDate: "2026-06-20" }], // suppressed → out
  ]);
  const suppression = new Set(["e@x.com"]);
  const out = queuedForSend(store, suppression);
  assert.deepEqual(out.map((l) => l.dotNumber), ["2", "1"]);
});

test("queuedForSend: empty store → empty list", () => {
  assert.deepEqual(queuedForSend(new Map(), new Set()), []);
});
