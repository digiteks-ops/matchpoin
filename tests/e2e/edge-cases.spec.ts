import {
  test,
  expect,
  login,
  playerCreds,
  requireEnv,
  serviceRest,
  userIdByEmail,
  openLeagueId,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "player account / service role is not configured"
);

test("double-clicking register creates exactly one pending entry", async ({ page }) => {
  const { email, password } = playerCreds();
  const leagueId = await openLeagueId();
  test.skip(!leagueId, "BLOCKED: no open league");
  const id = await userIdByEmail(email);

  await serviceRest(
    `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${id}`,
    { method: "DELETE" }
  );

  await login(page, email, password);
  await page.goto("/tournaments");
  const button = page.getByRole("button", { name: /^daftar$/i }).first();
  await Promise.all([button.click(), button.click({ force: true })]).catch(() => undefined);
  await page.waitForTimeout(3_000);

  const { body } = await serviceRest(
    `tournament_participants?select=id,status&tournament_id=eq.${leagueId}&user_id=eq.${id}`
  );
  expect(Array.isArray(body) ? body.length : 0).toBe(1);

  await serviceRest(
    `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${id}`,
    { method: "DELETE" }
  );
});

test("empty match list shows a friendly empty state", async ({ page }) => {
  await page.goto("/matches?date=1990-01-01");
  await expect(page.getByText(/tidak ada|belum ada/i).first()).toBeVisible({ timeout: 20_000 });
});

test("loading skeleton appears on a throttled network", async ({ page }) => {
  const client = await page.context().newCDPSession(page).catch(() => null);
  test.skip(!client, "BLOCKED: CDP network throttling is not available");
  await client!.send("Network.enable");
  await client!.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 1500,
    downloadThroughput: 50 * 1024,
    uploadThroughput: 20 * 1024,
  });
  await page.goto("/tournaments", { waitUntil: "commit" });
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible({ timeout: 20_000 });
});
