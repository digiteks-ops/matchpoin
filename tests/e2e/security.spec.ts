import {
  test,
  expect,
  playerCreds,
  requireEnv,
  supabaseAdminEnv,
  serviceRest,
  userIdByEmail,
  accessToken,
} from "./helpers";

requireEnv(
  test,
  ["TEST_PLAYER_EMAIL", "TEST_PLAYER_PASSWORD", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "player account / service role is not configured"
);

test("a player cannot promote themselves to admin", async () => {
  const { email, password } = playerCreds();
  const id = await userIdByEmail(email);
  const token = await accessToken(email, password);
  const { url, anonKey } = supabaseAdminEnv();

  const response = await fetch(`${url}/rest/v1/users?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ role: "admin" }),
  });
  expect(response.status).toBeGreaterThanOrEqual(400);

  const { body } = await serviceRest(`users?select=role&id=eq.${id}`);
  expect(Array.isArray(body) ? body[0]?.role : "player").toBe("player");
});

test("a player cannot read other players' registrations", async () => {
  const { email, password } = playerCreds();
  const id = await userIdByEmail(email);
  const token = await accessToken(email, password);
  const { url, anonKey } = supabaseAdminEnv();

  const response = await fetch(
    `${url}/rest/v1/tournament_participants?select=user_id,status&user_id=neq.${id}&limit=5`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }
  );
  const rows = await response.json();
  expect(Array.isArray(rows)).toBe(true);
  expect(rows).toHaveLength(0);
});

test("a player cannot read chat messages of other conversations", async () => {
  const { email, password } = playerCreds();
  const token = await accessToken(email, password);
  const { url, anonKey } = supabaseAdminEnv();

  const response = await fetch(`${url}/rest/v1/messages?select=id,conversation_id&limit=5`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const rows = await response.json();
  expect(Array.isArray(rows)).toBe(true);
  // Only messages of conversations the player belongs to may appear; a fresh
  // test account has none.
  expect(rows).toHaveLength(0);
});

test("storage rejects writes into another user's avatar folder", async () => {
  const { email, password } = playerCreds();
  const token = await accessToken(email, password);
  const { url, anonKey } = supabaseAdminEnv();
  const victimId = "00000000-0000-0000-0000-000000000001";

  const response = await fetch(`${url}/storage/v1/object/avatars/${victimId}/hack.png`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/png",
    },
    body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  expect(response.status).toBeGreaterThanOrEqual(400);
});
