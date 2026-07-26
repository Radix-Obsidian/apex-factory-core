import type { PropertyData } from "./types.js";

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";
const PROPERTYRADAR_BASE = "https://api.propertyradar.com/v1";

async function fetchFromAttom(address: string): Promise<PropertyData | null> {
  const apiKey = process.env["HABOOB_ATTOM_API_KEY"];
  if (!apiKey) return null;

  const params = new URLSearchParams({ address1: address, address2: "" });
  const avm = await fetch(
    `${ATTOM_BASE}/avm/detail?${params.toString()}`,
    { headers: { apikey: apiKey, Accept: "application/json" } }
  ).catch(() => null);

  if (!avm || !avm.ok) return null;

  const json = await avm.json().catch(() => null);
  const prop = json?.property?.[0];
  if (!prop) return null;

  const estimatedValue =
    prop?.avm?.amount?.value ?? prop?.assessment?.market?.mktttlvalue ?? 0;

  if (!estimatedValue) return null;

  return {
    estimatedValue,
    assessedValue: prop?.assessment?.assessed?.assdttlvalue ?? estimatedValue,
    lastSalePrice: prop?.sale?.amount?.saleamt ?? 0,
    lastSaleDate: prop?.sale?.amount?.salerecdate ?? "",
    street: prop?.address?.line1 ?? "",
    city: prop?.address?.city ?? "",
    state: prop?.address?.state ?? "",
    postalCode: prop?.address?.postal1 ?? "",
    source: "ATTOM",
  };
}

async function fetchFromPropertyRadar(
  address: string
): Promise<PropertyData | null> {
  const apiKey = process.env["HABOOB_PROPERTYRADAR_API_KEY"];
  if (!apiKey) return null;

  const resp = await fetch(
    `${PROPERTYRADAR_BASE}/properties?address=${encodeURIComponent(address)}&purchase=EstimatedValue,AssessedValue,OwnerName&limit=1`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
  ).catch(() => null);
  if (!resp || !resp.ok) return null;

  const json = await resp.json().catch(() => null);
  const item = json?.results?.[0];
  if (!item) return null;

  const estimatedValue = item?.EstimatedValue ?? 0;
  if (!estimatedValue) return null;

  const addressParts = address.split(",").map((p: string) => p.trim());

  return {
    estimatedValue,
    assessedValue: item?.AssessedValue ?? estimatedValue,
    lastSalePrice: item?.LastSaleAmount ?? 0,
    lastSaleDate: item?.LastSaleDate ?? "",
    street: addressParts[0] ?? "",
    city: addressParts[1] ?? "",
    state: addressParts[2]?.split(" ")[0] ?? "CA",
    postalCode: addressParts[2]?.split(" ")[1] ?? "",
    source: "PropertyRadar",
  };
}

export async function getPropertyData(
  address: string
): Promise<PropertyData | null> {
  const attomResult = await fetchFromAttom(address);
  if (attomResult) return attomResult;

  const radarResult = await fetchFromPropertyRadar(address);
  if (radarResult) return radarResult;

  return null;
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
