import type { AgentState, AgentTurn, ConversationSession, BorrowerProfile, PropertyData } from "./types.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

const AUDIT_LOG_DIR = join(process.cwd(), "ops");
const AUDIT_LOG_PATH = join(AUDIT_LOG_DIR, "api_audit.log");

function writeAuditLog(entry: any): void {
  try {
    mkdirSync(AUDIT_LOG_DIR, { recursive: true });
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Audit log write failure must never crash the primary pipeline.
  }
}

export function validateAddress(address: string): {
  valid: boolean;
  reason: string;
} {
  if (!address || address.trim().length < 5) {
    return {
      valid: false,
      reason:
        "Address is empty or too short to be a valid US street address.",
    };
  }

  const normalized = address.trim();

  const hasStreetNumber = /\d/.test(normalized);
  const hasStreetName = /[a-zA-Z]{2,}/.test(normalized);

  if (!hasStreetNumber || !hasStreetName) {
    return {
      valid: false,
      reason:
        `Address does not contain a street number and street name. Received: "${normalized}"`,
    };
  }

  return { valid: true, reason: "passed" };
}

async function fetchFromAttom(
  address: string,
  sessionId: string
): Promise<PropertyData | null> {
  const apiKey = process.env["HABOOB_ATTOM_API_KEY"];

  if (!apiKey) {
    writeAuditLog({
      ts: new Date().toISOString(),
      sessionId,
      purpose: "property_lookup",
      address,
      source: "ATTOM",
      result: "blocked_by_circuit_breaker",
      errorReason: "HABOOB_ATTOM_API_KEY environment variable is not set",
    });
    return null;
  }

  const params = new URLSearchParams({ address1: address, address2: "" });
  let propertyResult: PropertyData | null = null;
  let errorReason: string | undefined;

  try {
    const avm = await fetch(
      `${ATTOM_BASE}/avm/detail?${params.toString()}`,
      { headers: { apikey: apiKey, Accept: "application/json" } }
    );

    if (!avm.ok) {
      errorReason = `HTTP ${avm.status} response from ATTOM`;
    } else {
      const json = await avm.json().catch(() => null);
      const prop = json?.property?.[0];

      if (prop) {
        const estimatedValue =
          prop?.avm?.amount?.value ??
          prop?.assessment?.market?.mktttlvalue ??
          0;

        if (estimatedValue) {
          propertyResult = {
            estimatedValue,
            assessedValue:
              prop?.assessment?.assessed?.assdttlvalue ?? estimatedValue,
            lastSalePrice: prop?.sale?.amount?.saleamt ?? 0,
            lastSaleDate: prop?.sale?.amount?.salerecdate ?? "",
            street: prop?.address?.line1 ?? "",
            city: prop?.address?.city ?? "",
            state: prop?.address?.state ?? "",
            postalCode: prop?.address?.postal1 ?? "",
            source: "ATTOM",
          };
        } else {
          errorReason =
            "ATTOM returned a property record but estimated value was zero or absent";
        }
      } else {
        errorReason =
          "ATTOM response contained no property record for this address";
      }
    }
  } catch (err) {
    errorReason =
      err instanceof Error ? err.message : "Unknown network error contacting ATTOM";
  }

  writeAuditLog({
    ts: new Date().toISOString(),
    sessionId,
    purpose: "property_lookup",
    address,
    source: "ATTOM",
    result: propertyResult ? "success" : "no_data",
    errorReason,
    estimatedValue: propertyResult?.estimatedValue,
  });

  return propertyResult;
}

export async function getPropertyData(
  address: string,
  sessionId = "unknown"
): Promise<PropertyData | null> {
  const check = validateAddress(address);

  if (!check.valid) {
    writeAuditLog({
      ts: new Date().toISOString(),
      sessionId,
      purpose: "property_lookup",
      address,
      source: "ATTOM",
      result: "blocked_by_circuit_breaker",
      errorReason: check.reason,
    });
    return null;
  }

  return fetchFromAttom(address, sessionId);
}

export function parseAddressFromString(raw: string): {
  street: string;
  city: string;
  state: string;
  postalCode: string;
} {
  const parts = raw.split(",").map((p) => p.trim());
  const street = parts[0] ?? raw;
  const city = parts[1] ?? "";
  const stateZip = parts[2] ?? "";
  const stateZipParts = stateZip.trim().split(/\s+/);
  const state = stateZipParts[0] ?? "CA";
  const postalCode = stateZipParts[1] ?? "";
  return { street, city, state, postalCode };
}
