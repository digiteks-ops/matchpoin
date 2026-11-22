import type { Browser, Page } from "@playwright/test";
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
  [
    "TEST_PLAYER_EMAIL",
    "TEST_PLAYER_PASSWORD",
    "TEST_PLAYER2_EMAIL",
    "TEST_PLAYER2_PASSWORD",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  "two player accounts are required for the host approval flow"
);

const PREFIX = `E2E-Approval-${Date.now()}`;

test.afterAll(async () => {
  await serviceRest(`matches?title=like.${encodeURIComponent(`${PREFIX}%`)}`, {
    method: "DELETE",
  });
});

async function createJoinableMatch(page: Page, browser: Browser, label: string) {
  const player = playerCreds();
  const player2 = player2Creds();
  await login(page, player.email, player.password);
  await createOpenMatchViaUi(page, `${PREFIX} ${label}`);
  const matchId = page.url().match(/\/matches\/([0-9a-f-]{36})/)?.[1];
  expect(matchId).toBeTruthy();

  const player2Id = await userIdByEmail(player2.email);
  expect(player2Id).toBeTruthy();

  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await login(page2, player2.email, player2.password);
  await page2.goto(`/matches/${matchId}`);
  const joinResponse = page2.waitForResponse(
    (response) =>
      response.url().includes(`/api/matches/${matchId}/join`) &&
      response.request().method() === "POST"
  );
  await page2.getByRole("button", { name: /ajukan slot|gabung/i }).first().click();
  expect((await joinResponse).status()).toBe(200);
  await expect(page2.getByText(/menunggu persetujuan host/i).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("heading", { name: /permohonan bergabung/i })).toBeVisible({
    timeout: 20_000,
  });

  return { matchId: matchId as string, player2Id: player2Id as string, context2 };
}

test("host receives a pending join request and can approve it", async ({ page, browser }) => {
  const { matchId, player2Id, context2 } = await createJoinableMatch(page, browser, "accept");

  const acceptResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/matches/${matchId}/accept`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^terima$/i }).first().click();
  expect((await acceptResponse).status()).toBe(200);

  const { body } = await serviceRest(
    `match_participants?select=metadata&match_id=eq.${matchId}&user_id=eq.${player2Id}`
  );
  const status = Array.isArray(body) ? body[0]?.metadata?.status : null;
  expect(status).toBe("confirmed");

  await serviceRest(`notifications?reference_id=eq.${matchId}`, { method: "DELETE" });
  await serviceRest(`matches?id=eq.${matchId}`, { method: "DELETE" });
  await context2.close();
});

test("host can reject a pending join request", async ({ page, browser }) => {
  const { matchId, player2Id, context2 } = await createJoinableMatch(page, browser, "reject");

  const rejectResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/matches/${matchId}/reject`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^tolak$/i }).first().click();
  expect((await rejectResponse).status()).toBe(200);

  const { body } = await serviceRest(
    `match_participants?select=metadata&match_id=eq.${matchId}&user_id=eq.${player2Id}`
  );
  const status = Array.isArray(body) ? body[0]?.metadata?.status : null;
  expect(status).toBe("rejected");

  await serviceRest(`notifications?reference_id=eq.${matchId}`, { method: "DELETE" });
  await serviceRest(`matches?id=eq.${matchId}`, { method: "DELETE" });
  await context2.close();
});
