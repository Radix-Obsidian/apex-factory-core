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
// `file` defaults to the durable store; an explicit path lets the sequencer/tests run against a fixture.
export function loadLeads(file = PATHS.leads) {
  const byDot = new Map();
  try {
    const txt = fs.readFileSync(file, "utf8");
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

export function saveLeads(byDot, file = PATHS.leads) {
  ensureDir(file);
  const lines = [...byDot.values()].map((l) => JSON.stringify(l));
  // atomic-ish: write to a temp then rename, so a crash mid-write can't truncate the store.
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, lines.join("\n") + (lines.length ? "\n" : ""));
  fs.renameSync(tmp, file);
  return lines.length;
}

// Leads eligible for a step-1 (Email 1) send, drawn from the WHOLE store so the backlog drains — not
// just the newest batch. Filter: queued (never sent), reachable, not suppressed. Sorted most-urgent
// first (soonest audit due ≈ oldest carrier), matching the pipeline's batch ordering, so older queued
// leads are sent first instead of being stranded behind each day's fresh batch.
export function queuedForSend(byDot, suppression) {
  return [...byDot.values()]
    .filter(
      (l) =>
        l.status === "queued" &&
        l.email &&
        !isSuppressed(suppression, { email: l.email, dotNumber: l.dotNumber }),
    )
    .sort((a, b) => String(a.auditDueDate).localeCompare(String(b.auditDueDate)));
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
