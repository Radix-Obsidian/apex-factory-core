// sync-engagement.test.mjs — the "stop if clicked" feed: it must cleanly no-op when unconfigured, and
// mark the right leads (by USDOT or email, case-insensitive) when given a funnel payload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncEngagement, applyEngagement } from "./sync-engagement.mjs";

test("syncEngagement no-ops without URL+token", async () => {
  assert.deepEqual(await syncEngagement({}), { skipped: true });
  assert.deepEqual(await syncEngagement({ WAIMD_ENGAGEMENT_URL: "https://x" }), { skipped: true });
});

test("applyEngagement marks leads by USDOT and by email (case-insensitive)", () => {
  const enrolled = { seqStep: 1, seqSentAt: { 1: "2026-06-20T00:00:00Z" } };
  const store = new Map([
    ["111", { dotNumber: "111", email: "a@x.com", ...enrolled }],
    ["222", { dotNumber: "222", email: "b@x.com", ...enrolled }],
  ]);
  const marked = applyEngagement(store, [{ dot: "111" }, { email: "B@x.com" }], "2026-06-27T00:00:00Z");
  assert.equal(marked, 2);
  assert.ok(store.get("111").engaged && store.get("111").seqDone);
  assert.equal(store.get("222").seqStopReason, "engaged");
});

test("applyEngagement ignores unknown + already-engaged leads", () => {
  const store = new Map([["111", { dotNumber: "111", email: "a@x.com", engaged: true }]]);
  assert.equal(applyEngagement(store, [{ dot: "999" }, { dot: "111" }], "2026-06-27T00:00:00Z"), 0);
});
