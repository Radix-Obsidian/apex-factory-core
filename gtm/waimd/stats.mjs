// stats.mjs — read-only GTM snapshot for the weekly digest. Offline (no FMCSA/network call): just reads
// the local lead store + send log. Degrades to zeros if files don't exist yet.

import fs from "node:fs";
import { PATHS } from "./config.mjs";

const SEND_LOG = new URL("./data/send-log.jsonl", import.meta.url).pathname;
const WEEK_MS = 7 * 86_400_000;

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function gtmStats(now = new Date()) {
  const leads = readJsonl(PATHS.leads);
  const sends = readJsonl(SEND_LOG);
  const since = now.getTime() - WEEK_MS;

  const byStatus = {};
  for (const l of leads) byStatus[l.status || "unknown"] = (byStatus[l.status || "unknown"] || 0) + 1;

  const sent7d = sends.filter((s) => Date.parse(s.ts) >= since).length;

  return {
    storeTotal: leads.length,
    byStatus,
    queued: byStatus.queued || 0,
    sent: byStatus.sent || 0,
    suppressed: byStatus.suppressed || 0,
    sentTotal: sends.length,
    sent7d,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(gtmStats(), null, 2));
}
