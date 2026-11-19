export const POST_LOGOUT_PATH: string;

export function isProtectedAppPath(pathname: unknown): boolean;
export function isAuthPath(pathname: unknown): boolean;
export function loginPathFor(pathname: unknown): string;
export function registerPathFor(pathname: unknown): string;
export function isSupabaseAuthCookieName(name: unknown): boolean;
