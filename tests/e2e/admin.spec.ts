import { test, expect, login, playerCreds, adminCreds, requireEnv } from "./helpers";

requireEnv(
  test,
  [
    "TEST_PLAYER_EMAIL",
    "TEST_PLAYER_PASSWORD",
    "TEST_ADMIN_EMAIL",
    "TEST_ADMIN_PASSWORD",
  ],
  "player + admin accounts are required"
);

test("non-admin cannot open /admin", async ({ page }) => {
  const player = playerCreds();
  await login(page, player.email, player.password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard|\/login/, { timeout: 20_000 });
  await expect(page.getByText(/matchpoin admin/i)).toHaveCount(0);
});

test("non-admin status-change API returns 401/403", async ({ page }) => {
  const player = playerCreds();
  await login(page, player.email, player.password);
  const response = await page.request.post(
    "/api/admin/tournaments/registrations/00000000-0000-0000-0000-000000000000/approve",
    { data: {} }
  );
  expect([401, 403]).toContain(response.status());
});

test("admin sees the admin shell and registration tools", async ({ page }) => {
  const admin = adminCreds();
  await login(page, admin.email, admin.password);
  await page.goto("/admin");
  await expect(page.getByText(/matchpoin admin/i)).toBeVisible({ timeout: 20_000 });
  await page.goto("/admin/tournaments");
  await expect(page.getByRole("heading", { name: /manajemen turnamen/i })).toBeVisible();
});

test("admin settings tabs load the section selected by the URL", async ({ page }) => {
  const admin = adminCreds();
  await login(page, admin.email, admin.password);

  const sections: Array<[string, RegExp]> = [
    ["overview", /statistik cepat/i],
    ["users", /daftar pengguna & role/i],
    ["players", /direktori pemain publik/i],
    ["matches", /daftar pertandingan/i],
    ["tournaments", /turnamen liga \(liga tennis ika 17\)/i],
  ];

  for (const [tab, section] of sections) {
    await page.goto(`/admin/settings?tab=${tab}`);
    await expect(page.getByText(section).first()).toBeVisible({ timeout: 20_000 });
  }

  await page.getByRole("tab", { name: /manajemen pengguna/i }).click();
  await expect(page).toHaveURL(/tab=users/);
  await expect(page.getByText(/daftar pengguna & role/i).first()).toBeVisible();
});
