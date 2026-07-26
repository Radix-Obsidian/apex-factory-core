/**
 * gtm/haboob/ledger.mjs
 *
 * Reads JSON Lines from ops/api_audit.log and syncs each entry to the
 * Haboob Pipeline Ledger Notion database.
 *
 * Field Mapping:
 *   ts             -> Date  property   (ISO 8601 date string)
 *   address        -> Title property   (Address)
 *   result         -> Select property  (Result)
 *   source         -> Select property  (Source)
 *   sessionId      -> Rich Text        (Session ID)
 *   errorReason    -> Rich Text        (Error Reason)
 *   estimatedValue -> Number           (Estimated Value)
 *
 * Duplication Guard:
 *   On startup, all existing pages are fetched and their "ts||address"
 *   fingerprints are loaded into a Set. Any entry whose fingerprint is
 *   already present is skipped without creating a duplicate page.
 *
 * Required environment variables:
 *   NOTION_API_KEY       Your Notion integration token.
 *   HABOOB_NOTION_DB_ID  Target Notion database ID.
 *
 * Usage:
 *   node gtm/haboob/ledger.mjs
 */

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

/**
 * Parses one JSON Lines entry from the audit log.
 * Returns null when the line is blank or malformed.
 */
export function parseAuditLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Builds a deterministic fingerprint key from ts and address.
 * This key is stored in the in-memory Set for duplication checks.
 */
export function buildFingerprintKey(entry) {
  return `${entry.ts}||${entry.address}`;
}

/**
 * Maps an AuditLogEntry to the Notion page properties payload.
 * Only sets Estimated Value when the field is present and non-null.
 */
export function buildNotionProperties(entry) {
  const props = {
    Address: {
      title: [{ text: { content: entry.address ?? "" } }],
    },
    Date: {
      date: { start: entry.ts },
    },
    Result: {
      select: { name: entry.result ?? "no_data" },
    },
    Source: {
      select: { name: entry.source ?? "ATTOM" },
    },
    "Session ID": {
      rich_text: [{ text: { content: entry.sessionId ?? "" } }],
    },
    "Error Reason": {
      rich_text: [{ text: { content: entry.errorReason ?? "" } }],
    },
  };

  if (entry.estimatedValue != null) {
    props["Estimated Value"] = { number: entry.estimatedValue };
  }

  return props;
}

function makeHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Paginates through the target database and returns a Set of all
 * existing "ts||address" fingerprints. Used to seed the duplication guard.
 */
export async function fetchExistingFingerprints(dbId, apiKey, fetchFn = fetch) {
  const fingerprints = new Set();
  let cursor = undefined;

  do {
    const body = cursor ? { start_cursor: cursor } : {};
    const resp = await fetchFn(`${NOTION_BASE}/databases/${dbId}/query`, {
      method: "POST",
      headers: makeHeaders(apiKey),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Notion database query returned ${resp.status}: ${text}`
      );
    }

    const data = await resp.json();

    for (const page of data.results ?? []) {
      const address =
        page.properties?.Address?.title?.[0]?.text?.content ?? "";
      const dateStart = page.properties?.Date?.date?.start ?? "";
      if (address && dateStart) {
        fingerprints.add(`${dateStart}||${address}`);
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return fingerprints;
}

/**
 * Creates a single page in the Notion database for the given entry.
 */
export async function createNotionPage(entry, dbId, apiKey, fetchFn = fetch) {
  const resp = await fetchFn(`${NOTION_BASE}/pages`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: buildNotionProperties(entry),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Notion page creation returned ${resp.status}: ${text}`
    );
  }

  return await resp.json();
}

/**
 * Streams the audit log file and returns each line as a string array.
 * Returns an empty array when the file does not exist.
 */
export async function readAuditLogLines(logPath) {
  if (!existsSync(logPath)) {
    return [];
  }

  const lines = [];
  const rl = createInterface({
    input: createReadStream(logPath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines.push(line);
  }

  return lines;
}

/**
 * Core sync function. Reads the audit log, skips already-synced entries
 * via the fingerprint Set, and creates Notion pages for new entries.
 *
 * Returns a summary object: { synced, skipped, errors }.
 */
export async function syncAuditLog(
  logPath,
  dbId,
  apiKey,
  existingFingerprints,
  fetchFn = fetch
) {
  const lines = await readAuditLogLines(logPath);
  const summary = { synced: 0, skipped: 0, errors: 0 };

  for (const line of lines) {
    const entry = parseAuditLine(line);
    if (!entry) continue;

    const key = buildFingerprintKey(entry);

    if (existingFingerprints.has(key)) {
      summary.skipped++;
      console.log(`[SKIP]  Already in ledger: ${entry.address} @ ${entry.ts}`);
      continue;
    }

    try {
      await createNotionPage(entry, dbId, apiKey, fetchFn);
      existingFingerprints.add(key);
      summary.synced++;
      console.log(
        `[SYNC]  Pushed to ledger: ${entry.address} @ ${entry.ts} (${entry.result})`
      );
    } catch (err) {
      summary.errors++;
      console.error(
        `[ERROR] Could not push ${entry.address} @ ${entry.ts}: ${err.message}`
      );
    }
  }

  return summary;
}

async function main() {
  const apiKey = process.env["NOTION_API_KEY"];
  const dbId =
    process.env["HABOOB_NOTION_DB_ID"] ||
    "3a9cd596-9872-8114-9d82-fef0bde51c05";

  if (!apiKey) {
    console.error(
      "[FATAL] NOTION_API_KEY environment variable is not set. Aborting."
    );
    process.exit(1);
  }

  const logPath = join(process.cwd(), "ops", "api_audit.log");

  console.log("[LEDGER] Starting Haboob audit log sync to Notion...");
  console.log(`[LEDGER] Log path   : ${logPath}`);
  console.log(`[LEDGER] Target DB  : ${dbId}`);

  let existingFingerprints;

  try {
    existingFingerprints = await fetchExistingFingerprints(dbId, apiKey);
    console.log(
      `[LEDGER] Existing entries loaded: ${existingFingerprints.size}`
    );
  } catch (err) {
    console.error(
      `[FATAL] Could not load existing Notion entries: ${err.message}`
    );
    process.exit(1);
  }

  const summary = await syncAuditLog(
    logPath,
    dbId,
    apiKey,
    existingFingerprints
  );

  console.log(
    `[LEDGER] Sync complete. Synced: ${summary.synced}  Skipped: ${summary.skipped}  Errors: ${summary.errors}`
  );

  if (summary.errors > 0) {
    process.exit(1);
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === thisFile) {
  main().catch((err) => {
    console.error(`[FATAL] Unhandled error: ${err.message}`);
    process.exit(1);
  });
}
