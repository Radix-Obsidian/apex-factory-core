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

// FMCSA officer fields are unreliable ("LAST, FIRST", garbled, or blank). We never guess a name.
// The email always addresses the business. A wrong name is worse than no name.
function greetingName(_officer) {
  return null;
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

// Cold email draft. Blair Warren framework, two sentences of body. The deadline does the selling.
// CAN-SPAM footer assembled here; send.mjs refuses to send if postal address is unset.
export function draftEmail(lead) {
  const company = lead.dbaName || lead.legalName || "your carrier";
  const auditPretty = PRETTY(lead.auditDueDate);
  const subject = auditPretty
    ? `USDOT ${lead.dotNumber} — your safety audit window opens ${auditPretty}`
    : `USDOT ${lead.dotNumber} — your FMCSA compliance checklist`;

  const unsubUrl = `${SENDER.unsubscribeBase}?e=${encodeURIComponent(lead.email || "")}`;
  const postal = SENDER.postalAddress || "[postal address required before sending]";

  const bodyLine1 = auditPretty
    ? `Your New Entrant Safety Audit window opens around ${auditPretty}.`
    : `Your New Entrant Safety Audit window is coming up.`;
  const bodyLine2 = `Here's a free dated checklist so nothing sneaks up on you:`;

  const text = [
    `Hi ${company},`,
    "",
    `${bodyLine1} ${bodyLine2}`,
    "",
    lead.deepLink,
    "",
    "Waimd by Voco Technologies, Inc.",
    "",
    "Decision-support, not legal advice. Always verify against FMCSA.",
    "",
    "---",
    `You're receiving this because ${company} is a newly registered interstate carrier in the public FMCSA Company Census. Not interested? Unsubscribe and we won't email again: ${unsubUrl}`,
    postal,
  ].join("\n");

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
<p>Hi ${esc(company)},</p>
<p>${esc(bodyLine1)} ${esc(bodyLine2)}</p>
<p><a href="${esc(lead.deepLink)}" style="color:#b3261e;font-weight:600">See your free dated checklist</a></p>
<p>Waimd by Voco Technologies, Inc.</p>
<p style="color:#999;font-size:12px">Decision-support, not legal advice. Always verify against FMCSA.</p>
<hr style="border:none;border-top:1px solid #eee"/>
<p style="color:#999;font-size:11px">You're receiving this because ${esc(company)} is a newly registered interstate carrier in the public FMCSA Company Census. Not interested? <a href="${esc(unsubUrl)}" style="color:#999">Unsubscribe</a> and we won't email again.<br/>${esc(postal)}</p>
</div>`;

  return { subject, text, html, unsubscribeUrl: unsubUrl };
}
