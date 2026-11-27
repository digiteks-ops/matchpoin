// Shared helpers for host referral links. Codes are stored uppercase and only
// contain letters/digits so they can survive URL copying and manual entry.

export function normalizeReferralCode(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

export function isReferralCode(value) {
  const code = normalizeReferralCode(value);
  return code.length >= 4 && code.length <= 16;
}

/** Path relatif untuk tombol/link di UI. */
export function referralSignupPath(code) {
  const normalized = normalizeReferralCode(code);
  return normalized ? `/register?ref=${encodeURIComponent(normalized)}` : "/register";
}

/** URL lengkap untuk disalin ke WhatsApp/media sosial. */
export function referralSignupUrl(origin, code) {
  const base = typeof origin === "string" ? origin.replace(/\/+$/, "") : "";
  return `${base}${referralSignupPath(code)}`;
}