import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const leaderboard = await read("src/components/tournaments/tournament-leaderboard.tsx");
const newMatchPage = await read("src/app/matches/new/page.tsx");
const createMatchForm = await read("src/components/matches/create-match-form.tsx");

test("shortcut lawan hanya untuk peserta yang sudah diterima", () => {
  // Daftar peserta dari API hanya berisi status accepted/confirmed.
  assert.match(leaderboard, /participants\?: LeagueParticipant\[\]/);
  assert.match(leaderboard, /setParticipants\(/);
  // Entry milik penonton dicari dari daftar peserta tersebut, jadi pemohon
  // pending/rejected tidak pernah mendapat entry.
  assert.match(
    leaderboard,
    /participants\.find\(\(entry\) => entry\.userId === viewerId\)\?\.entryId \?\? null/
  );
  // Kolom shortcut dirender bersyarat: tanpa entry, tabel tidak berubah.
  assert.match(leaderboard, /\{myEntryId && <th className="pb-2 pl-2 text-right">Lawan<\/th>\}/);
  assert.match(leaderboard, /\{myEntryId && \(\s*<td/);
});

test("baris sendiri ditandai dan baris lain punya tombol Pilih Lawan", () => {
  assert.match(leaderboard, /row\.entryId === myEntryId \? \(/);
  assert.match(leaderboard, /Tim Anda/);
  assert.match(leaderboard, /Pilih Lawan/);
  // Tautan membawa lawan + kategori liga yang sedang dibuka.
  assert.match(
    leaderboard,
    /\/matches\/new\?invite=\$\{encodeURIComponent\(opponentUserId\)\}&category=\$\{encodeURIComponent\(category\)\}/
  );
});

test("mode tunggal/ganda mengikuti kategori liga peserta", () => {
  // Halaman membuat match meneruskan kategori dari query ke form.
  assert.match(newMatchPage, /searchParams: \{ invite\?: string; category\?: string \}/);
  assert.match(newMatchPage, /VALID_CATEGORIES\.includes\(requestedCategory as MatchCategory\)/);
  assert.match(newMatchPage, /initialCategory=\{initialCategory\}/);
  // Form memakai kategori awal itu, sehingga isDoubles ikut kategori liga.
  assert.match(createMatchForm, /initialCategory\?: MatchCategory/);
  assert.match(createMatchForm, /useState<MatchCategory>\(initialCategory \?\? "mens_singles"\)/);
  assert.match(createMatchForm, /const isDoubles = category\.includes\("doubles"\)/);
});
