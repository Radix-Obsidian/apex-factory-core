// sync-suppression.mjs — pull unsubscribes from waimd.org into the local suppression list, so the
// engine never re-emails someone who opted out on-site. Best-effort + env-gated: with no
// WAIMD_SUPPRESSION_URL/TOKEN it cleanly no-ops, so the pipeline runs fine before this is wired.
//
// Source: GET ${WAIMD_SUPPRESSION_URL}?token=${WAIMD_SUPPRESSION_TOKEN} → { emails: [...] }.

import { addSuppression } from "./store.mjs";

export async function syncSuppression(env = process.env) {
  const url = env.WAIMD_SUPPRESSION_URL;
  const token = env.WAIMD_SUPPRESSION_TOKEN;
  if (!url || !token) return { skipped: true };
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const data = await res.json().catch(() => ({}));
    const emails = Array.isArray(data.emails) ? data.emails : [];
    const added = addSuppression(emails);
    return { ok: true, fetched: emails.length, added };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "sync error" };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await syncSuppression(), null, 2));
}
