import {
  test,
  expect,
  login,
  playerCreds,
  requireEnv,
  serviceRest,
  userIdByEmail,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"],
  "player account / service role is not configured"
);

test("profile save persists and accepts a very long name", async ({ page }) => {
  const { email, password } = playerCreds();
  await login(page, email, password);
  await page.goto("/profile/edit");

  const id = await userIdByEmail(email);
  const { body } = await serviceRest(`users?select=full_name&id=eq.${id}`);
  const originalName = Array.isArray(body) ? body[0]?.full_name ?? "" : "";

  const longName = `E2E-${"Nama Panjang ".repeat(12)}`.trim().slice(0, 120);
  const nameInput = page.getByLabel(/nama lengkap|nama/i).first();
  await nameInput.fill(longName);
  await page.getByRole("button", { name: /simpan/i }).first().click();
  await expect(page.getByText(/berhasil|tersimpan/i).first()).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel(/nama lengkap|nama/i).first()).toHaveValue(longName);

  // Restore the account name so reruns stay deterministic.
  if (id) {
    await serviceRest(`users?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ full_name: originalName || email }),
    });
  }
});
