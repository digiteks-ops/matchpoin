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
  "two player accounts are required for the match chat flow"
);

const PREFIX = `E2E-MatchChat-${Date.now()}`;

// Alur ini membuat pertandingan, mengajukan slot, menerimanya, lalu membuka
// chat — di dev server setiap halaman baru dikompilasi saat pertama dibuka.
test.setTimeout(180_000);

test.afterAll(async () => {
  const { body } = await serviceRest(
    `matches?select=id&title=like.${encodeURIComponent(`${PREFIX}%`)}`
  );
  for (const row of Array.isArray(body) ? (body as Array<{ id: string }>) : []) {
    const { body: conversations } = await serviceRest(
      `conversations?select=id&match_id=eq.${row.id}`
    );
    for (const conversation of Array.isArray(conversations)
      ? (conversations as Array<{ id: string }>)
      : []) {
      await serviceRest(`messages?conversation_id=eq.${conversation.id}`, { method: "DELETE" });
      await serviceRest(`conversation_members?conversation_id=eq.${conversation.id}`, {
        method: "DELETE",
      });
      await serviceRest(`conversations?id=eq.${conversation.id}`, { method: "DELETE" });
    }
    await serviceRest(`notifications?reference_id=eq.${row.id}`, { method: "DELETE" });
  }
  await serviceRest(`matches?title=like.${encodeURIComponent(`${PREFIX}%`)}`, {
    method: "DELETE",
  });
});

/** Host membuat pertandingan; mengembalikan id + konteks pemain kedua. */
async function createMatchWithChallenger(page: Page, browser: Browser, label: string) {
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

  return { matchId: matchId as string, player2Id: player2Id as string, context2, page2 };
}

/** Pemain kedua mengajukan slot; host menerimanya sehingga jadi peserta. */
async function challengerBecomesParticipant(
  page: Page,
  page2: Page,
  matchId: string
) {
  await page2.goto(`/matches/${matchId}`);
  const joinResponse = page2.waitForResponse(
    (response) =>
      response.url().includes(`/api/matches/${matchId}/join`) &&
      response.request().method() === "POST"
  );
  await page2.getByRole("button", { name: /ajukan slot|gabung/i }).first().click();
  expect((await joinResponse).status()).toBe(200);

  await page.goto(`/matches/${matchId}`);
  const acceptResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/matches/${matchId}/accept`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^terima$/i }).first().click();
  expect((await acceptResponse).status()).toBe(200);
}

test("chat grup pertandingan bisa dibuka host dan dipakai semua peserta", async ({
  page,
  browser,
}) => {
  const { matchId, context2, page2 } = await createMatchWithChallenger(page, browser, "group");
  await challengerBecomesParticipant(page, page2, matchId);

  // Host membuka chat grup (semua peserta) dari halaman pertandingan.
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("button", { name: /chat semua peserta/i })).toBeVisible({
    timeout: 30_000,
  });
  const openResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /chat semua peserta/i }).click();
  expect((await openResponse).status()).toBe(200);

  await page.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 25_000 });
  const conversationId = page.url().match(/\/chat\/([0-9a-f-]{36})/)?.[1];
  expect(conversationId).toBeTruthy();

  // Host mengirim pesan pertama.
  const greeting = `${PREFIX} halo semua`;
  await page.getByLabel("Pesan").fill(greeting);
  const sendResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/chat/${conversationId}/messages`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /kirim/i }).click();
  expect((await sendResponse).status()).toBe(200);
  await expect(page.getByText(greeting)).toBeVisible({ timeout: 20_000 });

  // Peserta lain melihat percakapan beserta pesan terbarunya di daftar chat.
  await page2.goto("/chat");
  await expect(page2.getByText(greeting)).toBeVisible({ timeout: 25_000 });

  // Dan dapat membalas pada percakapan yang sama.
  await page2.goto(`/chat/${conversationId}`);
  const reply = `${PREFIX} siap main`;
  await page2.getByLabel("Pesan").fill(reply);
  await page2.getByRole("button", { name: /kirim/i }).click();
  await expect(page2.getByText(reply)).toBeVisible({ timeout: 20_000 });

  // Trigger 00010 memperbarui pratinjau pesan terbaru percakapan.
  await expect
    .poll(
      async () => {
        const { body } = await serviceRest(
          `conversations?select=last_message_preview&id=eq.${conversationId}`
        );
        return Array.isArray(body) ? body[0]?.last_message_preview ?? null : null;
      },
      { timeout: 20_000 }
    )
    .toBe(reply);

  await context2.close();
});

test("orang di luar pertandingan tidak bisa membuka chat pertandingan", async ({
  page,
  browser,
}) => {
  const { matchId, context2, page2 } = await createMatchWithChallenger(page, browser, "forbidden");

  // Host membuat percakapan grup lebih dulu.
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("button", { name: /chat semua peserta/i })).toBeVisible({
    timeout: 30_000,
  });
  const openResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/chat") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /chat semua peserta/i }).click();
  expect((await openResponse).status()).toBe(200);
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 25_000 });
  const conversationId = page.url().match(/\/chat\/([0-9a-f-]{36})/)?.[1];
  expect(conversationId).toBeTruthy();

  // Pemain kedua belum mengajukan/menerima slot, jadi bukan peserta: chat grup
  // pertandingan ditolak, dan percakapan orang lain tidak terbaca.
  const forbiddenOpen = await page2.request.post("/api/chat", { data: { matchId } });
  expect(forbiddenOpen.status()).toBe(400);
  const payload = (await forbiddenOpen.json()) as { success?: boolean; message?: string };
  expect(payload.success).toBe(false);
  expect(payload.message).toMatch(/peserta pertandingan/i);

  const forbiddenRead = await page2.request.get(`/api/chat/${conversationId}/messages`);
  expect(forbiddenRead.status()).toBe(404);

  await context2.close();
});