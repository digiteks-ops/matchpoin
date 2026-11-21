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

  // The users.full_name column is VARCHAR(100); the input caps at 100 chars.
  const longName = `E2E ${"Nama Panjang ".repeat(6)}`.slice(0, 50).trim();
  const expected = longName;
  // Required selects must be filled before the profile can be saved.
  for (const id of ["#province", "#city", "#gender"]) {
    const select = page.locator(id);
    if ((await select.count()) > 0) {
      const value = await select.inputValue();
      if (!value) await select.selectOption({ index: 1 });
    }
  }
  const nameInput = page.locator("#fullName");
  await nameInput.fill(longName);
  await page.getByRole("button", { name: /simpan profil pemain/i }).click();
  // A successful save navigates from /profile/edit to /profile.
  await page.waitForURL(/\/profile$/, { timeout: 25_000 });
  await page.goto("/profile/edit");
  await expect(page.locator("#fullName")).toHaveValue(expected);

  // Restore the account name so reruns stay deterministic.
  if (id) {
    const restore = originalName || email;
    await serviceRest(`users?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ full_name: restore }),
    });
    await serviceRest(`player_profiles?user_id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ display_name: restore }),
    });
  }
});
