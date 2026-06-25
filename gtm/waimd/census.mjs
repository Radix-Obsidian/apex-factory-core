// census.mjs — pull brand-new interstate carriers from the FMCSA Company Census (Socrata SODA API),
// filtered server-side to our ICP, paged with a hard ceiling. Pure fetch + node built-ins, no deps.

import { CENSUS, FILTER } from "./config.mjs";

const DAY_MS = 86_400_000;

// FMCSA add_date / mcs150_date are YYYYMMDD (e.g. 20260623). Parse to a UTC Date; null if malformed.
export function parseYmd(ymd) {
  const s = String(ymd ?? "").trim();
  if (!/^\d{8}$/.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(4, 6);
  const d = +s.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// Date → YYYYMMDD integer (for SoQL numeric comparison on add_date).
export function toYmdInt(date) {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

// Date → ISO YYYY-MM-DD (the deep-link / calendar format).
export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

const SELECT = [
  "dot_number",
  "legal_name",
  "dba_name",
  "company_officer_1",
  "email_address",
  "phone",
  "cell_phone",
  "carrier_operation",
  "phy_state",
  "phy_city",
  "add_date",
  "mcs150_date",
  "status_code",
].join(",");

// Build the SoQL $where for new interstate entrants reachable by email, added inside the audit-prep window.
function buildWhere(now = new Date()) {
  // add_date is a TEXT column in Socrata (YYYYMMDD), so compare as quoted strings — lexical order on
  // a zero-padded YYYYMMDD is identical to chronological order.
  const minDate = toYmdInt(addDays(now, -FILTER.maxAgeDays)); // oldest add_date we want (audit nearer)
  const maxDate = toYmdInt(addDays(now, -FILTER.minAgeDays)); // newest (give them ~2 weeks to settle)
  const clauses = [
    `add_date >= '${minDate}'`,
    `add_date <= '${maxDate}'`,
    `carrier_operation = '${FILTER.carrierOperation}'`,
    `status_code = '${FILTER.statusCode}'`,
  ];
  if (FILTER.requireEmail) clauses.push("email_address IS NOT NULL");
  return clauses.join(" AND ");
}

async function fetchPage(where, offset) {
  const url = new URL(CENSUS.base);
  url.searchParams.set("$select", SELECT);
  url.searchParams.set("$where", where);
  url.searchParams.set("$order", "add_date ASC"); // oldest-in-window first = soonest audit = most urgent
  url.searchParams.set("$limit", String(CENSUS.pageSize));
  url.searchParams.set("$offset", String(offset));
  const headers = { accept: "application/json" };
  if (CENSUS.appToken) headers["X-App-Token"] = CENSUS.appToken;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FMCSA census fetch failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Returns the raw census rows matching the ICP (already server-filtered). Pages until exhausted or the
// page ceiling. Each row is the Socrata record; downstream maps it to a Lead.
export async function fetchNewEntrants(now = new Date()) {
  const where = buildWhere(now);
  const rows = [];
  for (let page = 0; page < CENSUS.maxPages; page++) {
    const batch = await fetchPage(where, page * CENSUS.pageSize);
    rows.push(...batch);
    if (batch.length < CENSUS.pageSize) break; // last page
  }
  return rows;
}
