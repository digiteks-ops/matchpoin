import {
  test,
  expect,
  login,
  playerCreds,
  player2Creds,
  requireEnv,
  serviceRest,
  userIdByEmail,
  supabaseAdminEnv,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"],
  "player account / service role is not configured"
);

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("avatar upload replaces the old file", async ({ page }) => {
  const player = playerCreds();
  await login(page, player.email, player.password);
  await page.goto("/profile/edit");

  const input = page.locator('input[type="file"]').first();
  test.skip((await input.count()) === 0, "BLOCKED: avatar file input not found");

  await input.setInputFiles({ name: "e2e-avatar.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/berhasil diperbarui/i)).toBeVisible({ timeout: 30_000 });

  const id = await userIdByEmail(player.email);
  const { body } = await serviceRest(`users?select=avatar_url&id=eq.${id}`);
  const firstUrl = Array.isArray(body) ? body[0]?.avatar_url : null;
  expect(firstUrl).toBeTruthy();

  await input.setInputFiles({ name: "e2e-avatar-2.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/berhasil diperbarui/i)).toBeVisible({ timeout: 30_000 });

  const { body: after } = await serviceRest(`users?select=avatar_url&id=eq.${id}`);
  const secondUrl = Array.isArray(after) ? after[0]?.avatar_url : null;
  expect(secondUrl).toBeTruthy();
  expect(secondUrl).not.toBe(firstUrl);

  const oldResponse = await fetch(firstUrl);
  expect([400, 403, 404]).toContain(oldResponse.status);
});

test("match-result upload is limited to a match participant", async ({ page }) => {
  const player = playerCreds();
  const player2 = player2Creds();
  test.skip(!player2.email, "BLOCKED: TEST_PLAYER2_* is required for the outsider check");
  await login(page, player.email, player.password);

  const matchId = "00000000-0000-0000-0000-000000000000";
  const { url, anonKey } = supabaseAdminEnv();
  await page.goto("/matches");
  const firstMatch = page.getByRole("link").filter({ hasText: /detail|lihat/i }).first();
  if ((await firstMatch.count()) === 0) {
    test.skip(true, "BLOCKED: no match available for the upload test");
  }
  await firstMatch.click();
  const currentMatchId = page.url().match(/\/matches\/([0-9a-f-]{36})/)?.[1] ?? matchId;

  // Outsider token writing into someone else's folder must be rejected.
  const { accessToken } = await import("./helpers");
  const outsiderId = await userIdByEmail(player2.email);
  const outsiderToken = await accessToken(player2.email, player2.password);
  const response = await fetch(
    `${url}/storage/v1/object/match-results/matches/${currentMatchId}/${outsiderId}/hack.png`,
    {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${outsiderToken}` },
      body: PNG,
    }
  );
  expect(response.status).toBeGreaterThanOrEqual(400);
});
