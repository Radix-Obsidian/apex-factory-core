/**
 * tests/ledger.test.mjs
 *
 * Deterministic unit tests for gtm/haboob/ledger.mjs.
 * All tests run without network access. The Notion fetch interface is
 * replaced with a local mock so no real API key is required.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  parseAuditLine,
  buildFingerprintKey,
  buildNotionProperties,
  fetchExistingFingerprints,
  createNotionPage,
  readAuditLogLines,
  syncAuditLog,
} from "../gtm/haboob/ledger.mjs";

const VALID_ENTRY = {
  ts: "2026-07-26T10:00:00.000Z",
  sessionId: "sess-001",
  purpose: "property_lookup",
  address: "1234 Elm Street, Irvine, CA 92618",
  source: "ATTOM",
  result: "success",
  errorReason: undefined,
  estimatedValue: 850000,
};

const BLOCKED_ENTRY = {
  ts: "2026-07-26T10:05:00.000Z",
  sessionId: "sess-002",
  purpose: "property_lookup",
  address: "bad addr",
  source: "ATTOM",
  result: "blocked_by_circuit_breaker",
  errorReason: "Address does not contain a street number and street name.",
  estimatedValue: undefined,
};

describe("parseAuditLine", () => {
  test("parses a valid JSON line", () => {
    const line = JSON.stringify(VALID_ENTRY);
    const result = parseAuditLine(line);
    assert.equal(result.address, VALID_ENTRY.address);
    assert.equal(result.result, "success");
  });

  test("returns null for an empty line", () => {
    assert.equal(parseAuditLine(""), null);
    assert.equal(parseAuditLine("   "), null);
  });

  test("returns null for malformed JSON", () => {
    assert.equal(parseAuditLine("{not valid json"), null);
  });

  test("parses a blocked circuit breaker entry", () => {
    const line = JSON.stringify(BLOCKED_ENTRY);
    const result = parseAuditLine(line);
    assert.equal(result.result, "blocked_by_circuit_breaker");
    assert.ok(result.errorReason.includes("street number"));
  });
});

describe("buildFingerprintKey", () => {
  test("produces ts||address format", () => {
    const key = buildFingerprintKey(VALID_ENTRY);
    assert.equal(key, `${VALID_ENTRY.ts}||${VALID_ENTRY.address}`);
  });

  test("two entries with different ts produce different keys", () => {
    const a = buildFingerprintKey(VALID_ENTRY);
    const b = buildFingerprintKey({ ...VALID_ENTRY, ts: "2026-07-26T11:00:00.000Z" });
    assert.notEqual(a, b);
  });

  test("two entries with different addresses produce different keys", () => {
    const a = buildFingerprintKey(VALID_ENTRY);
    const b = buildFingerprintKey({ ...VALID_ENTRY, address: "5678 Oak Ave, Newport Beach, CA 92660" });
    assert.notEqual(a, b);
  });

  test("identical ts and address produce the same key (idempotent)", () => {
    const a = buildFingerprintKey(VALID_ENTRY);
    const b = buildFingerprintKey({ ...VALID_ENTRY });
    assert.equal(a, b);
  });
});

describe("buildNotionProperties", () => {
  test("maps address to title property", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props.Address.title[0].text.content, VALID_ENTRY.address);
  });

  test("maps ts to date start", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props.Date.date.start, VALID_ENTRY.ts);
  });

  test("maps result to select name", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props.Result.select.name, "success");
  });

  test("maps source to select name", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props.Source.select.name, "ATTOM");
  });

  test("maps sessionId to rich text", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props["Session ID"].rich_text[0].text.content, "sess-001");
  });

  test("sets Estimated Value when present", () => {
    const props = buildNotionProperties(VALID_ENTRY);
    assert.equal(props["Estimated Value"].number, 850000);
  });

  test("omits Estimated Value when null", () => {
    const props = buildNotionProperties({ ...VALID_ENTRY, estimatedValue: null });
    assert.equal(props["Estimated Value"], undefined);
  });

  test("omits Estimated Value when undefined", () => {
    const props = buildNotionProperties(BLOCKED_ENTRY);
    assert.equal(props["Estimated Value"], undefined);
  });

  test("maps errorReason to rich text", () => {
    const props = buildNotionProperties(BLOCKED_ENTRY);
    assert.ok(
      props["Error Reason"].rich_text[0].text.content.includes("street number")
    );
  });

  test("sets Error Reason to empty string when no error", () => {
    const props = buildNotionProperties({ ...VALID_ENTRY, errorReason: undefined });
    assert.equal(props["Error Reason"].rich_text[0].text.content, "");
  });

  test("defaults result to no_data when missing", () => {
    const props = buildNotionProperties({ ...VALID_ENTRY, result: undefined });
    assert.equal(props.Result.select.name, "no_data");
  });

  test("defaults source to ATTOM when missing", () => {
    const props = buildNotionProperties({ ...VALID_ENTRY, source: undefined });
    assert.equal(props.Source.select.name, "ATTOM");
  });
});

describe("fetchExistingFingerprints", () => {
  test("returns a Set of ts||address keys from Notion results", async () => {
    const mockResponse = {
      results: [
        {
          properties: {
            Address: { title: [{ text: { content: VALID_ENTRY.address } }] },
            Date: { date: { start: VALID_ENTRY.ts } },
          },
        },
      ],
      has_more: false,
    };

    const mockFetch = async () => ({
      ok: true,
      text: async () => "",
      json: async () => mockResponse,
    });

    const fingerprints = await fetchExistingFingerprints("fake-db-id", "fake-key", mockFetch);
    assert.ok(fingerprints instanceof Set);
    assert.equal(fingerprints.size, 1);
    const expected = buildFingerprintKey(VALID_ENTRY);
    assert.ok(fingerprints.has(expected));
  });

  test("paginates when has_more is true", async () => {
    let callCount = 0;
    const pages = [
      {
        results: [
          {
            properties: {
              Address: { title: [{ text: { content: "111 First St, Irvine, CA" } }] },
              Date: { date: { start: "2026-07-25T09:00:00.000Z" } },
            },
          },
        ],
        has_more: true,
        next_cursor: "cursor_page_2",
      },
      {
        results: [
          {
            properties: {
              Address: { title: [{ text: { content: "222 Second St, Newport, CA" } }] },
              Date: { date: { start: "2026-07-25T10:00:00.000Z" } },
            },
          },
        ],
        has_more: false,
      },
    ];

    const mockFetch = async () => {
      const page = pages[callCount++];
      return { ok: true, text: async () => "", json: async () => page };
    };

    const fingerprints = await fetchExistingFingerprints("fake-db-id", "fake-key", mockFetch);
    assert.equal(fingerprints.size, 2);
    assert.equal(callCount, 2);
  });

  test("throws when Notion returns a non-ok status", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await assert.rejects(
      () => fetchExistingFingerprints("fake-db-id", "fake-key", mockFetch),
      (err) => {
        assert.ok(err.message.includes("401"));
        return true;
      }
    );
  });

  test("skips pages where address or date is missing", async () => {
    const mockResponse = {
      results: [
        {
          properties: {
            Address: { title: [] },
            Date: { date: null },
          },
        },
        {
          properties: {
            Address: { title: [{ text: { content: "999 Main St" } }] },
            Date: { date: null },
          },
        },
      ],
      has_more: false,
    };

    const mockFetch = async () => ({
      ok: true,
      text: async () => "",
      json: async () => mockResponse,
    });

    const fingerprints = await fetchExistingFingerprints("fake-db-id", "fake-key", mockFetch);
    assert.equal(fingerprints.size, 0);
  });
});

describe("createNotionPage", () => {
  test("calls Notion pages endpoint and returns parsed JSON", async () => {
    const fakePageId = "page-xyz-123";
    const mockFetch = async (url, opts) => {
      assert.ok(url.endsWith("/pages"));
      assert.equal(opts.method, "POST");
      return {
        ok: true,
        text: async () => "",
        json: async () => ({ id: fakePageId }),
      };
    };

    const page = await createNotionPage(VALID_ENTRY, "fake-db", "fake-key", mockFetch);
    assert.equal(page.id, fakePageId);
  });

  test("throws on non-ok response from Notion", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    await assert.rejects(
      () => createNotionPage(VALID_ENTRY, "fake-db", "fake-key", mockFetch),
      (err) => {
        assert.ok(err.message.includes("400"));
        return true;
      }
    );
  });
});

describe("readAuditLogLines", () => {
  test("returns empty array when file does not exist", async () => {
    const lines = await readAuditLogLines("/nonexistent/path/api_audit.log");
    assert.deepEqual(lines, []);
  });

  test("reads all lines from a real file", async () => {
    const dir = join(tmpdir(), `ledger-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");

    writeFileSync(
      logPath,
      [
        JSON.stringify(VALID_ENTRY),
        "",
        JSON.stringify(BLOCKED_ENTRY),
      ].join("\n"),
      "utf-8"
    );

    const lines = await readAuditLogLines(logPath);
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes(VALID_ENTRY.address));
  });
});

describe("syncAuditLog", () => {
  test("syncs new entries and returns correct summary", async () => {
    const dir = join(tmpdir(), `ledger-sync-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");

    writeFileSync(
      logPath,
      [JSON.stringify(VALID_ENTRY), JSON.stringify(BLOCKED_ENTRY)].join("\n"),
      "utf-8"
    );

    const createdPages = [];
    const mockFetch = async (url, opts) => {
      createdPages.push(JSON.parse(opts.body));
      return { ok: true, text: async () => "", json: async () => ({ id: "new-page" }) };
    };

    const summary = await syncAuditLog(
      logPath,
      "fake-db",
      "fake-key",
      new Set(),
      mockFetch
    );

    assert.equal(summary.synced, 2);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.errors, 0);
    assert.equal(createdPages.length, 2);
  });

  test("skips entries whose fingerprint is already in the Set", async () => {
    const dir = join(tmpdir(), `ledger-skip-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");

    writeFileSync(logPath, JSON.stringify(VALID_ENTRY), "utf-8");

    const existingFingerprints = new Set([buildFingerprintKey(VALID_ENTRY)]);
    const createdPages = [];
    const mockFetch = async (url, opts) => {
      createdPages.push(opts.body);
      return { ok: true, text: async () => "", json: async () => ({ id: "x" }) };
    };

    const summary = await syncAuditLog(
      logPath,
      "fake-db",
      "fake-key",
      existingFingerprints,
      mockFetch
    );

    assert.equal(summary.synced, 0);
    assert.equal(summary.skipped, 1);
    assert.equal(createdPages.length, 0);
  });

  test("records error and continues when Notion call fails", async () => {
    const dir = join(tmpdir(), `ledger-err-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");

    writeFileSync(
      logPath,
      [JSON.stringify(VALID_ENTRY), JSON.stringify(BLOCKED_ENTRY)].join("\n"),
      "utf-8"
    );

    let callIdx = 0;
    const mockFetch = async () => {
      callIdx++;
      if (callIdx === 1) {
        return { ok: false, status: 500, text: async () => "Server Error" };
      }
      return { ok: true, text: async () => "", json: async () => ({ id: "ok" }) };
    };

    const summary = await syncAuditLog(
      logPath,
      "fake-db",
      "fake-key",
      new Set(),
      mockFetch
    );

    assert.equal(summary.errors, 1);
    assert.equal(summary.synced, 1);
  });

  test("returns 0 synced when log file is empty", async () => {
    const dir = join(tmpdir(), `ledger-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");
    writeFileSync(logPath, "", "utf-8");

    const summary = await syncAuditLog(logPath, "fake-db", "fake-key", new Set());
    assert.equal(summary.synced, 0);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.errors, 0);
  });

  test("skips blank and malformed lines gracefully", async () => {
    const dir = join(tmpdir(), `ledger-malformed-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, "api_audit.log");

    writeFileSync(
      logPath,
      ["   ", "{bad json{{", JSON.stringify(VALID_ENTRY)].join("\n"),
      "utf-8"
    );

    const createdPages = [];
    const mockFetch = async (url, opts) => {
      createdPages.push(opts.body);
      return { ok: true, text: async () => "", json: async () => ({ id: "ok" }) };
    };

    const summary = await syncAuditLog(
      logPath,
      "fake-db",
      "fake-key",
      new Set(),
      mockFetch
    );

    assert.equal(summary.synced, 1);
    assert.equal(summary.errors, 0);
  });
});
