const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB
const DEFAULT_MAX_DIMENSION = 1600;

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

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Gagal memproses gambar."));
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Compresses an image file to a JPEG that is at most `maxBytes` (default 1 MB).
 * The image is downscaled iteratively until it fits.
 */
export async function compressImageToLimit(
  file: File,
  maxBytes: number = DEFAULT_MAX_BYTES,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas harus berupa gambar (JPG, PNG, atau WEBP).");
  }

  const image = await loadImage(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("Dimensi gambar tidak valid.");
  }

  const initialScale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * initialScale));
  height = Math.max(1, Math.round(height * initialScale));

  let quality = 0.82;
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

    blob = await canvasToBlob(canvas, quality);

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
    throw new Error("Gambar gagal dikompres di bawah 1 MB. Silakan pilih gambar lain.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}