import {
  test,
  expect,
  login,
  playerCreds,
  adminCreds,
  requireEnv,
  openLeagueId,
  playerGender,
  userIdByEmail,
  acceptedEntryCount,
  serviceRest,
} from "./helpers";

requireEnv(
  test,
  [
    "TEST_PLAYER_EMAIL",
    "TEST_PLAYER_PASSWORD",
    "TEST_ADMIN_EMAIL",
    "TEST_ADMIN_PASSWORD",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  "player + admin accounts are required for the registration flow"
);

test("register -> admin accept -> player sees accepted; quota counts accepted only", async ({
  page,
  browser,
}) => {
  const player = playerCreds();
  const admin = adminCreds();
  const gender = await playerGender(player.email);
  test.skip(!gender, "BLOCKED: test player has no gender set (needed to pick a category)");
  const leagueId = await openLeagueId(gender === "female" ? "womens_singles" : "mens_singles");
  test.skip(!leagueId, "BLOCKED: no matching league with status registration_open");

  const before = await acceptedEntryCount(leagueId!);
  const playerId = await userIdByEmail(player.email);

  // Clean any leftover registration for this account so the run is repeatable.
  if (playerId) {
    await serviceRest(
      `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${playerId}`,
      { method: "DELETE" }
    );
  }

  await login(page, player.email, player.password);
  await page.goto("/tournaments");
  // Open the card for the player's own gender so the RPC accepts the entry.
  const categoryLabel = gender === "female" ? "Single Woman" : "Single Man";
  const card = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: categoryLabel, exact: true }) })
    .filter({ has: page.getByRole("button", { name: /^daftar$/i }) })
    .last();
  test.skip((await card.count()) === 0, "BLOCKED: category card not found on the page");
  await card.getByRole("button", { name: /^daftar$/i }).click();
  await page.getByRole("button", { name: /kirim pendaftaran/i }).click();
  await expect(page.getByText(/menunggu persetujuan|menunggu/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, admin.email, admin.password);
  await adminPage.goto("/admin/tournaments");
  await adminPage.getByRole("button", { name: /setujui/i }).first().click();
  await expect(adminPage.getByText(/diterima|disetujui/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const after = await acceptedEntryCount(leagueId!);
  expect(after).toBe(before + 1);

  await page.reload();
  await expect(page.getByText(/diterima|disetujui/i).first()).toBeVisible({ timeout: 20_000 });

  // Cleanup: remove the accepted test registration.
  if (playerId) {
    await serviceRest(
      `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${playerId}`,
      { method: "DELETE" }
    );
  }
  await adminContext.close();
});

test("admin can decline with an empty reason", async ({ page }) => {
  const admin = adminCreds();
  await login(page, admin.email, admin.password);
  await page.goto("/admin/tournaments");
  const decline = page.getByRole("button", { name: /^tolak$/i }).first();
  if ((await decline.count()) === 0) {
    test.skip(true, "BLOCKED: no pending registration to decline");
  }
  await decline.click();
  await page.getByRole("button", { name: /tolak & kirim notifikasi/i }).click();
  await expect(page.getByText(/ditolak/i).first()).toBeVisible({ timeout: 20_000 });
});
