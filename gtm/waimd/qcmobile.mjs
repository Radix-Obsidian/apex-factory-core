// qcmobile.mjs — OPTIONAL send-time validation against the FMCSA QCMobile API. The Company Census is
// already authoritative and refreshes daily, so this is belt-and-suspenders: right before contacting a
// carrier we can confirm it's still active and allowed to operate. Requires a free developer webKey
// (FMCSA_QCMOBILE_WEBKEY); with no key it cleanly no-ops so the pipeline still runs.
//
// Docs: https://mobile.fmcsa.dot.gov/QCDevsite/docs/qcApi — webKey is a required query param on every call.

const BASE = "https://mobile.fmcsa.dot.gov/qc/services/carriers";

export function qcEnabled(env = process.env) {
  return !!env.FMCSA_QCMOBILE_WEBKEY;
}

// Returns { ok, allowedToOperate, statusCode } or { skipped:true } when no key. Best-effort: a network
// error returns { ok:false, error } rather than throwing, so one bad lookup can't halt a batch.
export async function validateDot(dotNumber, env = process.env) {
  const key = env.FMCSA_QCMOBILE_WEBKEY;
  if (!key) return { skipped: true };
  try {
    const url = `${BASE}/${encodeURIComponent(dotNumber)}?webKey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const data = await res.json().catch(() => ({}));
    const c = data?.content?.carrier ?? data?.carrier ?? {};
    return {
      ok: true,
      allowedToOperate: c.allowedToOperate ?? null,
      statusCode: c.statusCode ?? null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "qcmobile error" };
  }
}
