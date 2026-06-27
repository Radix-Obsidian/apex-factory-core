// transport.test.mjs — assert the rails, never the network. preflight is the gate that keeps the engine
// inert until warmed; parseSender feeds it the from-address. No Brevo call is made here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSender, preflight } from "./transport.mjs";

const APEX_RAIL = /must not be the apex waimd\.org/;

test("parseSender handles 'Name <email>' and bare addresses", () => {
  assert.deepEqual(parseSender("Waimd <hello@outreach.waimd.org>"), {
    name: "Waimd",
    email: "hello@outreach.waimd.org",
  });
  assert.deepEqual(parseSender("bare@example.com"), { name: "Waimd", email: "bare@example.com" });
});

test("preflight blocks the apex waimd.org from-address (DMARC p=reject)", () => {
  const fail = preflight({ name: "X", email: "blast@waimd.org" });
  assert.ok(fail.some((r) => APEX_RAIL.test(r)), "expected the apex-domain rail to block @waimd.org");
});

test("preflight allows isolated domains/subdomains (apex rail clears)", () => {
  for (const email of ["hello@itsvoco.com", "hello@outreach.waimd.org"]) {
    const fail = preflight({ name: "Waimd", email });
    assert.ok(!fail.some((r) => APEX_RAIL.test(r)), `${email} should not trip the apex rail`);
  }
});

test("preflight blocks when env rails are unset (cap/key/postal)", () => {
  // In the test process these env vars are unset → every env rail should be present.
  const fail = preflight({ name: "Waimd", email: "hello@itsvoco.com" });
  assert.ok(fail.some((r) => /WAIMD_DAILY_CAP/.test(r)));
  assert.ok(fail.some((r) => /BREVO_API_KEY/.test(r)));
  assert.ok(fail.some((r) => /WAIMD_POSTAL_ADDRESS/.test(r)));
});
