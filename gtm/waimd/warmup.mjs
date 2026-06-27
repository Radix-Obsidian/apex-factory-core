// warmup.mjs — the cold-send ramp + the daily-total budget. Two jobs:
//   1. effectiveCap(now): the ramped ceiling for the day (min of the weekly ramp and SEND.dailyCap).
//   2. remainingToday(now): that ceiling minus what already went out today (from the send log), so the
//      cap is a TRUE daily total shared across the step-1 sender and the follow-up runner — two separate
//      processes can't each send a full cap and double the day's volume.
// Pure except for reading the append-only send log; safe to call from any sender.

import fs from "node:fs";
import { SEND, WARMUP } from "./config.mjs";

const DAY_MS = 86_400_000;
const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;

// The ramped daily ceiling. No WAIMD_WARMUP_START → no ramp (full cap). Future start → 0 (not begun).
export function effectiveCap(now = new Date()) {
  const ceiling = SEND.dailyCap;
  if (!WARMUP.startDate) return ceiling;
  const start = Date.parse(`${WARMUP.startDate}T00:00:00Z`);
  if (Number.isNaN(start)) return ceiling;
  const days = Math.floor((now.getTime() - start) / DAY_MS);
  if (days < 0) return 0;
  const week = Math.floor(days / 7);
  const ramped = week < WARMUP.weekly.length ? WARMUP.weekly[week] : ceiling;
  return Math.min(ceiling, ramped);
}

// How many emails already went out today (UTC), counted from the send log.
export function sentToday(now = new Date(), logPath = SEND_LOG) {
  const today = now.toISOString().slice(0, 10);
  let n = 0;
  try {
    for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        if (String(JSON.parse(t).ts).slice(0, 10) === today) n++;
      } catch {
        /* skip a corrupt log line */
      }
    }
  } catch {
    /* no log yet */
  }
  return n;
}

// What this run may still send today: the ramped ceiling minus what's already gone out. 0 = nothing left
// (or sending off / ramp not begun).
export function remainingToday(now = new Date(), logPath = SEND_LOG) {
  const cap = effectiveCap(now);
  if (cap <= 0) return cap;
  return Math.max(0, cap - sentToday(now, logPath));
}
