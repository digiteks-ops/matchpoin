import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/00014_match_and_league_ika17.sql", import.meta.url),
  "utf8"
);

test("migration drops the legacy court_id NOT NULL constraint", () => {
  assert.match(migration, /ALTER TABLE public\.matches ALTER COLUMN court_id DROP NOT NULL/);
});

test("migration adds the league and registration model", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS category TEXT/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS entry_id UUID/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS league_key TEXT/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS registration_deadline DATE/);
});

test("registration status supports pending, accepted and rejected", () => {
  assert.match(
    migration,
    /CHECK \(status IN \('pending', 'accepted', 'rejected', 'confirmed', 'waiting_list'\)\)/
  );
});

test("registration and admin approval RPCs are defined", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.register_for_competition/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_approve_registration/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_reject_registration/);
  assert.match(migration, /public\.has_role\(p_actor_id, 'admin'\)/);
});

test("quota is enforced against accepted entries only", () => {
  assert.match(migration, /status IN \('accepted', 'confirmed'\)/);
  assert.match(migration, /v_entry_count >= COALESCE\(v_tournament\.max_participants, 24\)/);
  assert.match(migration, /v_confirmed \+ 1 > COALESCE\(v_tournament\.max_participants, 24\)/);
});

test("dashboard statistics count distinct entries", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_registration_stats/);
  assert.match(migration, /COUNT\(DISTINCT COALESCE\(entry_id::text, id::text\)\)/);
});
