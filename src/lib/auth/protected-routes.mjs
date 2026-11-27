const PRIMARY_PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/matches/new",
  "/notifications",
  "/chat",
  "/admin",
];

const MYSQL_PROTECTED_PREFIXES = [
  "/mysql/dashboard",
  "/mysql/profile",
  "/mysql/my-matches",
  "/mysql/invites",
  "/mysql/notifications",
  "/mysql/matches/new",
  "/mysql/admin",
];

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

const AUTH_RESULT_PATTERN = /^\/matches\/[^/]+\/result$/;
const MYSQL_AUTH_RESULT_PATTERN = /^\/mysql\/matches\/[^/]+\/result$/;
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-.*auth-token/i;

/** Path after a successful sign-out. `/login` exists in every backend mode. */
export const POST_LOGOUT_PATH = "/login";

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedAppPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  if (PRIMARY_PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }
  if (MYSQL_PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return true;
  }
  return AUTH_RESULT_PATTERN.test(pathname) || MYSQL_AUTH_RESULT_PATTERN.test(pathname);
}

export function isAuthPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  return AUTH_PATHS.some((path) => matchesPrefix(pathname, path));
}

export function loginPathFor(_pathname) {
  return "/login";
}

export function registerPathFor(_pathname) {
  return "/register";
}

/**
 * Matches the Supabase SSR session cookies, including chunked variants
 * (`sb-<ref>-auth-token.0`) and the PKCE code verifier.
 */
export function isSupabaseAuthCookieName(name) {
  return typeof name === "string" && SUPABASE_AUTH_COOKIE_PATTERN.test(name);
}
