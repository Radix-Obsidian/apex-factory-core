// transport.mjs — the ONE place email leaves the engine: the gated Brevo transactional send plus the
// CAN-SPAM / reputation rails every sender must pass. send.mjs, send-scheduled.mjs, and sequence-send.mjs
// all go through here, so there is exactly one transport and one set of rails.
//
// Note on Brevo: there is NO API to create automation workflows — automations are UI-only (a POST to
// create one 404s). So every email is an individual /v3/smtp/email call; the drip's timing and branching
// live in our code (sequence.mjs), not in Brevo.

import { SENDER, SEND } from "./config.mjs";

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// "Name <email>" → { name, email }. Defaults the display name to "Waimd".
export function parseSender(from) {
  const m = String(from).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || "Waimd", email: m[2].trim() };
  return { name: "Waimd", email: String(from).trim() };
}

// Returns [] of blocking reasons; empty = every send rail is clear. These are the rails that keep
// "engine built" from becoming "engine blasting": sending stays off until outreach.waimd.org is warmed,
// the API key + CAN-SPAM postal address are set, and the from-address isolates the apex domain's reputation.
export function preflight(sender) {
  const fail = [];
  if (SEND.dailyCap <= 0) fail.push("WAIMD_DAILY_CAP is 0 (sending disabled until ramped)");
  if (!process.env.BREVO_API_KEY) fail.push("BREVO_API_KEY not set");
  if (!SENDER.postalAddress) fail.push("WAIMD_POSTAL_ADDRESS not set (CAN-SPAM requires a physical address)");
  // Reputation guard: never send from the apex waimd.org (DMARC p=reject) — a cold-email blast there
  // would burn the brand domain. Any isolated domain/subdomain is fine (itsvoco.com, outreach.waimd.org).
  const fromDomain = (String(sender.email).split("@")[1] || "").toLowerCase();
  if (fromDomain === "waimd.org")
    fail.push(`from must not be the apex waimd.org (got ${sender.email}) — use an isolated sending domain`);
  return fail;
}

// Send one rendered email via Brevo's transactional API. Caller supplies the recipient + draft fields;
// we attach the one-click List-Unsubscribe headers. Returns the Brevo messageId (or "sent"). Throws on
// any non-2xx so the caller can count failures and keep going.
export async function sendOne(sender, { to, subject, html, text, unsubscribeUrl }) {
  const listUnsub = `<mailto:${SENDER.replyTo}?subject=unsubscribe>, <${unsubscribeUrl}>`;
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      replyTo: { email: SENDER.replyTo },
      subject,
      htmlContent: html,
      textContent: text,
      headers: { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json().catch(() => ({}));
  return data?.messageId != null ? String(data.messageId) : "sent";
}
