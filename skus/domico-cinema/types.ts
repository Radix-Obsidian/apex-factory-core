export type GenerationStatus =
  | "PENDING"
  | "GENERATING"
  | "UPLOADING"
  | "VERIFIED"
  | "FAILED";

export type AssetKind = "HERO_PHOTO" | "THUMBNAIL" | "CAROUSEL_PANEL" | "VIDEO_POSTER";

export type MediaEngine = "dall-e-3" | "gpt-image-1";

export interface CookProfile {
  cookId: string;
  displayName: string;
  cuisineStyle: string;
  platformHandle?: string;
}

export interface GenerationRequest {
  requestId: string;
  cook: CookProfile;
  dishName: string;
  dishDescription: string;
  assetKind: AssetKind;
  targetEngine: MediaEngine;
  styleDirective: string;
  createdAt: string;
}

export interface GeneratedAsset {
  requestId: string;
  assetId: string;
  cookId: string;
  dishName: string;
  assetKind: AssetKind;
  engineUsed: MediaEngine;
  promptUsed: string;
  b2ObjectKey: string;
  b2BucketName: string;
  b2PublicUrl: string;
  veracitySignature: string;
  veracityTimestamp: string;
  provenance: AssetProvenance;
  status: GenerationStatus;
  generatedAt: string;
  uploadedAt: string;
}

export interface AssetProvenance {
  cookId: string;
  createdAt: string;
  modelUsed: string;
  factoryVersion: string;
  requestId: string;
  b2BucketName: string;
  veracitySigned: boolean;
}

export interface B2UploadResult {
  objectKey: string;
  bucketName: string;
  etag: string;
  versionId?: string;
}

export interface VeracityRecord {
  assetId: string;
  cookId: string;
  requestId: string;
  modelUsed: string;
  generatedAt: string;
  hmacSignature: string;
  factoryVersion: string;
}

export interface CinemaAuditEntry {
  ts: string;
  requestId: string;
  cookId: string;
  assetKind: AssetKind;
  engine: MediaEngine;
  b2Key: string;
  verified: boolean;
  durationMs: number;
  status: GenerationStatus;
  errorReason?: string;
}

export interface PipelineRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  totalAssets: number;
  successCount: number;
  failureCount: number;
  verifiedCount: number;
  assets: GeneratedAsset[];
}
