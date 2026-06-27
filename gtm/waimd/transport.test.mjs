// transport.test.mjs — assert the rails, never the network. preflight is the gate that keeps the engine
// inert until warmed; parseSender feeds it the from-address. No Brevo call is made here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSender, preflight } from "./transport.mjs";

const FROM_RAIL = /from must be on outreach\.waimd\.org/;

test("parseSender handles 'Name <email>' and bare addresses", () => {
  assert.deepEqual(parseSender("Waimd <hello@outreach.waimd.org>"), {
    name: "Waimd",
    email: "hello@outreach.waimd.org",
  });
  assert.deepEqual(parseSender("bare@example.com"), { name: "Waimd", email: "bare@example.com" });
});

test("preflight flags an off-domain from-address", () => {
  const fail = preflight({ name: "X", email: "blast@gmail.com" });
  assert.ok(fail.some((r) => FROM_RAIL.test(r)), "expected the outreach.waimd.org rail to block");
});

test("preflight clears the from-domain rail for an on-domain sender", () => {
  const fail = preflight({ name: "Waimd", email: "hello@outreach.waimd.org" });
  assert.ok(!fail.some((r) => FROM_RAIL.test(r)), "on-domain from should not trip the domain rail");
});

test("preflight blocks when env rails are unset (cap/key/postal)", () => {
  // In the test process these env vars are unset → every env rail should be present.
  const fail = preflight({ name: "Waimd", email: "hello@outreach.waimd.org" });
  assert.ok(fail.some((r) => /WAIMD_DAILY_CAP/.test(r)));
  assert.ok(fail.some((r) => /BREVO_API_KEY/.test(r)));
  assert.ok(fail.some((r) => /WAIMD_POSTAL_ADDRESS/.test(r)));
});
