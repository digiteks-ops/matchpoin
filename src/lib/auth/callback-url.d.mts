/** Path formulir ganti kata sandi. */
export const PASSWORD_RECOVERY_PATH: string;

/** URL callback OAuth/pemulihan yang aman (hanya path internal). */
export function buildAuthCallbackUrl(origin: string, next?: string): string;

/** Path tujuan setelah pemulihan kata sandi selesai. */
export function passwordRecoveryNext(): string;