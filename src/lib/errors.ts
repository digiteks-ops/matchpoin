/**
 * Short, user-facing error messages.
 *
 * Rules:
 * - Never show raw database or stack-trace text to players.
 * - Keep one short sentence that names what failed and what to do.
 * - Technical detail goes to the developer log only (logError).
 */

export const ERROR_LOAD = "Gagal memuat data. Coba lagi.";
export const ERROR_CREATE_MATCH = "Pertandingan gagal dibuat.";
export const ERROR_INVITE = "Undangan gagal dikirim.";
export const ERROR_NETWORK = "Koneksi bermasalah. Periksa internet Anda.";
export const ERROR_GENERIC = "Terjadi kesalahan. Coba lagi.";

type ErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null;

export function logError(scope: string, error: unknown, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    console.error(`[${scope}]`, error);
    return;
  }
  console.error(`[${scope}]`, error, context ?? {});
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = (error as ErrorLike)?.message?.toLowerCase() ?? "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("econnrefused")
  );
}

/**
 * Maps an internal error to a short message safe to display.
 * `fallback` should describe the action the user was attempting.
 */
export function toUserMessage(error: unknown, fallback: string = ERROR_GENERIC): string {
  if (isOffline()) return ERROR_NETWORK;
  if (isNetworkError(error)) return ERROR_NETWORK;

  const code = (error as ErrorLike)?.code;
  switch (code) {
    case "42501":
      return fallback;
    case "23503":
      return "Data terkait tidak ditemukan.";
    case "23505":
      return "Data sudah ada.";
    case "PGRST116":
      return "Data tidak ditemukan.";
    default:
      break;
  }

  return fallback;
}

/**
 * Reads the `message` from a failed fetch Response, falling back to a short text.
 */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { message?: unknown };
    if (typeof json.message === "string" && json.message.trim()) return json.message;
  } catch {
    // ignore parse failures; fall through to the fallback
  }
  return fallback;
}