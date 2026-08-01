import { generateFoodAsset, buildObjectKey } from "./media_engine.js";
import { ensureBucketExists, uploadAsset } from "./b2_dock.js";
import { signAsset, buildVeracityRecord, generateAssetId } from "./veracity.js";
import type {
  GenerationRequest,
  GeneratedAsset,
  PipelineRunSummary,
  CinemaAuditEntry,
} from "./types.js";

export async function runGenerationRequest(
  request: GenerationRequest
): Promise<GeneratedAsset> {
  await ensureBucketExists();

  const assetId = generateAssetId();
  const startedAt = new Date().toISOString();

  const { imageBuffer, promptUsed, engineUsed } =
    await generateFoodAsset(request);

  const objectKey = buildObjectKey(
    request.cook.cookId,
    assetId,
    request.assetKind
  );

  const signingKey = process.env["BACKBLAZE_MASTER_KEY"];
  if (!signingKey) {
    throw new Error("pipeline: BACKBLAZE_MASTER_KEY must be set");
  }

  const provenance = {
    cookId: request.cook.cookId,
    creationDate: startedAt,
    aiModelUsed: engineUsed,
    assetId,
    bucketKey: objectKey,
  };

  const veracitySignature = signAsset(provenance, signingKey);
  const veracityRecord = buildVeracityRecord(provenance, signingKey);

  const uploadResult = await uploadAsset({
    imageBuffer,
    objectKey,
    metadata: {
      cookId: request.cook.cookId,
      creationDate: startedAt,
      aiModelUsed: engineUsed,
      veracitySignature,
      promptUsed,
    },
  });

  const asset: GeneratedAsset = {
    assetId,
    requestId: request.requestId,
    cookId: request.cook.cookId,
    assetKind: request.assetKind,
    bucketKey: objectKey,
    publicUrl: uploadResult.publicUrl,
    provenance: {
      cookId: request.cook.cookId,
      creationDate: startedAt,
      aiModelUsed: engineUsed,
      veracitySignature,
    },
    veracity: veracityRecord,
    promptUsed,
    generatedAt: startedAt,
    status: "COMPLETED",
  };

  return asset;
}

export async function runBatch(
  requests: GenerationRequest[]
): Promise<PipelineRunSummary> {
  const runId = `run_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const auditLog: CinemaAuditEntry[] = [];
  const assets: GeneratedAsset[] = [];

  for (const req of requests) {
    const entryStart = new Date().toISOString();
    try {
      const asset = await runGenerationRequest(req);
      assets.push(asset);
      auditLog.push({
        assetId: asset.assetId,
        requestId: req.requestId,
        cookId: req.cook.cookId,
        status: "COMPLETED",
        engineUsed: asset.provenance.aiModelUsed,
        b2BucketKey: asset.bucketKey,
        veracitySignature: asset.provenance.veracitySignature,
        timestamp: entryStart,
      });
    } catch (err) {
      auditLog.push({
        assetId: "unknown",
        requestId: req.requestId,
        cookId: req.cook.cookId,
        status: "FAILED",
        engineUsed: "dall-e-3",
        b2BucketKey: "",
        veracitySignature: "",
        timestamp: entryStart,
        error: String(err),
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const verified = auditLog.filter((e) => e.status === "COMPLETED").length;
  const failed = auditLog.filter((e) => e.status === "FAILED").length;

  console.log(
    `[DomicoCinema] RUN ${runId} finished: ${verified} verified, ${failed} failed, ${verified} verified`
  );

  return summary;
}
