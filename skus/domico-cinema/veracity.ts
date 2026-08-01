import { createHmac, randomUUID } from "node:crypto";
import type { VeracityRecord, GeneratedAsset } from "./types.js";

const FACTORY_VERSION = "0.1.0";
const VOCO_FACTORY_MARKER = "VOCO_FACTORY_GENESIS";

function buildSigningPayload(
  assetId: string,
  cookId: string,
  requestId: string,
  modelUsed: string,
  generatedAt: string
): string {
  return [VOCO_FACTORY_MARKER, assetId, cookId, requestId, modelUsed, generatedAt, FACTORY_VERSION]
    .join("|");
}

function deriveSigningKey(): string {
  const seed = process.env["BACKBLAZE_MASTER_KEY"] ?? "fallback-local-dev-only";
  return seed.slice(0, 32).padEnd(32, "0");
}

export function signAsset(
  assetId: string,
  cookId: string,
  requestId: string,
  modelUsed: string,
  generatedAt: string
): string {
  const payload = buildSigningPayload(assetId, cookId, requestId, modelUsed, generatedAt);
  const key = deriveSigningKey();
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function verifySignature(
  signature: string,
  assetId: string,
  cookId: string,
  requestId: string,
  modelUsed: string,
  generatedAt: string
): boolean {
  const expected = signAsset(assetId, cookId, requestId, modelUsed, generatedAt);
  return signature === expected;
}

export function buildVeracityRecord(asset: GeneratedAsset): VeracityRecord {
  return {
    assetId: asset.assetId,
    cookId: asset.cookId,
    requestId: asset.requestId,
    modelUsed: asset.engineUsed,
    generatedAt: asset.generatedAt,
    hmacSignature: asset.veracitySignature,
    factoryVersion: FACTORY_VERSION,
  };
}

export function generateAssetId(): string {
  return `cinema_${randomUUID().replace(/-/g, "")}`;
}
