import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DISPUTE_WINDOW_HOURS,
  disputeDeadlineFrom,
  isDisputeWindowOpen,
  normalizeResultStatus,
  normalizeResultViewStatus,
} from "../../src/lib/matches/result-status-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("jendela sanggahan tepat 24 jam dari waktu server", () => {
  assert.equal(DISPUTE_WINDOW_HOURS, 24);
  const submitted = new Date("2026-11-27T00:00:00Z");
  const deadline = disputeDeadlineFrom(submitted);
  assert.equal(deadline.toISOString(), "2026-11-28T00:00:00.000Z");
  assert.equal(isDisputeWindowOpen(deadline, new Date("2026-11-27T23:59:59Z")), true);
  assert.equal(isDisputeWindowOpen(deadline, new Date("2026-11-28T00:00:00Z")), false);
  assert.equal(disputeDeadlineFrom("invalid"), null);
});

test("status hasil dinormalisasi ke alur Phase 4", () => {
  assert.equal(normalizeResultStatus("confirmed"), "confirmed");
  assert.equal(normalizeResultStatus("rejected"), "rejected");
  assert.equal(normalizeResultStatus("disputed"), "under_review");
  assert.equal(normalizeResultStatus("under_review"), "under_review");
  assert.equal(normalizeResultStatus("pending"), "pending");
  assert.equal(normalizeResultStatus(null), "none");
  assert.equal(normalizeResultViewStatus("rejected"), "rejected");
  assert.equal(normalizeResultViewStatus("disputed"), "under_review");
});

test("migrasi Phase 4: RPC sanggah/konfirmasi/resolve + auto-confirm idempoten", async () => {
  const sql = await read("supabase/migrations/00048b_phase4_dispute_auto_confirm_audit.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.raise_match_dispute/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_match_result/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.resolve_match_dispute/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.auto_confirm_due_matches/);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /FOR UPDATE OF r SKIP LOCKED/);
  assert.match(sql, /status_reason/);
  assert.match(sql, /trg_audit_match_results_status/);
  assert.match(sql, /trg_audit_disputes_status/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS reason TEXT/);
  assert.match(sql, /UPDATE public\.matches SET status = 'confirmed' WHERE status = 'completed'/);
});

test("job terjadwal memakai service-role dan endpoint cron terdaftar", async () => {
  const route = await read("src/app/api/cron/auto-confirm/route.ts");
  const vercel = JSON.parse(await read("vercel.json"));
  assert.match(route, /autoConfirmDueMatches/);
  assert.match(route, /CRON_SECRET/);
  assert.ok(vercel.crons.some((c) => c.path === "/api/cron/auto-confirm"));
});

test("ranking/histori hanya memakai pertandingan CONFIRMED", async () => {
  const history = await read("src/lib/services/match-history-service.ts");
  const activity = await read("src/lib/services/match-activity-service.ts");
  const rating = await read("src/lib/services/rating-service.ts");
  assert.match(history, /resultStatus === "confirmed"/);
  assert.match(activity, /\.eq\("status", "confirmed"\)/);
  assert.match(rating, /status: "confirmed"/);
  assert.doesNotMatch(rating, /status: "completed"/);
});

test("layar sanggahan menyediakan keputusan Host/Admin", async () => {
  const client = await read("src/components/matches/match-detail-client.tsx");
  const resolveRoute = await read("src/app/api/matches/[id]/resolve/route.ts");
  assert.match(client, /canResolveDispute/);
  assert.match(client, /handleResolve\("confirmed"\)/);
  assert.match(client, /handleResolve\("rejected"\)/);
  assert.match(resolveRoute, /resolveMatchDispute/);
});
