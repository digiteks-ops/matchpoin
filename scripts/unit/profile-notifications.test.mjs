import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const playerService = await read("src/lib/services/player-service.ts");
const profileApi = await read("src/app/api/profile/route.ts");
const profilePage = await read("src/app/(protected)/profile/edit/page.tsx");
const notificationsMigration = await read("supabase/migrations/00023_notifications_message.sql");

test("player sync never overwrites an existing account name or city", () => {
  const block = playerService.match(/export async function ensurePlayerRecordsWithClient[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(block, /\.from\("users"\)[\s\S]*?\.select\("id"\)[\s\S]*?maybeSingle\(\)/);
  assert.match(block, /if \(!existingUser\)/);
  assert.doesNotMatch(block, /from\("users"\)\.upsert/);
});

test("profile saves through the authenticated server route", () => {
  assert.match(profilePage, /fetch\("\/api\/profile"/);
  assert.match(profilePage, /method: "PUT"/);
  assert.doesNotMatch(profilePage, /\.from\("users"\)\s*\.update/);
});

test("profile name is capped at the database limits (50 / 100)", () => {
  assert.match(profileApi, /body\.fullName\.trim\(\)\.length > 50/);
  assert.match(profilePage, /maxLength=\{50\}/);
});

test("notifications migration adds and backfills the message column", () => {
  assert.match(notificationsMigration, /ADD COLUMN IF NOT EXISTS message TEXT/);
  assert.match(notificationsMigration, /SET message = COALESCE\(NULLIF\(message, ''\), body, ''\)/);
  assert.match(notificationsMigration, /sync_notification_message/);
});