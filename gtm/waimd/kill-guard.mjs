// gtm/waimd/kill-guard.mjs — D24 shared outreach freeze for the Waimd engine.
// This engine serves the dot-navigator SKU. When that SKU is killed (or missing/unreadable in the registry),
// EVERY sender must refuse. Enforcement lives at the sendOne() chokepoint (transport.mjs) so ALL entrypoints
// are covered — interactive send.mjs AND the daily-send.sh cron (send-scheduled.mjs, sequence-send.mjs) — not
// just one. Fail-closed: killed OR absent OR unreadable → frozen (an unknown SKU is never a licence to send).
import { loadRegistry, findSku } from "../../ops/registry.mjs";

export const SKU_SLUG = "dot-navigator";
export const SKU_FROZEN = (() => {
  try { const s = findSku(loadRegistry(), SKU_SLUG); return !s || s.status === "killed"; }
  catch { return true; }
})();
export const FREEZE_REASON = `SKU ${SKU_SLUG} is KILLED or absent — outreach frozen (D24)`;
export function assertNotFrozen() { if (SKU_FROZEN) throw new Error(FREEZE_REASON); }
