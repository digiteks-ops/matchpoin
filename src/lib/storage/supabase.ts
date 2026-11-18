import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const SIGNED_UPLOAD_TTL_SECONDS = 300;
const SIGNED_READ_TTL_SECONDS = 3600;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

let cachedAdminClient: ReturnType<typeof createSupabaseClient> | null = null;

export class InvalidSupabaseImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupabaseImageError";
  }
}

export class InvalidSupabaseDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSupabaseDocumentError";
  }
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function getAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  cachedAdminClient = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdminClient;
}

function bucketFor(kind: "avatar" | "evidence" | "tournament"): string {
  if (kind === "avatar") return process.env.SUPABASE_STORAGE_AVATARS_BUCKET ?? "avatars";
  if (kind === "evidence") return process.env.SUPABASE_STORAGE_EVIDENCE_BUCKET ?? "match-evidence";
  return process.env.SUPABASE_STORAGE_TOURNAMENT_BUCKET ?? "tournament-documents";
}

function extensionFor(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "application/pdf") return "pdf";
  throw new Error("Unsupported file type.");
}

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(contentType);
}

export function isAllowedDocumentType(contentType: string): boolean {
  return ALLOWED_DOCUMENT_TYPES.has(contentType);
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

function matchesPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function isOwnedEvidenceKey(key: string, matchId: string, userId: string): boolean {
  return key.startsWith(`matches/${matchId}/evidence/${userId}/`) && !key.includes("..");
}

export function isOwnedTournamentKey(key: string, tournamentId: string, userId: string): boolean {
  return key.startsWith(`tournaments/${tournamentId}/${userId}/`) && !key.includes("..");
}

export async function createImageUploadUrl(
  userId: string,
  contentType: string,
  size: number,
  scope: { kind: "avatar" } | { kind: "evidence"; matchId: string }
) {
  if (!isAllowedImageType(contentType)) throw new Error("Unsupported image type.");
  const maxBytes = scope.kind === "avatar" ? 5 * 1024 * 1024 : 1024 * 1024;
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) {
    throw new Error(`File size exceeds limit of ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  const extension = extensionFor(contentType);
  const bucket = bucketFor(scope.kind);
  const key =
    scope.kind === "avatar"
      ? `avatars/${userId}/${randomUUID()}.${extension}`
      : `matches/${scope.matchId}/evidence/${userId}/${randomUUID()}.${extension}`;

  const client = getAdminClient();
  const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(key);
  if (error) throw new Error(`Failed to create signed upload URL: ${error.message}`);
  return {
    objectKey: key,
    uploadUrl: data.signedUrl,
    expiresIn: SIGNED_UPLOAD_TTL_SECONDS,
    headers: { "Content-Type": contentType },
  };
}

export async function createDocumentUploadUrl(
  userId: string,
  contentType: string,
  size: number,
  tournamentId: string
) {
  if (!isAllowedDocumentType(contentType)) throw new Error("Unsupported document type.");
  const maxBytes = 10 * 1024 * 1024; // 10 MB for documents
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) {
    throw new Error(`File size exceeds limit of ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  const extension = extensionFor(contentType);
  const bucket = bucketFor("tournament");
  const key = `tournaments/${tournamentId}/${userId}/${randomUUID()}.${extension}`;

  const client = getAdminClient();
  const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(key);
  if (error) throw new Error(`Failed to create signed upload URL: ${error.message}`);
  return {
    objectKey: key,
    uploadUrl: data.signedUrl,
    expiresIn: SIGNED_UPLOAD_TTL_SECONDS,
    headers: { "Content-Type": contentType },
  };
}

export async function signAssetReadUrl(key: string): Promise<string> {
  if (!key || key.startsWith("/") || key.includes("..")) {
    throw new Error("Invalid object key.");
  }
  const client = getAdminClient();
  let bucket: string;
  if (key.startsWith("avatars/")) bucket = bucketFor("avatar");
  else if (key.startsWith("matches/")) bucket = bucketFor("evidence");
  else if (key.startsWith("tournaments/")) bucket = bucketFor("tournament");
  else throw new Error("Unknown key prefix.");
  const { data, error } = await client.storage.from(bucket).createSignedUrl(key, SIGNED_READ_TTL_SECONDS);
  if (error) throw new Error(`Failed to create signed read URL: ${error.message}`);
  return data.signedUrl;
}

export async function signAssetReadUrls(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map((key) => signAssetReadUrl(key)));
}

export async function signAvatarUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (!key.startsWith("avatars/")) {
    throw new Error("Invalid avatar key.");
  }
  return signAssetReadUrl(key);
}

export async function inspectImageObject(key: string) {
  const client = getAdminClient();
  const bucket = key.startsWith("avatars/") ? bucketFor("avatar") : bucketFor("evidence");
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error) throw new InvalidSupabaseImageError(`Failed to download object: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const contentType = data.type || "";
  const size = bytes.length;
  if (!isAllowedImageType(contentType) || size < 1 || size > 5 * 1024 * 1024) {
    throw new InvalidSupabaseImageError("Invalid image object or size exceeds limit.");
  }
  if (!matchesImageSignature(contentType, bytes.slice(0, 12))) {
    throw new InvalidSupabaseImageError("File content does not match declared image format.");
  }
  return { contentType, size };
}

export async function inspectDocumentObject(key: string) {
  const client = getAdminClient();
  const bucket = bucketFor("tournament");
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error) throw new InvalidSupabaseDocumentError(`Failed to download object: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const contentType = data.type || "";
  const size = bytes.length;
  if (!isAllowedDocumentType(contentType) || size < 1 || size > 10 * 1024 * 1024) {
    throw new InvalidSupabaseDocumentError("Invalid document object or size exceeds limit.");
  }
  if (contentType === "application/pdf" && !matchesPdfSignature(bytes.slice(0, 5))) {
    throw new InvalidSupabaseDocumentError("File content does not match PDF format.");
  }
  if (isAllowedImageType(contentType) && !matchesImageSignature(contentType, bytes.slice(0, 12))) {
    throw new InvalidSupabaseDocumentError("File content does not match declared image format.");
  }
  return { contentType, size };
}