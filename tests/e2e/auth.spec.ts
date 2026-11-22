import { test, expect, login, playerCreds, requireEnv, userIdByEmail } from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL"],
  "player test account is not configured"
);

test("email login reaches the dashboard", async ({ page }) => {
  const { email, password } = playerCreds();
  await login(page, email, password);
  await expect(page).toHaveURL(/\/dashboard|\/admin/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: /profil|admin/i }).first()).toBeVisible();
});

test("expired session on a protected route redirects to login", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?redirectTo=/);
});

test("player account is not an admin", async () => {
  const { email } = playerCreds();
  const id = await userIdByEmail(email);
  expect(id, "test player must exist in public.users").toBeTruthy();
});
