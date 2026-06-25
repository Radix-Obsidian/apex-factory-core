// store.mjs — the durable lead store (JSONL) + suppression list. Dedup is by USDOT (one carrier, one
// lead). Suppression is sacred: an email or USDOT on the suppression list is NEVER contacted again
// (unsubscribes, hard bounces, complaints, existing customers). All file ops degrade to empty on a
// missing file so a first run just creates them.

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.mjs";

export const normEmail = (e) => String(e ?? "").trim().toLowerCase();
const normDot = (d) => String(d ?? "").replace(/[^0-9]/g, "");

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

// ── suppression ────────────────────────────────────────────────────────────
// One token per line: an email (lowercased) or a "dot:<number>" entry. Comments (#) and blanks ignored.
export function loadSuppression() {
  const set = new Set();
  try {
    const txt = fs.readFileSync(PATHS.suppression, "utf8");
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      set.add(t.toLowerCase());
    }
  } catch {
    /* no file yet */
  }
  return set;
}

export function isSuppressed(set, { email, dotNumber }) {
  if (email && set.has(normEmail(email))) return true;
  if (dotNumber && set.has(`dot:${normDot(dotNumber)}`)) return true;
  return false;
}

export function addSuppression(entries) {
  if (!entries?.length) return 0;
  ensureDir(PATHS.suppression);
  const existing = loadSuppression();
  const fresh = [];
  for (const raw of entries) {
    const t = String(raw).trim().toLowerCase();
    if (t && !existing.has(t)) {
      fresh.push(t);
      existing.add(t);
    }
  }
  if (fresh.length) fs.appendFileSync(PATHS.suppression, fresh.join("\n") + "\n");
  return fresh.length;
}

// ── leads ────────────────────────────────────────────────────────────────────
export function loadLeads() {
  const byDot = new Map();
  try {
    const txt = fs.readFileSync(PATHS.leads, "utf8");
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const lead = JSON.parse(t);
        if (lead.dotNumber) byDot.set(normDot(lead.dotNumber), lead);
      } catch {
        /* skip a corrupt line rather than lose the whole store */
      }
    }
  } catch {
    /* no file yet */
  }
  return byDot;
}

export function saveLeads(byDot) {
  ensureDir(PATHS.leads);
  const lines = [...byDot.values()].map((l) => JSON.stringify(l));
  // atomic-ish: write to a temp then rename, so a crash mid-write can't truncate the store.
  const tmp = PATHS.leads + ".tmp";
  fs.writeFileSync(tmp, lines.join("\n") + (lines.length ? "\n" : ""));
  fs.renameSync(tmp, PATHS.leads);
  return lines.length;
}

// Merge freshly-sourced leads into the store. Never overwrites outreach state (status/contactCount) on
// an existing lead; only refreshes carrier facts and lastSeenAt. Returns {added, updated}.
export function upsertLeads(byDot, incoming, nowIso) {
  let added = 0;
  let updated = 0;
  for (const lead of incoming) {
    const key = normDot(lead.dotNumber);
    if (!key) continue;
    const prev = byDot.get(key);
    if (!prev) {
      byDot.set(key, { ...lead, firstSeenAt: nowIso, lastSeenAt: nowIso, status: lead.status ?? "new", contactCount: 0 });
      added++;
    } else {
      byDot.set(key, {
        ...prev,
        // refresh facts that may have changed; keep outreach state intact
        legalName: lead.legalName ?? prev.legalName,
        email: lead.email ?? prev.email,
        phone: lead.phone ?? prev.phone,
        auditDueDate: lead.auditDueDate ?? prev.auditDueDate,
        deepLink: lead.deepLink ?? prev.deepLink,
        lastSeenAt: nowIso,
      });
      updated++;
    }
  }
  return { added, updated };
}
