import { randomUUID } from "node:crypto";
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SIGNED_UPLOAD_TTL_SECONDS = 300;
const SIGNED_READ_TTL_SECONDS = 3600;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

let cached: { client: S3Client; bucket: string } | null = null;

export class InvalidR2ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidR2ImageError";
  }
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME?.trim()
  );
}

function getR2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function getClient() {
  if (cached) return cached;
  const config = getR2Configuration();
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cached = { client, bucket: config.bucket };
  return cached;
}

function extensionFor(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  throw new Error("Jenis file gambar tidak didukung.");
}

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}

function matchesImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    contentType === "image/webp" &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function isOwnedEvidenceKey(key: string, matchId: string, userId: string): boolean {
  return key.startsWith(`matches/${matchId}/evidence/${userId}/`) && !key.includes("..");
}

export async function createImageUploadUrl(
  userId: string,
  contentType: string,
  size: number,
  scope: { kind: "avatar" } | { kind: "evidence"; matchId: string }
) {
  if (!isAllowedImageType(contentType)) throw new Error("Jenis file gambar tidak didukung.");
  const maxBytes = scope.kind === "avatar" ? 5 * 1024 * 1024 : 1024 * 1024;
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) {
    throw new Error(`Ukuran foto melebihi batas ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  const extension = extensionFor(contentType);
  const key =
    scope.kind === "avatar"
      ? `avatars/${userId}/${randomUUID()}.${extension}`
      : `matches/${scope.matchId}/evidence/${userId}/${randomUUID()}.${extension}`;
  const { client, bucket } = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  return {
    objectKey: key,
    uploadUrl: await getSignedUrl(client, command, { expiresIn: SIGNED_UPLOAD_TTL_SECONDS }),
    expiresIn: SIGNED_UPLOAD_TTL_SECONDS,
    headers: { "Content-Type": contentType },
  };
}

export async function signAssetReadUrl(key: string): Promise<string> {
  if (!key || key.startsWith("/") || key.includes("..")) {
    throw new Error("Kunci objek tidak valid.");
  }
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: SIGNED_READ_TTL_SECONDS }
  );
}

export async function signAssetReadUrls(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map((key) => signAssetReadUrl(key)));
}

export async function signAvatarUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (!key.startsWith("avatars/")) {
    throw new Error("Kunci foto profil tidak valid.");
  }
  return signAssetReadUrl(key);
}

export async function inspectImageObject(key: string) {
  const { client, bucket } = getClient();
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const contentType = result.ContentType ?? "";
  const size = result.ContentLength ?? 0;
  if (!isAllowedImageType(contentType) || size < 1 || size > 5 * 1024 * 1024) {
    throw new InvalidR2ImageError("Objek gambar tidak valid atau ukurannya melebihi batas.");
  }
  const firstBytes = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-11" })
  );
  const signature = firstBytes.Body ? await firstBytes.Body.transformToByteArray() : new Uint8Array();
  if (!matchesImageSignature(contentType, signature)) {
    throw new InvalidR2ImageError("Isi file tidak sesuai dengan format gambar yang dinyatakan.");
  }
  return { contentType, size };
}
