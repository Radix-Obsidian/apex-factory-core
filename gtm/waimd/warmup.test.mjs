// warmup.test.mjs — proves the ramp schedule and the shared daily-total budget. Env is set BEFORE the
// dynamic import so config reads our test values (node --test runs each file in its own process).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.WAIMD_DAILY_CAP = "200";
process.env.WAIMD_WARMUP_START = "2026-06-01"; // ramp anchor
const { effectiveCap, sentToday, remainingToday } = await import("./warmup.mjs");

const d = (s) => new Date(`${s}T12:00:00Z`);

test("effectiveCap ramps 20→40→80→160→ceiling by week", () => {
  assert.equal(effectiveCap(d("2026-06-03")), 20); // week 0
  assert.equal(effectiveCap(d("2026-06-10")), 40); // week 1
  assert.equal(effectiveCap(d("2026-06-17")), 80); // week 2
  assert.equal(effectiveCap(d("2026-06-24")), 160); // week 3
  assert.equal(effectiveCap(d("2026-06-30")), 200); // week 4+ → full cap (ceiling)
});

test("effectiveCap is 0 before the start date", () => {
  assert.equal(effectiveCap(d("2026-05-31")), 0);
});

test("sentToday counts only today's (UTC) log entries", () => {
  const tmp = path.join(os.tmpdir(), "waimd-warmup-test-log.jsonl");
  fs.writeFileSync(
    tmp,
    [
      JSON.stringify({ ts: "2026-06-10T08:00:00Z", step: 1 }),
      JSON.stringify({ ts: "2026-06-10T09:30:00Z", step: 2 }),
      JSON.stringify({ ts: "2026-06-09T23:59:00Z", step: 1 }), // yesterday
    ].join("\n") + "\n",
  );
  assert.equal(sentToday(d("2026-06-10"), tmp), 2);
});

test("remainingToday = ramped cap minus today's sends, floored at 0", () => {
  const tmp = path.join(os.tmpdir(), "waimd-warmup-test-log2.jsonl");
  fs.writeFileSync(tmp, JSON.stringify({ ts: "2026-06-10T08:00:00Z" }) + "\n");
  assert.equal(remainingToday(d("2026-06-10"), tmp), 39); // week1 cap 40 − 1 sent
  // a log already over the cap → 0, never negative
  fs.writeFileSync(tmp, Array.from({ length: 60 }, () => JSON.stringify({ ts: "2026-06-10T08:00:00Z" })).join("\n") + "\n");
  assert.equal(remainingToday(d("2026-06-10"), tmp), 0);
});
