// sync-engagement.mjs — pull "clicked the roadmap link" signals from the waimd.org funnel so an engaged
// carrier is dropped from the drip (the conditional split: stop if clicked). Mirrors sync-suppression.mjs:
// best-effort + env-gated, so with no WAIMD_ENGAGEMENT_URL/TOKEN it cleanly no-ops and the engine runs
// fine before the endpoint exists.
//
// Source: GET ${WAIMD_ENGAGEMENT_URL}?token=${WAIMD_ENGAGEMENT_TOKEN} → { engaged: [{ dot?, email?, ts? }] }.
// These are the funnel's roadmap_generated events, attributable per-lead via utm_content=dot_<USDOT>.

import { markEngaged } from "./sequence.mjs";
import { normEmail } from "./store.mjs";

const normDot = (d) => String(d ?? "").replace(/[^0-9]/g, "");

// Mark matching leads engaged in the store (a Map keyed by USDOT, as loadLeads returns). Immutable per
// lead (markEngaged returns a new object). Returns the count newly marked. Pure given a store + list.
export function applyEngagement(store, engagedList, nowIso) {
  let marked = 0;
  const byEmail = new Map();
  for (const lead of store.values()) if (lead.email) byEmail.set(normEmail(lead.email), lead);
  for (const e of engagedList || []) {
    let lead = null;
    if (e.dot) lead = store.get(normDot(e.dot));
    if (!lead && e.email) lead = byEmail.get(normEmail(e.email));
    if (!lead || lead.engaged) continue; // unknown or already engaged → skip
    store.set(normDot(lead.dotNumber), markEngaged(lead, e.ts || nowIso));
    marked++;
  }
  return marked;
}

// Fetch the engaged list. Returns { skipped } when unconfigured, { ok, fetched, engaged } on success, or
// { ok:false, error } on a transport/HTTP error — never throws (best-effort, like suppression sync).
export async function syncEngagement(env = process.env) {
  const url = env.WAIMD_ENGAGEMENT_URL;
  const token = env.WAIMD_ENGAGEMENT_TOKEN;
  if (!url || !token) return { skipped: true };
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const data = await res.json().catch(() => ({}));
    const engaged = Array.isArray(data.engaged) ? data.engaged : [];
    return { ok: true, fetched: engaged.length, engaged };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "sync error" };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await syncEngagement(), null, 2));
}
