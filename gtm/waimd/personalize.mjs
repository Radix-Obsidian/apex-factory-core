// personalize.mjs — turn a raw census row into a normalized Lead with the conversion hook baked in: the
// carrier's exact New Entrant Safety Audit due date (add_date + 330d, matching the calendar engine) and
// a prefilled deep-link to their instant roadmap. Also drafts the cold email (CAN-SPAM compliant).

import { parseYmd, toIso, addDays } from "./census.mjs";
import { AUDIT_OFFSET_DAYS, DEEPLINK, SENDER } from "./config.mjs";

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .trim();

// FMCSA officer fields are messy ("LAST, FIRST" or "FIRST LAST"). Pull a plausible first name, else null
// (we greet "there" rather than guess wrong — a wrong name reads worse than none).
function greetingName(officer) {
  const raw = String(officer || "").trim();
  if (!raw) return null;
  let first;
  if (raw.includes(",")) first = raw.split(",")[1]?.trim().split(/\s+/)[0];
  else first = raw.split(/\s+/)[0];
  if (!first || first.length < 2 || /\d/.test(first)) return null;
  return titleCase(first);
}

// Census row → normalized Lead (no store metadata; store.mjs adds firstSeenAt/status/etc).
export function toLead(row, now = new Date()) {
  const addDate = parseYmd(row.add_date);
  const auditDue = addDate ? addDays(addDate, AUDIT_OFFSET_DAYS) : null;
  const lead = {
    dotNumber: String(row.dot_number ?? "").replace(/[^0-9]/g, ""),
    legalName: titleCase(row.legal_name),
    dbaName: row.dba_name ? titleCase(row.dba_name) : null,
    officerFirstName: greetingName(row.company_officer_1),
    email: String(row.email_address ?? "").trim().toLowerCase() || null,
    phone: row.phone || row.cell_phone || null,
    carrierType: "interstate", // we only source carrier_operation 'A'
    state: row.phy_state || null,
    city: row.phy_city ? titleCase(row.phy_city) : null,
    addDate: addDate ? toIso(addDate) : null,
    auditDueDate: auditDue ? toIso(auditDue) : null,
    source: "fmcsa_census",
  };
  lead.deepLink = buildDeepLink(lead);
  return lead;
}

// The locked deep-link contract → an instant, prefilled, auto-generated roadmap with per-lead attribution.
export function buildDeepLink(lead) {
  const u = new URL(DEEPLINK.base);
  if (lead.dotNumber) u.searchParams.set("usdot", lead.dotNumber);
  if (lead.addDate) u.searchParams.set("authorityDate", lead.addDate);
  u.searchParams.set("carrierType", lead.carrierType);
  u.searchParams.set("utm_source", DEEPLINK.utm.source);
  u.searchParams.set("utm_medium", DEEPLINK.utm.medium);
  u.searchParams.set("utm_campaign", DEEPLINK.utm.campaign);
  if (lead.dotNumber) u.searchParams.set("utm_content", `dot_${lead.dotNumber}`); // per-lead attribution
  return u.toString();
}

const PRETTY = (iso) =>
  iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

// Cold email draft. Honest, short, audit-date-led. The CAN-SPAM footer (postal address + unsubscribe) is
// assembled here; send.mjs refuses to send if the postal address is unset, so a draft can preview without
// it but a real send cannot go out non-compliant.
export function draftEmail(lead) {
  const hi = lead.officerFirstName ? `Hi ${lead.officerFirstName},` : "Hi there,";
  const company = lead.dbaName || lead.legalName || "your carrier";
  const auditPretty = PRETTY(lead.auditDueDate);
  const subject = auditPretty
    ? `${company}: your FMCSA new-entrant safety audit window (due ~${auditPretty})`
    : `${company}: your FMCSA new-entrant compliance roadmap`;

  const unsubUrl = `${SENDER.unsubscribeBase}?e=${encodeURIComponent(lead.email || "")}`;
  const postal = SENDER.postalAddress || "[postal address required before sending]";

  const text = [
    hi,
    "",
    `Congrats on getting ${company} (USDOT ${lead.dotNumber}) on the road. As a brand-new interstate carrier, FMCSA will run a New Entrant Safety Audit within your first 12 months${auditPretty ? ` — for you that window lands around ${auditPretty}` : ""}. A failed audit can pull your new-entrant registration, so prep is everything.`,
    "",
    "We built a free tool that gives you a dated, 18-month compliance roadmap anchored to your exact authority date — every federal milestone (drug & alcohol program, DQFs, ELD/HOS, the audit packet) on the day it's actually due for you:",
    "",
    lead.deepLink,
    "",
    "It's free, no account needed. If it's useful, there's a one-time audit-ready packet you can unlock — but the roadmap itself costs nothing.",
    "",
    "This is decision-support, not legal advice; always verify against FMCSA.",
    "",
    "— The Waimd team",
    "",
    "—",
    `You're receiving this because ${company} is a newly registered interstate carrier in the public FMCSA Company Census. Not interested? Unsubscribe and we won't email again: ${unsubUrl}`,
    postal,
  ].join("\n");

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
<p>${esc(hi)}</p>
<p>Congrats on getting <strong>${esc(company)}</strong> (USDOT ${esc(lead.dotNumber)}) on the road. As a brand-new interstate carrier, FMCSA will run a <strong>New Entrant Safety Audit</strong> within your first 12 months${auditPretty ? ` — for you that window lands around <strong>${esc(auditPretty)}</strong>` : ""}. A failed audit can pull your new-entrant registration, so prep is everything.</p>
<p>We built a free tool that gives you a dated, 18-month compliance roadmap anchored to your exact authority date — every federal milestone on the day it's actually due for you:</p>
<p><a href="${esc(lead.deepLink)}" style="color:#b3261e;font-weight:600">See your dated FMCSA roadmap →</a></p>
<p>It's free, no account needed. If it's useful, there's a one-time audit-ready packet you can unlock — but the roadmap itself costs nothing.</p>
<p style="color:#666;font-size:13px">This is decision-support, not legal advice; always verify against FMCSA.</p>
<p>— The Waimd team</p>
<hr style="border:none;border-top:1px solid #ddd"/>
<p style="color:#888;font-size:12px">You're receiving this because ${esc(company)} is a newly registered interstate carrier in the public FMCSA Company Census. Not interested? <a href="${esc(unsubUrl)}" style="color:#888">Unsubscribe</a> and we won't email again.<br/>${esc(postal)}</p>
</div>`;

  return { subject, text, html, unsubscribeUrl: unsubUrl };
}
