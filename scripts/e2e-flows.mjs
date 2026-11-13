/**
 * End-to-end verification for MATCHPOIN flows against the running server.
 * Creates throwaway auth users, exercises the HTTP API, then cleans up.
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(process.cwd() + "/.env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = new URL(SUPA).hostname.split(".")[0];
const APP = "http://localhost:3000";
const CHUNK = 3180;

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const results = [];
const created = { auth: [], matches: [] };

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` â€” ${detail}` : ""}`);
}

async function j(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

async function createUser(label, withRecords = true) {
  const email = `kilo.e2e.${label}.${Date.now()}@example.com`;
  const password = "E2e!Passw0rd";
  const createdUser = await j(`${SUPA}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${label}` },
    }),
  });
  const user = createdUser.body;
  created.auth.push(user.id);

  if (!withRecords) {
    const session = await j(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { id: user.id, email, session: session.body, withRecords: false };
  }

  await j(`${SUPA}/rest/v1/users`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      id: user.id,
      email,
      full_name: `E2E ${label}`,
      timezone: "Asia/Makassar",
      locale: "id",
    }),
  });
  await j(`${SUPA}/rest/v1/player_profiles`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: user.id,
      display_name: `E2E ${label}`,
      completion_score: 60,
      is_profile_public: true,
      profile_visibility: "public",
      allow_invites: true,
    }),
  });
  await j(`${SUPA}/rest/v1/player_ratings`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user.id, current_rating: 5, peak_rating: 5 }),
  });

  const session = await j(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return { id: user.id, email, session: session.body, withRecords };
}

function cookieHeader(session) {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const key = `sb-${REF}-auth-token`;
  if (encoded.length <= CHUNK) return `${key}=${encoded}`;
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) {
    parts.push(`${key}.${i / CHUNK}=${encoded.slice(i, i + CHUNK)}`);
  }
  return parts.join("; ");
}

const baseHeaders = { "Content-Type": "application/json" };

async function main() {
  const organizer = await createUser("organizer");
  const invitee = await createUser("invitee");
  const decliner = await createUser("decliner");
  record("setup: users created", Boolean(organizer.session.access_token && invitee.session.access_token));

  const organizerCookie = cookieHeader(organizer.session);
  const inviteeCookie = cookieHeader(invitee.session);
  const declinerCookie = cookieHeader(decliner.session);

  // --- Create match -------------------------------------------------------
  const courts = await j(
    `${SUPA}/rest/v1/tennis_courts?select=id&status=eq.available&limit=1`,
    { headers: admin }
  );
  const courtId = courts.body[0].id;

  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const created1 = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      title: "E2E Duel Tunggal",
      courtId,
      matchDate: future,
      startTime: "16:00",
      durationMinutes: 90,
      category: "mens_singles",
      umpireOption: "tanpa_wasit",
      level: "all",
    }),
  });
  const matchId = created1.body?.matchId;
  if (matchId) created.matches.push(matchId);
  record("create match", created1.res.status === 200 && Boolean(matchId), `status=${created1.res.status}`);

  const detail = await j(`${APP}/matches/${matchId}`, { headers: { Cookie: organizerCookie } });
  record("match detail renders", detail.res.status === 200 && detail.text.includes("E2E Duel Tunggal"));

  // --- Invite -------------------------------------------------------------
  const invite = await j(`${APP}/api/matches/${matchId}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ inviteeId: invitee.id }),
  });
  const inviteId = invite.body?.inviteId;
  record("send invite", invite.res.status === 200 && Boolean(inviteId), `status=${invite.res.status} ${invite.body?.message ?? ""}`);

  const duplicate = await j(`${APP}/api/matches/${matchId}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ inviteeId: invitee.id }),
  });
  record(
    "duplicate invite rejected",
    duplicate.res.status === 400 && duplicate.body?.message === "Pemain ini sudah diundang.",
    `status=${duplicate.res.status} ${duplicate.body?.message ?? ""}`
  );

  // --- Invitee sees the invite on the dashboard ---------------------------
  const dashboard = await j(`${APP}/dashboard`, { headers: { Cookie: inviteeCookie } });
  record(
    "dashboard shows invite",
    dashboard.res.status === 200 &&
      dashboard.text.includes("Undangan") &&
      dashboard.text.includes("E2E Duel Tunggal"),
    `status=${dashboard.res.status}`
  );

  const selfInvite = await j(`${APP}/api/matches/${matchId}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: inviteeCookie },
    body: JSON.stringify({ inviteeId: organizer.id }),
  });
  record("non-organizer cannot invite", selfInvite.res.status === 400, `status=${selfInvite.res.status}`);

  // --- Accept -------------------------------------------------------------
  const accept = await j(`${APP}/api/invites/${inviteId}/respond`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: inviteeCookie },
    body: JSON.stringify({ action: "accept" }),
  });
  record("accept invite", accept.res.status === 200, `status=${accept.res.status} ${accept.body?.message ?? ""}`);

  const afterAccept = await j(
    `${SUPA}/rest/v1/match_participants?id=eq.${inviteId}&select=metadata`,
    { headers: admin }
  );
  record(
    "invite row confirmed",
    afterAccept.body[0]?.metadata?.status === "confirmed",
    JSON.stringify(afterAccept.body[0]?.metadata)
  );

  const detailAfter = await j(`${APP}/matches/${matchId}`, { headers: { Cookie: inviteeCookie } });
  record(
    "invitee sees match as participant",
    detailAfter.res.status === 200 && detailAfter.text.includes("E2E invitee")
  );

  const doubleAccept = await j(`${APP}/api/invites/${inviteId}/respond`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: inviteeCookie },
    body: JSON.stringify({ action: "accept" }),
  });
  record("repeat accept rejected", doubleAccept.res.status === 400, `status=${doubleAccept.res.status}`);

  // --- Decline (separate doubles match so capacity is not the blocker) ------
  const created2 = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      title: "E2E Duel Ganda",
      courtId,
      matchDate: future,
      startTime: "18:00",
      durationMinutes: 90,
      category: "mens_doubles",
      umpireOption: "tanpa_wasit",
      level: "all",
    }),
  });
  const match2Id = created2.body?.matchId;
  if (match2Id) created.matches.push(match2Id);
  record("second match created", created2.res.status === 200 && Boolean(match2Id), `status=${created2.res.status}`);

  const invite2 = await j(`${APP}/api/matches/${match2Id}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ inviteeId: decliner.id }),
  });
  const invite2Id = invite2.body?.inviteId;
  record("second invite sent", invite2.res.status === 200 && Boolean(invite2Id), `status=${invite2.res.status} ${invite2.body?.message ?? ""}`);

  const decline = await j(`${APP}/api/invites/${invite2Id}/respond`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: declinerCookie },
    body: JSON.stringify({ action: "decline" }),
  });
  record("decline invite", decline.res.status === 200, `status=${decline.res.status} ${decline.body?.message ?? ""}`);

  const afterDecline = await j(
    `${SUPA}/rest/v1/match_participants?select=metadata&id=eq.${invite2Id}`,
    { headers: admin }
  );
  record(
    "declined invite marked declined",
    afterDecline.res.status === 200 && afterDecline.body[0]?.metadata?.status === "declined",
    JSON.stringify(afterDecline.body[0]?.metadata)
  );

  const fullMatchInvite = await j(`${APP}/api/matches/${matchId}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ inviteeId: decliner.id }),
  });
  record(
    "invite to full match rejected",
    fullMatchInvite.res.status === 400 && fullMatchInvite.body?.message === "Slot pertandingan sudah penuh.",
    `status=${fullMatchInvite.res.status} ${fullMatchInvite.body?.message ?? ""}`
  );

  // --- Join request flow --------------------------------------------------
  const joiner = await createUser("joiner");
  const joinCookie = cookieHeader(joiner.session);

  const join = await j(`${APP}/api/matches/${match2Id}/join`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: joinCookie },
  });
  record("join request", join.res.status === 200, `status=${join.res.status} ${join.body?.message ?? ""}`);

  const duplicateJoin = await j(`${APP}/api/matches/${match2Id}/join`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: joinCookie },
  });
  record("duplicate join rejected", duplicateJoin.res.status === 400, `status=${duplicateJoin.res.status}`);

  const organizerView = await j(`${APP}/matches/${match2Id}`, { headers: { Cookie: organizerCookie } });
  record(
    "organizer sees join request",
    organizerView.res.status === 200 && organizerView.text.includes("Permohonan Bergabung"),
    `status=${organizerView.res.status}`
  );

  const acceptJoin = await j(`${APP}/api/matches/${match2Id}/accept`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ participantUserId: joiner.id }),
  });
  record("accept join request", acceptJoin.res.status === 200, `status=${acceptJoin.res.status} ${acceptJoin.body?.message ?? ""}`);

  const joinerRow = await j(
    `${SUPA}/rest/v1/match_participants?select=metadata&match_id=eq.${match2Id}&user_id=eq.${joiner.id}`,
    { headers: admin }
  );
  record(
    "joiner confirmed",
    joinerRow.body?.[0]?.metadata?.status === "confirmed",
    JSON.stringify(joinerRow.body?.[0]?.metadata)
  );

  const rejectUser = await createUser("rejectme");
  const rejectCookie = cookieHeader(rejectUser.session);
  const join2 = await j(`${APP}/api/matches/${match2Id}/join`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: rejectCookie },
  });
  record("second join request", join2.res.status === 200, `status=${join2.res.status} ${join2.body?.message ?? ""}`);

  const rejectJoin = await j(`${APP}/api/matches/${match2Id}/reject`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ participantUserId: rejectUser.id }),
  });
  record("reject join request", rejectJoin.res.status === 200, `status=${rejectJoin.res.status} ${rejectJoin.body?.message ?? ""}`);

  const rejectedRow = await j(
    `${SUPA}/rest/v1/match_participants?select=metadata&match_id=eq.${match2Id}&user_id=eq.${rejectUser.id}`,
    { headers: admin }
  );
  record(
    "rejected row marked rejected",
    rejectedRow.body?.[0]?.metadata?.status === "rejected",
    JSON.stringify(rejectedRow.body?.[0]?.metadata)
  );

  // --- Cancel -------------------------------------------------------------
  const cancel = await j(`${APP}/api/matches/${match2Id}/cancel`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ reason: "E2E cleanup" }),
  });
  record("cancel match", cancel.res.status === 200, `status=${cancel.res.status} ${cancel.body?.message ?? ""}`);

  const cancelledRow = await j(`${SUPA}/rest/v1/matches?select=status&id=eq.${match2Id}`, { headers: admin });
  record("match marked cancelled", cancelledRow.body?.[0]?.status === "cancelled", JSON.stringify(cancelledRow.body?.[0]));

  const cancelledJoin = await j(`${APP}/api/matches/${match2Id}/join`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: joinCookie },
  });
  record("join cancelled match rejected", cancelledJoin.res.status === 400, `status=${cancelledJoin.res.status}`);

  // --- Fresh signup (no player rows yet) ----------------------------------
  const fresh = await createUser("fresh", false);
  const freshCookie = cookieHeader(fresh.session);

  const freshCreate = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: freshCookie },
    body: JSON.stringify({
      title: "E2E Fresh Signup Match",
      courtId,
      matchDate: future,
      startTime: "20:00",
      durationMinutes: 90,
      category: "mens_singles",
      umpireOption: "tanpa_wasit",
    }),
  });
  const freshMatchId = freshCreate.body?.matchId;
  if (freshMatchId) created.matches.push(freshMatchId);
  record("fresh signup can create match", freshCreate.res.status === 200 && Boolean(freshMatchId), `status=${freshCreate.res.status} ${freshCreate.body?.message ?? ""}`);

  const freshRows = await j(`${SUPA}/rest/v1/users?select=id&id=eq.${fresh.id}`, { headers: admin });
  record("onboarding created users row", Array.isArray(freshRows.body) && freshRows.body.length === 1, `rows=${Array.isArray(freshRows.body) ? freshRows.body.length : "n/a"}`);

  const freshProfile = await j(`${SUPA}/rest/v1/player_profiles?select=display_name&user_id=eq.${fresh.id}`, { headers: admin });
  record("onboarding created profile row", Array.isArray(freshProfile.body) && freshProfile.body.length === 1);

  const freshDashboard = await j(`${APP}/dashboard`, { headers: { Cookie: freshCookie } });
  record(
    "fresh dashboard renders",
    freshDashboard.res.status === 200 && freshDashboard.text.includes("E2E fresh"),
    `status=${freshDashboard.res.status}`
  );
  record(
    "dashboard sections simplified",
    freshDashboard.text.includes("Win Rate") &&
      freshDashboard.text.includes("Pertandingan Mendatang") &&
      freshDashboard.text.includes("Riwayat Terakhir") &&
      freshDashboard.text.includes("Undangan"),
    ""
  );

  const inviteForm = await j(`${APP}/matches/new?invite=${invitee.id}`, { headers: { Cookie: organizerCookie } });
  record(
    "create form shows invite banner",
    inviteForm.res.status === 200 && inviteForm.text.includes("Undang Bertanding") && inviteForm.text.includes("E2E invitee"),
    `status=${inviteForm.res.status}`
  );

  // --- Result + rating flow ----------------------------------------------
  const created3 = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      title: "E2E Result Match",
      courtId,
      matchDate: future,
      startTime: "19:00",
      durationMinutes: 90,
      category: "mens_singles",
      umpireOption: "tanpa_wasit",
    }),
  });
  const match3Id = created3.body?.matchId;
  if (match3Id) created.matches.push(match3Id);
  record("result match created", created3.res.status === 200 && Boolean(match3Id), `status=${created3.res.status}`);

  const invite3 = await j(`${APP}/api/matches/${match3Id}/invite`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ inviteeId: joiner.id }),
  });
  await j(`${APP}/api/invites/${invite3.body?.inviteId}/respond`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: joinCookie },
    body: JSON.stringify({ action: "accept" }),
  });

  const submitNoPhoto = await j(`${APP}/api/matches/${match3Id}/submit-result`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({ team1Score: 6, team2Score: 4, winnerTeam: 1, photoUrls: [] }),
  });
  record(
    "submit rejected without photo",
    submitNoPhoto.res.status === 400 &&
      submitNoPhoto.body?.message ===
        "Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil.",
    `status=${submitNoPhoto.res.status} ${submitNoPhoto.body?.message ?? ""}`
  );

  const submit = await j(`${APP}/api/matches/${match3Id}/submit-result`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      team1Score: 6,
      team2Score: 4,
      winnerTeam: 1,
      photoUrls: [`${SUPA}/storage/v1/object/public/avatars/e2e/match-photo.jpg`],
    }),
  });
  record("submit result", submit.res.status === 200, `status=${submit.res.status} ${submit.body?.message ?? ""}`);

  const confirm = await j(`${APP}/api/matches/${match3Id}/confirm`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: joinCookie },
    body: JSON.stringify({}),
  });
  record("opponent confirms", confirm.res.status === 200, `status=${confirm.res.status} ${confirm.body?.message ?? ""}`);

  const ratings = await j(
    `${SUPA}/rest/v1/player_ratings?select=user_id,current_rating,matches_played,wins,losses`,
    { headers: admin }
  );
  const organizerRating = (ratings.body ?? []).find((r) => r.user_id === organizer.id);
  const joinerRating = (ratings.body ?? []).find((r) => r.user_id === joiner.id);
  record(
    "ratings applied after confirm",
    organizerRating && joinerRating && organizerRating.wins === 1 && joinerRating.losses === 1,
    JSON.stringify({ organizer: organizerRating, joiner: joinerRating })
  );

  const history = await j(`${SUPA}/rest/v1/rating_history?select=match_id,user_id,rating_change&match_id=eq.${match3Id}`, { headers: admin });
  record("rating history written", Array.isArray(history.body) && history.body.length === 2, `rows=${Array.isArray(history.body) ? history.body.length : "n/a"}`);

  const completedMatch = await j(`${SUPA}/rest/v1/matches?select=status&id=eq.${match3Id}`, { headers: admin });
  record("match completed", completedMatch.body?.[0]?.status === "completed", JSON.stringify(completedMatch.body?.[0]));

  // --- Submit validation: incomplete roster -------------------------------
  const created4 = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      title: "E2E Incomplete Match",
      courtId,
      matchDate: future,
      startTime: "18:00",
      durationMinutes: 90,
      category: "mens_singles",
      umpireOption: "tanpa_wasit",
    }),
  });
  const match4Id = created4.body?.matchId;
  if (match4Id) created.matches.push(match4Id);
  record("incomplete match created", created4.res.status === 200 && Boolean(match4Id), `status=${created4.res.status}`);

  const incomplete = await j(`${APP}/api/matches/${match4Id}/submit-result`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      team1Score: 6,
      team2Score: 2,
      winnerTeam: 1,
      photoUrls: [`${SUPA}/storage/v1/object/public/avatars/e2e/match-photo.jpg`],
    }),
  });
  record(
    "submit rejected when roster incomplete",
    incomplete.res.status === 400 &&
      String(incomplete.body?.message ?? "").startsWith("Peserta belum lengkap"),
    `status=${incomplete.res.status} ${incomplete.body?.message ?? ""}`
  );

  // --- Validation ---------------------------------------------------------
  const past = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: { ...baseHeaders, Cookie: organizerCookie },
    body: JSON.stringify({
      title: "E2E Past Match",
      courtId,
      matchDate: "2020-01-01",
      startTime: "09:00",
      durationMinutes: 90,
      category: "mens_singles",
      umpireOption: "tanpa_wasit",
    }),
  });
  record(
    "past date rejected with short message",
    past.res.status === 400 && past.body?.message === "Jadwal pertandingan harus di waktu yang akan datang.",
    `status=${past.res.status} ${past.body?.message ?? ""}`
  );

  const unauth = await j(`${APP}/api/matches/create`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ title: "x" }),
  });
  record("unauthenticated create rejected", unauth.res.status === 401, `status=${unauth.res.status}`);

  // --- Match list ---------------------------------------------------------
  const list = await j(`${APP}/matches`);
  record("match list shows new match", list.res.status === 200 && list.text.includes("E2E Duel Tunggal"));

  // --- Landing copy -------------------------------------------------------
  const home = await j(`${APP}/`);
  record(
    "landing copy updated",
    home.text.includes("Find Your Match. Play Your Best.") &&
      home.text.includes("Temukan lawan, atur jadwal, dan mainkan pertandinganmu."),
    ""
  );
  record("landing drops old headline", !home.text.includes("Ingin bermain lebih kompetitif"));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

async function cleanup() {
  for (const id of created.matches) {
    await j(`${SUPA}/rest/v1/rating_history?match_id=eq.${id}`, { method: "DELETE", headers: admin });
    await j(`${SUPA}/rest/v1/match_participants?match_id=eq.${id}`, {
      method: "DELETE",
      headers: admin,
    });
    await j(`${SUPA}/rest/v1/match_results?match_id=eq.${id}`, { method: "DELETE", headers: admin });
    await j(`${SUPA}/rest/v1/matches?id=eq.${id}`, { method: "DELETE", headers: admin });
  }
  for (const id of created.auth) {
    for (const table of ["player_ratings", "player_profiles", "users"]) {
      const column = table === "users" ? "id" : "user_id";
      await j(`${SUPA}/rest/v1/${table}?${column}=eq.${id}`, { method: "DELETE", headers: admin });
    }
    await j(`${SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  }
  console.log("cleanup done");
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(cleanup);

