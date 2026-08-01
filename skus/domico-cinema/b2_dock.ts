import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { B2UploadResult, AssetProvenance } from "./types.js";

const B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
const BUCKET_NAME = "domico-cinema-dock";
const FACTORY_VERSION = "0.1.0";

function buildClient(): S3Client {
  const keyId = process.env["BACKBLAZE_ACCOUNT_ID"];
  const appKey = process.env["BACKBLAZE_MASTER_KEY"];

  if (!keyId || !appKey) {
    throw new Error(
      "BACKBLAZE_ACCOUNT_ID and BACKBLAZE_MASTER_KEY must be set in the environment"
    );
  }

  return new S3Client({
    endpoint: B2_ENDPOINT,
    region: "us-west-004",
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
    forcePathStyle: true,
  });
}

export async function ensureBucketExists(): Promise<void> {
  const client = buildClient();

  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`[b2_dock] bucket ${BUCKET_NAME} confirmed present`);
    return;
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "name" in err ? (err as { name: string }).name : "";
    if (code !== "NotFound" && code !== "NoSuchBucket") {
      throw err;
    }
  }

  await client.send(
    new CreateBucketCommand({
      Bucket: BUCKET_NAME,
    })
  );

  await client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET"],
            AllowedOrigins: ["https://domicoeats.com", "https://itsvoco.com"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  console.log(`[b2_dock] bucket ${BUCKET_NAME} created and CORS configured`);
}

export async function uploadAsset(
  objectKey: string,
  imageBuffer: Buffer,
  provenance: AssetProvenance,
  veracitySignature: string
): Promise<B2UploadResult> {
  const client = buildClient();

  const metadata: Record<string, string> = {
    "x-amz-meta-cook-id": provenance.cookId,
    "x-amz-meta-created-at": provenance.createdAt,
    "x-amz-meta-model-used": provenance.modelUsed,
    "x-amz-meta-factory-version": provenance.factoryVersion,
    "x-amz-meta-request-id": provenance.requestId,
    "x-amz-meta-veracity-signed": String(provenance.veracitySigned),
    "x-amz-meta-veracity-sig": veracitySignature.slice(0, 256),
  };

  const result = await client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: imageBuffer,
      ContentType: "image/png",
      Metadata: metadata,
    })
  );

  return {
    objectKey,
    bucketName: BUCKET_NAME,
    etag: result.ETag ?? "",
    versionId: result.VersionId,
  };
}

export async function generatePresignedUrl(
  objectKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = buildClient();

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function listAssetsByPrefix(prefix: string): Promise<string[]> {
  const client = buildClient();

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    })
  );

  return (response.Contents ?? []).map((obj) => obj.Key ?? "").filter(Boolean);
}

export const DOCK_CONFIG = {
  bucketName: BUCKET_NAME,
  endpoint: B2_ENDPOINT,
  factoryVersion: FACTORY_VERSION,
  region: "us-west-004",
} as const;
