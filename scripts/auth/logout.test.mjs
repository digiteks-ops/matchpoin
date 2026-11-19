import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  POST_LOGOUT_PATH,
  isAuthPath,
  isProtectedAppPath,
  isSupabaseAuthCookieName,
  loginPathFor,
  registerPathFor,
} from "../../src/lib/auth/protected-routes.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourcePath = (relativePath) => resolve(projectRoot, relativePath);

test("post-logout target is an existing login page", async () => {
  assert.equal(POST_LOGOUT_PATH, "/login");
  await access(sourcePath("src/app/(auth)/login/page.tsx"));
  await access(sourcePath("src/app/mysql/auth/login/page.tsx"));
});

test("logout route exists and clears Supabase session cookies", async () => {
  const source = await readFile(sourcePath("src/app/auth/logout/route.ts"), "utf8");

  assert.match(source, /signOut\(\)/);
  assert.match(source, /isSupabaseAuthCookieName/);
  assert.match(source, /POST_LOGOUT_PATH/);
  assert.match(source, /maxAge:\s*0/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
});

test("desktop and mobile nav share the working logout handler and links", async () => {
  const source = await readFile(sourcePath("src/components/layout/navbar.tsx"), "utf8");

  // The old links pointed at /auth/login and /auth/register, which do not exist.
  assert.equal(source.includes('"/auth/login"'), false);
  assert.equal(source.includes('"/auth/register"'), false);
  assert.match(source, /const loginHref = "\/login"/);
  assert.match(source, /const registerHref = "\/register"/);
  assert.match(source, /window\.location\.assign\("\/auth\/logout"\)/);

  // Desktop button and mobile drawer both use the same handler.
  assert.match(source, /onClick=\{handleLogout\}/);
  assert.match(source, /handleLogout\(\);/);
});

test("protected pages cannot be reached without a session", () => {
  const protectedPaths = [
    "/dashboard",
    "/profile",
    "/profile/edit",
    "/matches/new",
    "/matches/abc/result",
    "/admin",
    "/admin/settings",
    "/mysql/dashboard",
    "/mysql/profile",
    "/mysql/profile/edit",
    "/mysql/my-matches",
    "/mysql/invites",
    "/mysql/notifications",
    "/mysql/matches/new",
    "/mysql/matches/abc/result",
    "/mysql/admin",
  ];

  for (const pathname of protectedPaths) {
    assert.equal(isProtectedAppPath(pathname), true, `${pathname} should be protected`);
  }
});

test("public pages stay reachable without a session", () => {
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/profile-public",
    "/players",
    "/players/abc",
    "/matches",
    "/matches/abc",
    "/tournaments",
    "/leaderboard",
    "/league",
    "/mysql/auth/login",
    "/mysql/auth/register",
    "/mysql/auth/forgot-password",
    "/mysql/players",
    "/mysql/players/abc",
    "/mysql/matches",
    "/mysql/matches/abc",
    "/mysql/leaderboard",
    "/mysql/league",
    "/mysql/tournaments",
  ];

  for (const pathname of publicPaths) {
    assert.equal(isProtectedAppPath(pathname), false, `${pathname} should be public`);
  }
});

test("login redirects target routes that exist", async () => {
  assert.equal(loginPathFor("/mysql/dashboard"), "/login");
  assert.equal(loginPathFor("/dashboard"), "/login");
  assert.equal(registerPathFor("/mysql/dashboard"), "/register");
  assert.equal(registerPathFor("/dashboard"), "/register");

  await access(sourcePath("src/app/mysql/auth/login/page.tsx"));
  await access(sourcePath("src/app/(auth)/login/page.tsx"));
  await access(sourcePath("src/app/mysql/auth/register/page.tsx"));
  await access(sourcePath("src/app/(auth)/register/page.tsx"));
});

test("auth path detection includes every existing auth screen", () => {
  for (const pathname of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/login/anything",
  ]) {
    assert.equal(isAuthPath(pathname), true, `${pathname} should be an auth path`);
  }
  assert.equal(isAuthPath("/login-extra"), false);
  assert.equal(isAuthPath("/"), false);
});

test("Supabase session cookies are recognised including chunks and PKCE", () => {
  assert.equal(isSupabaseAuthCookieName("sb-project-ref-auth-token"), true);
  assert.equal(isSupabaseAuthCookieName("sb-project-ref-auth-token.0"), true);
  assert.equal(isSupabaseAuthCookieName("sb-project-ref-auth-token.10"), true);
  assert.equal(isSupabaseAuthCookieName("sb-project-ref-auth-token-code-verifier"), true);
  assert.equal(isSupabaseAuthCookieName("sb-project-ref-refresh-token"), false);
  assert.equal(isSupabaseAuthCookieName("next-auth.session-token"), false);
  assert.equal(isSupabaseAuthCookieName("theme"), false);
  assert.equal(isSupabaseAuthCookieName(""), false);
  assert.equal(isSupabaseAuthCookieName(null), false);
});

test("middleware enforces the shared protection rules", async () => {
  const middleware = await readFile(sourcePath("src/middleware.ts"), "utf8");
  const session = await readFile(sourcePath("src/lib/supabase/middleware.ts"), "utf8");

  assert.match(middleware, /await updateSession\(request\)/);
  assert.match(session, /isProtectedAppPath\(pathname\)/);
  assert.match(session, /loginPathFor\(pathname\)/);
});
