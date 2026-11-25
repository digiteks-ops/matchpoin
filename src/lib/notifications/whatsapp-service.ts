import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errors";
import { normalizeWhatsappNumber } from "./whatsapp-core.mjs";

/**
 * Pengiriman WhatsApp lewat penyedia gateway (Fonnte/Wablas-compatible).
 *
 * Konfigurasi lewat environment — tanpa nilai di bawah, semua pengiriman
 * dilewati dengan tenang (tanpa error) supaya alur pendaftaran dan tantangan
 * tetap berjalan meski gateway belum dipasang:
 *
 *   WHATSAPP_API_URL     endpoint kirim, mis. https://api.fonnte.com/send
 *   WHATSAPP_API_TOKEN   token penyedia
 *   WHATSAPP_API_STYLE   `form` (default, Fonnte) atau `json` (Wablas/generik)
 *
 * Pesan gagal TIDAK PERNAH menggagalkan aksi utama: pemanggil hanya mencatat
 * log. Notifikasi WhatsApp adalah pelengkap, bukan syarat.
 */

export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_API_URL?.trim() && process.env.WHATSAPP_API_TOKEN?.trim());
}

export interface SendWhatsappResult {
  sent: boolean;
  /** Alasan saat `sent` false — untuk log, bukan untuk ditampilkan ke pengguna. */
  reason?: string;
}

/**
 * Mengirim satu pesan WhatsApp ke nomor tujuan.
 * Nomor dinormalkan ke `628...`; nomor tidak sah dianggap gagal kirim.
 */
export async function sendWhatsappMessage(
  target: string | null | undefined,
  message: string
): Promise<SendWhatsappResult> {
  const to = normalizeWhatsappNumber(target ?? "");
  if (!to) return { sent: false, reason: "nomor-tidak-sah" };
  if (!message.trim()) return { sent: false, reason: "pesan-kosong" };
  if (!isWhatsappConfigured()) return { sent: false, reason: "gateway-belum-dikonfigurasi" };

  const url = process.env.WHATSAPP_API_URL!.trim();
  const token = process.env.WHATSAPP_API_TOKEN!.trim();
  const style = (process.env.WHATSAPP_API_STYLE ?? "form").trim().toLowerCase();

  try {
    const init: RequestInit =
      style === "json"
        ? {
            method: "POST",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ phone: to, message }),
          }
        : (() => {
            const body = new FormData();
            body.append("target", to);
            body.append("message", message);
            return {
              method: "POST" as const,
              headers: { Authorization: token },
              body,
            };
          })();

    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return { sent: false, reason: `http-${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "gagal-kirim" };
  }
}

/**
 * Mengambil nomor WhatsApp seorang pemain dari `public.users.phone`.
 * Memakai service role karena baris milik pemain lain tidak terbaca RLS.
 * Mengembalikan null bila pemain belum mengisi nomor.
 */
export async function getPlayerWhatsappNumber(userId: string): Promise<string | null> {
  if (!userId) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("users")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      logError("whatsapp.lookup", error, { userId });
      return null;
    }
    const normalized = normalizeWhatsappNumber((data as { phone?: string | null } | null)?.phone ?? "");
    return normalized || null;
  } catch (error) {
    logError("whatsapp.lookup", error, { userId });
    return null;
  }
}

/**
 * Kirim notifikasi WhatsApp bahwa seorang host menantang lawan.
 * Diam-diam tidak melakukan apa pun bila gateway belum aktif atau lawan belum
 * mencantumkan nomor WhatsApp — pertandingan tetap dibuat.
 */
export async function notifyChallengeViaWhatsapp(input: {
  inviteeId: string;
  message: string;
}): Promise<void> {
  if (!isWhatsappConfigured()) return;
  try {
    const number = await getPlayerWhatsappNumber(input.inviteeId);
    if (!number) return;
    const result = await sendWhatsappMessage(number, input.message);
    if (!result.sent) {
      logError("whatsapp.challenge", new Error(result.reason ?? "gagal"), {
        inviteeId: input.inviteeId,
      });
    }
  } catch (error) {
    logError("whatsapp.challenge", error, { inviteeId: input.inviteeId });
  }
}