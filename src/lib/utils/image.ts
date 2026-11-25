const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB (legacy helper)
const DEFAULT_MAX_DIMENSION = 1600;

export const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CompressMimeType = "image/webp" | "image/jpeg";

export interface CompressImageOptions {
  /** Target size after compression. Default 300 KB. */
  maxBytes?: number;
  /** Longest side in pixels. Default 1280 (avatars should pass 512). */
  maxDimension?: number;
  /** Initial quality. Default 0.8. */
  quality?: number;
  /** Output format. Default WebP (JPEG fallback when the browser cannot encode it). */
  mimeType?: CompressMimeType;
}

export function assertValidImageFile(file: File): void {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Format foto harus JPG, PNG, atau WEBP.");
  }
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
    throw new Error("Ukuran foto asli maksimal 10 MB.");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas gambar tidak dapat dibaca."));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: CompressMimeType,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Gagal memproses gambar."));
      },
      type,
      quality
    );
  });
}

/**
 * Compresses an image in the browser before upload: downscale, convert to
 * WebP/JPEG and iterate until it fits `maxBytes` (default 300 KB).
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  assertValidImageFile(file);

  const maxBytes = options.maxBytes ?? 300 * 1024;
  const maxDimension = options.maxDimension ?? 1280;
  const targetType: CompressMimeType = options.mimeType ?? "image/webp";

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error("Dimensi gambar tidak valid.");
  }

  const initialScale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * initialScale));
  height = Math.max(1, Math.round(height * initialScale));

  let quality = options.quality ?? 0.8;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar.");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    blob = await canvasToBlob(canvas, targetType, quality);

    if (blob.size <= maxBytes) break;

    if (quality > 0.42) {
      quality = Math.max(0.4, quality - 0.12);
    } else {
      width = Math.max(1, Math.round(width * 0.78));
      height = Math.max(1, Math.round(height * 0.78));
      quality = 0.72;
    }
  }

  if (!blob) throw new Error("Gagal mengompres gambar.");
  if (blob.size > maxBytes) {
    const limitKb = Math.round(maxBytes / 1024);
    throw new Error(`Gambar gagal dikompres di bawah ${limitKb} KB. Silakan pilih gambar lain.`);
  }

  const actualType: CompressMimeType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
  const extension = actualType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${baseName}.${extension}`, {
    type: actualType,
    lastModified: Date.now(),
  });
}

/**
 * Legacy helper kept for existing callers: JPEG output constrained to `maxBytes`.
 */
export async function compressImageToLimit(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<File> {
  return compressImage(file, {
    maxBytes,
    maxDimension,
    quality: 0.82,
    mimeType: "image/jpeg",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Normalisasi URL gambar tinggal di modul murni supaya bisa diuji `node --test`.
export { normalizeImageUrl } from "./image-url-core.mjs";
