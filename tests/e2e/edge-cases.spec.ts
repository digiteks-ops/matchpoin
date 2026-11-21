import {
  test,
  expect,
  login,
  playerCreds,
  requireEnv,
  serviceRest,
  userIdByEmail,
  playerGender,
  openLeagueId,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "player account / service role is not configured"
);

test("double-clicking submit creates exactly one pending entry", async ({ page }) => {
  const { email, password } = playerCreds();
  const gender = await playerGender(email);
  test.skip(!gender, "BLOCKED: test player has no gender set");
  const leagueId = await openLeagueId(gender === "female" ? "womens_singles" : "mens_singles");
  test.skip(!leagueId, "BLOCKED: no matching open league");
  const id = await userIdByEmail(email);

  await serviceRest(
    `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${id}`,
    { method: "DELETE" }
  );

  await login(page, email, password);
  await page.goto("/tournaments");
  const categoryLabel = gender === "female" ? "Single Woman" : "Single Man";
  const card = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: categoryLabel, exact: true }) })
    .filter({ has: page.getByRole("button", { name: /^daftar$/i }) })
    .last();
  test.skip((await card.count()) === 0, "BLOCKED: category card not found");
  await card.getByRole("button", { name: /^daftar$/i }).click();
  const submit = page.getByRole("button", { name: /kirim pendaftaran/i });
  await Promise.all([submit.click(), submit.click({ force: true })]).catch(() => undefined);
  await page.waitForTimeout(4_000);

  const { body } = await serviceRest(
    `tournament_participants?select=id,status&tournament_id=eq.${leagueId}&user_id=eq.${id}`
  );
  expect(Array.isArray(body) ? body.length : 0).toBe(1);

  await serviceRest(
    `tournament_participants?tournament_id=eq.${leagueId}&user_id=eq.${id}`,
    { method: "DELETE" }
  );
});

test("empty search shows a friendly empty state", async ({ page }) => {
  await page.goto("/players");
  await page.getByPlaceholder(/cari nama pemain/i).fill("zzzznotexist");
  await expect(page.getByText(/tidak ada pemain ditemukan/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
