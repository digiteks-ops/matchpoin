import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LAST_SEEN_NEVER_LABEL,
  compareByLastSeenDesc,
  formatLastSeen,
  formatLastSeenExact,
  lastSeenSortValue,
  lastSeenTimestamp,
} from "../../src/lib/players/last-seen-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const NOW = new Date("2026-01-10T12:00:00.000Z");

test("missing or corrupt timestamps never become a real date", () => {
  for (const value of [null, undefined, "", "bukan-tanggal", Number.NaN]) {
    assert.equal(lastSeenTimestamp(value), null, String(value));
    assert.equal(lastSeenSortValue(value), 0, String(value));
    assert.equal(formatLastSeen(value, NOW), LAST_SEEN_NEVER_LABEL, String(value));
    assert.equal(formatLastSeenExact(value), "", String(value));
  }
});

test("relative labels count up from 'Baru saja' to days", () => {
  const at = (ms) => new Date(NOW.getTime() - ms).toISOString();
  assert.equal(formatLastSeen(at(30 * 1000), NOW), "Baru saja");
  assert.equal(formatLastSeen(at(12 * 60 * 1000), NOW), "12 menit lalu");
  assert.equal(formatLastSeen(at(3 * 60 * 60 * 1000), NOW), "3 jam lalu");
  assert.equal(formatLastSeen(at(2 * 24 * 60 * 60 * 1000), NOW), "2 hari lalu");
  // Lebih dari seminggu: tanggal lengkap, bukan "hari lalu" yang tak berguna.
  assert.match(formatLastSeen(at(30 * 24 * 60 * 60 * 1000), NOW), /2025/);
});

test("sorting puts the most recent login on top and never-logged-in last", () => {
  const players = [
    { name: "Tanpa Catatan", lastSeenAt: null },
    { name: "Lama", lastSeenAt: "2025-12-01T00:00:00.000Z" },
    { name: "Baru", lastSeenAt: "2026-01-09T00:00:00.000Z" },
  ];
  const sorted = [...players].sort((a, b) => compareByLastSeenDesc(a, b, (p) => p.name));
  assert.deepEqual(
    sorted.map((p) => p.name),
    ["Baru", "Lama", "Tanpa Catatan"]
  );

  // Nilai yang sama diurutkan menurut nama supaya urutan stabil.
  const tied = [
    { name: "Budi", lastSeenAt: null },
    { name: "Ani", lastSeenAt: null },
  ];
  assert.deepEqual(
    [...tied].sort((a, b) => compareByLastSeenDesc(a, b, (p) => p.name)).map((p) => p.name),
    ["Ani", "Budi"]
  );
});

test("the exact label is Makassar time, so it matches the rest of the app", async () => {
  const label = formatLastSeenExact("2026-01-10T00:00:00.000Z");
  assert.match(label, /2026/);
  assert.match(label, /08\.00|8:00|08:00/);
});

test("login is recorded once the RPC exists, and the page reads the column", async () => {
  const migration = await read("supabase/migrations/00035_player_last_seen.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_last_seen\(\)/);
  assert.match(migration, /p\.last_seen_at,/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_last_seen\(\) TO authenticated/);
  // View harus DROP dulu karena kolomnya bertambah.
  assert.match(migration, /DROP VIEW IF EXISTS public\.public_players/);

  const service = await read("src/lib/supabase/public-player-service.ts");
  assert.match(service, /lastSeenAt: row\.last_seen_at \?\? null/);
  assert.match(service, /last_active:/);
  assert.match(service, /nullsFirst: false/);
  assert.match(service, /PUBLIC_PLAYER_COLUMNS =[\s\S]*last_seen_at/);

  const page = await read("src/app/players/page.tsx");
  assert.match(page, /\.order\("last_seen_at", \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(page, /useState<PlayerSort>\("last_active"\)/);
  assert.match(page, /compareByLastSeenDesc/);

  const lastSeen = await read("src/lib/services/last-seen.ts");
  assert.match(lastSeen, /rpc\("record_last_seen"\)/);
  for (const caller of [
    "src/app/(auth)/login/page.tsx",
    "src/app/auth/callback/route.ts",
    "src/components/layout/navbar.tsx",
  ]) {
    const source = await read(caller);
    assert.match(source, /recordLastSeen/, caller);
  }
});