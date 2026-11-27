import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DISPUTE_WINDOW_HOURS,
  disputeDeadlineFrom,
  isDisputeWindowOpen,
} from "../../src/lib/matches/result-status-core.mjs";
import {
  adminWhatsappUrl,
  whatsappContactUrl,
} from "../../src/lib/notifications/whatsapp-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("host record creates a pending 24h confirmation window", async () => {
  const service = await read("src/lib/services/host-record-service.ts");
  assert.match(service, /const CONFIRM_WINDOW_HOURS = 24/);
  assert.match(service, /confirmDeadline = addHours\(now, CONFIRM_WINDOW_HOURS\)/);
  assert.match(service, /status: "pending"/);
  assert.match(service, /confirm_deadline: confirmDeadline/);
  assert.match(service, /dispute_deadline: confirmDeadline/);
});

test("all non-host players receive the confirmation notification", async () => {
  const service = await read("src/lib/services/host-record-service.ts");
  assert.match(
    service,
    /const recipients = Array\.from\(new Set\(allPlayers\.filter\(\(playerId\) => playerId !== hostId\)\)\)/
  );
  assert.match(service, /createNotificationsForUsers\(recipients/);
  assert.match(service, /sanggah dalam 24 jam/);
});

test("24h dispute window is exact and closes at the deadline", () => {
  assert.equal(DISPUTE_WINDOW_HOURS, 24);
  const submitted = new Date("2026-11-27T12:00:00Z");
  const deadline = disputeDeadlineFrom(submitted);
  assert.equal(deadline.toISOString(), "2026-11-28T12:00:00.000Z");
  assert.equal(isDisputeWindowOpen(deadline, new Date("2026-11-27T23:59:59Z")), true);
  assert.equal(isDisputeWindowOpen(deadline, deadline), false);
});

test("dispute, confirm, resolve and auto-confirm enforce CONFIRMED-only ranking", async () => {
  const sql = await read("supabase/migrations/00048b_phase4_dispute_auto_confirm_audit.sql");
  for (const fn of [
    "raise_match_dispute",
    "confirm_match_result",
    "resolve_match_dispute",
    "auto_confirm_due_matches",
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
  }
  assert.match(sql, /r\.submitted_at <= v_now - INTERVAL '24 hours'/);
  assert.match(sql, /UPDATE public\.match_results\s+SET status = 'confirmed'/);
  const rating = await read("src/lib/services/rating-service.ts");
  assert.match(rating, /result\.status !== "confirmed"/);
  assert.match(rating, /status: "confirmed"/);
});

test("players cannot create matches or record walkovers", async () => {
  const create = await read("src/app/api/matches/create/route.ts");
  assert.match(create, /Hanya Host yang dapat membuat pertandingan/);
  const hostRecord = await read("src/app/api/host/matches/route.ts");
  assert.match(hostRecord, /requireApiRole\("host"\)/);
  const walkover = await read("src/app/api/matches/[id]/walkover/route.ts");
  assert.match(walkover, /requireApiRole\("host"\)/);
  assert.match(walkover, /match\.organizer_id !== user\.id/);
  assert.match(walkover, /Hanya Host pertandingan ini atau Admin/);
});

test("hosts cannot manage another host's community", async () => {
  const service = await read("src/lib/supabase/community-service.ts");
  assert.match(service, /data\.admin_id !== hostId/);
  assert.match(service, /Komunitas tidak ditemukan atau bukan milik Anda/);
  for (const path of [
    "src/app/api/communities/[id]/route.ts",
    "src/app/api/communities/[id]/members/route.ts",
  ]) {
    const route = await read(path);
    assert.match(route, /requireApiRole\("host"\)/);
    assert.match(route, /updateCommunity|addCommunityMember|removeCommunityMember/);
  }
  const migration = await read("supabase/migrations/00047_phase1_roles_rbac_communities.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS admin_id UUID/);
  assert.match(migration, /SET admin_id = owner_id/);
});

test("duplicate host submissions are rejected before a new match row", async () => {
  const service = await read("src/lib/services/host-record-service.ts");
  assert.match(service, /const duplicate = \(existingMatches \?\? \[\]\)\.find/);
  assert.match(service, /sameSet\(existingTeam1, team1\) && sameSet\(existingTeam2, team2\)/);
  assert.match(service, /sudah dicatat/);
  assert.match(service, /\b409\b/);
  const form = await read("src/components/matches/host-record-match-form.tsx");
  assert.match(form, /disabled=\{isSubmitting\}/);
});

test("Chat Admin works with and without an admin phone", async () => {
  assert.equal(whatsappContactUrl(null), "");
  assert.equal(whatsappContactUrl(""), "");
  assert.match(whatsappContactUrl("0812-3456-7890"), /^https:\/\/wa\.me\/6281234567890$/);
  assert.match(adminWhatsappUrl("Halo"), /^https:\/\/wa\.me\/62\d+\?text=Halo$/);
  const page = await read("src/app/communities/[id]/page.tsx");
  assert.match(page, /const chatUrl = whatsappChatUrl\(community\.admin_phone\)/);
  assert.match(page, /chatUrl \?/);
  assert.match(page, /title="Nomor admin belum tersedia"/);
  const float = await read("src/components/layout/whatsapp-float.tsx");
  assert.match(float, /adminWhatsappUrl\(DEFAULT_MESSAGE\)/);
});

test("leaderboard tables align on desktop and mobile", async () => {
  const page = await read("src/app/leaderboard/page.tsx");
  assert.match(page, /className="overflow-x-auto"/);
  assert.match(page, /min-w-\[640px\] table-fixed/);
  assert.equal((page.match(/<col className="w-\[/g) ?? []).length, 9);
  const headers = (page.match(/<th scope="col"/g) ?? []).length;
  assert.equal(headers, 9);
});