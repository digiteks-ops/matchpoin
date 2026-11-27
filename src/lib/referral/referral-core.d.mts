export function normalizeReferralCode(value: unknown): string;
export function isReferralCode(value: unknown): boolean;
export function referralSignupPath(code: string | null | undefined): string;
export function referralSignupUrl(origin: string | null | undefined, code: string | null | undefined): string;