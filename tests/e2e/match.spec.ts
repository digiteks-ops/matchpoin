import {
  test,
  expect,
  login,
  playerCreds,
  player2Creds,
  requireEnv,
  createOpenMatchViaUi,
  serviceRest,
  userIdByEmail,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL"],
  "player account is not configured"
);

const PREFIX = `E2E-Open-${Date.now()}`;

test.afterAll(async () => {
  await serviceRest(`matches?title=like.${encodeURIComponent(`${PREFIX}%`)}`, {
    method: "DELETE",
  });
});

test("host creates a singles match with an open opponent slot", async ({ page }) => {
  const player = playerCreds();
  await login(page, player.email, player.password);
  await createOpenMatchViaUi(page, `${PREFIX} singles`);
  await expect(page).toHaveURL(/\/matches\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.getByText(/terbuka/i).first()).toBeVisible();
});

test("second account joins the open slot", async ({ page, browser }) => {
  const player = playerCreds();
  const player2 = player2Creds();
  test.skip(!player2.email || !player2.password, "BLOCKED: TEST_PLAYER2_* is not configured");

  await login(page, player.email, player.password);
  await createOpenMatchViaUi(page, `${PREFIX} joinable`);
  const matchId = page.url().match(/\/matches\/([0-9a-f-]{36})/)?.[1];
  expect(matchId).toBeTruthy();

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await login(page2, player2.email, player2.password);
  await page2.goto(`/matches/${matchId}`);
  await page2.getByRole("button", { name: /gabung/i }).first().click();
  await expect(page2.getByText(/bergabung|terdaftar|menunggu/i).first()).toBeVisible({
    timeout: 20_000,
  });
  await context2.close();
});

test("three concurrent joins on one slot: exactly one succeeds", async ({ page, browser }) => {
  const player = playerCreds();
  const player2 = player2Creds();
  test.skip(!player2.email || !player2.password, "BLOCKED: TEST_PLAYER2_* is not configured");

  await login(page, player.email, player.password);
  await createOpenMatchViaUi(page, `${PREFIX} race`);
  const matchId = page.url().match(/\/matches\/([0-9a-f-]{36})/)?.[1];
  expect(matchId).toBeTruthy();

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await login(page2, player2.email, player2.password);

  const responses = await Promise.all([
    page2.request.post(`/api/matches/${matchId}/join`),
    page2.request.post(`/api/matches/${matchId}/join`),
    page2.request.post(`/api/matches/${matchId}/join`),
  ]);
  const success = responses.filter((response) => response.status() === 200).length;
  expect(success).toBe(1);

  const { body } = await serviceRest(
    `match_participants?select=user_id&match_id=eq.${matchId}&left_at=is.null`
  );
  const player2Id = await userIdByEmail(player2.email);
  const joins = Array.isArray(body)
    ? body.filter((row: { user_id: string }) => row.user_id === player2Id).length
    : 0;
  expect(joins).toBe(1);
  await context2.close();
});
