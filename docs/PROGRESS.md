# MATCHPOIN — Refactor Progress

Branch: `refactor/supabase-lean` (never commit this work to `main` directly)
Base tag: `pre-refactor`

| Phase | Status | Evidence / next step |
| --- | --- | --- |
| 0 — Discovery | DONE | Stack mapped, `docs/FEATURES.md`, baseline lint/typecheck/build recorded |
| 1 — Audit | DONE | `docs/AUDIT.md`; critical items fixed (MySQL runtime deps, auth path drift, middleware) |
| 2 — Cleanup | PARTIAL | Legacy MySQL modules retained for rollback; `/mysql/*` pages redirect to Supabase screens; `/api/mysql/*` are aliases. Deletion of dormant modules deferred until production sign-off |
| 3 — Supabase migration | DONE | Migrations 00009–00019 applied (00015 chat RLS, 00016 registration write path, 00017 admin role/RLS, 00018 OAuth trigger, 00019 storage); admin seed run (5 IKA17 categories, quota 24) |
| 4 — Verify features | PARTIAL | typecheck, lint, build, unit/migration tests green. Live Google provider and storage upload checks are manual |
| 5 — GitHub | PARTIAL | `refactor/supabase-lean` pushed to origin. PR merge to `main` pending |
| 6 — Vercel | PARTIAL | Production deploy requires merge/Production Branch switch + env vars (`SUPABASE_SERVICE_ROLE_KEY`, Supabase URL/anon key, `NEXT_PUBLIC_APP_URL`) |
| 7 — Final report | NOT STARTED | After production deploy verification |

## Liga Tennis IKA17 + match fix (2026-11-19)

- Match creation failed because live `matches.court_id` was still `NOT NULL` while manual courts are stored in `metadata`; `supabase/migrations/00014_match_and_league_ika17.sql` drops the constraint. The service now uses the shared roster builder for singles/doubles and marks private matches correctly.
- `00014` also adds the league columns, pending/accepted/rejected registration model, RBAC functions, and registration/approval RPCs used by `/tournaments`, `/admin/tournaments`, and `/admin/tournaments/[id]`.
- `npm run db:seed-admin` creates/updates the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and seeds the 5 IKA17 categories (quota 24).
- Verification: `npm run typecheck`, `npm run lint`, roster/registration/RBAC/logout tests, and `npm run build` pass. Live Supabase verification still requires applying `00014` and running the seed.

## Phase 2 Part A/B (2026-11-20)

- **Chat RLS recursion** — `00015_fix_chat_rls_recursion.sql` replaces self-referencing `conversation_members` policies with `public.is_conversation_member()` (SECURITY DEFINER). Test: `npm run test:supabase-chat`.
- **Tournament registration** — `00016_fix_registration_write_path.sql` relaxes audit constraints (`submitted`, nullable `previous_status`, `accepted`) and adds approval columns. UI keeps loading/disabled/duplicate guards and shows "Menunggu Persetujuan". Test: `npm run test:supabase-registration`.
- **Open singles** — roster builder accepts `matchType=open` for singles; API/service only require an opponent for private singles; form has "Pilih Lawan"/"Open Match"; empty slot shows "Terbuka" + Gabung; host notified on join. `join_match` keeps row lock/duplicate/capacity guards. Tests: `test:mysql-roster`, `test:supabase-open-match`.
- **Host name on cards** — one batched `public_players` lookup (plus fallback) resolves organizer name/avatar; fallback "Pemain". Test: `test:supabase-match-card`.
- **/auth/login** — `/auth/login` redirects to `/login`; auth error boundary + Indonesian query-error mapping. Test: `test:supabase-auth-login`.
- **Admin dashboard** — `00017_admin_role_and_registration_rls.sql` adds `role` with a self-escalation trigger, `public.is_admin()` overloads, own-registration RLS, aggregate quota RPC, filtered/bulk admin list, optional decline reason. Admin area has its own layout/guard; admins are routed from `/dashboard` to `/admin` and lose player nav. Test: `test:supabase-admin`.
- **Google OAuth** — `00018_oauth_profiles_trigger.sql` fills `profiles` from provider metadata; callback handles denied consent, missing code, exchange failure, and provider accounts without email; branded "Mengalihkan ke …" overlay; README setup guide. Test: `test:supabase-oauth`.
- **Image uploads** — client compression (≤300 KB, WebP, 1280 px / 512 px avatars), JPG/PNG/WEBP validation, 10 MB original cap, buckets `avatars`/`match-results` with owner/participant policies, old avatar deletion, match-photo deletion on remove. Test: `test:supabase-storage`.

## Phase 3 Part A — database/query performance (2026-11-20)

- Match lists embed `match_participants` in the match query: `/matches` and `/matches/[id]` drop from 3 to 2 DB round trips; dashboard from 4 to 3.
- List payloads use explicit columns (`public_players`, admin player list) and bounded limits (admin tournaments 200, league registrants 1000).
- `00021_perf_indexes_and_rls.sql`: 7 hot-path indexes plus `(select auth.uid())` policies and definer helpers (`is_match_member`, `is_match_organizer`). Policy names and access rules unchanged.
- Realtime: fallback polling only while disconnected (60 s) and `removeChannel` on unmount.
- Measurement tooling: `00020_query_explain_tool.sql` + `npm run db:explain` (plans) and `npm run db:time` (REST medians).
- Measured numbers pending valid local Supabase credentials: the current `.env`/`.env.local` service key returns `Unregistered API key`. Run `npm run db:time` before applying `00021`, then again after, on a machine with the current project keys.

## Phase 3 Part B — frontend performance + deployment readiness (2026-11-20)

Findings and fixes:

| Problem | Location | Impact | Fix |
| --- | --- | --- | --- |
| Session + roles queried repeatedly per request | `supabase-auth.ts`, `rbac-service.ts`, guards | 2–3 extra Supabase calls on protected pages | `React.cache()` around `getSupabaseSession` and `getUserRoles` |
| No route-level loading UI | `src/app/**` | Blank area while server renders | 13 `loading.tsx` skeletons (shared `PageSkeleton`) |
| Full reload for internal notifications | `notification-bell.tsx` | Lost client state, extra document request | `router.push()` |
| Heavy client views shipped eagerly | `/matches/[id]`, `/admin/settings`, `/admin/tournaments/[id]` | Larger initial JS execution | `next/dynamic` code splitting (defers hydration; Next's reported First Load JS is unchanged) |
| Cities re-fetched on every profile view | `public-player-service.ts` | Repeated DB reads for static data | `unstable_cache` (1 h, tag `cities`) |
| Vercel functions in default region | `vercel.json` | Extra latency to Supabase (Singapore) | `regions: ["sin1"]` |

Measurements (local prod server, 3-run median TTFB): before → after

| Route | Before | After |
| --- | --- | --- |
| `/` | 0.086 s | 0.057 s |
| `/login` | 0.071 s | 0.070 s |
| `/matches` | 0.647 s | 0.668 s |
| `/tournaments` | 0.043 s | 0.064 s |
| `/players` | 0.047 s | 0.061 s |
| `/leaderboard` | 0.047 s | 0.056 s |
| `/dashboard` (redirect) | 0.008 s | 0.010 s |
| `/admin` (redirect) | 0.007 s | 0.004 s |

Local DB credentials are invalid (`Unregistered API key`), so `/matches` timing is dominated by the failing data call and the remaining deltas are within noise. No improvement is claimed for TTFB. Bundle: shared JS 87.2 kB unchanged; `/matches` 99.3 kB; `/dashboard` 95.8 kB; `/matches/[id]` 190 kB. Lighthouse was not available in this environment.

## Next step

1. Merge `refactor/supabase-lean` → `main` (or set Vercel Production Branch) and redeploy.
2. Verify production env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEFAULT_TIMEZONE`.
3. Smoke-test on production: Google login (new + cancel), avatar upload, match-result upload, player registration → admin approve, admin `/admin` guard, non-admin 403 on approve/reject.
4. Only after sign-off: optional Phase 2 cleanup (remove dormant MySQL modules) and the MySQL→Supabase data import.


## MPR rating system (2026-11-25)

- DTR (Dynamic Tennis Rating) diganti MPR (MatchPoin Rating). Core ada di `src/lib/rating/mpr-core.mjs` (dipakai rating engine, simulasi admin, dan script CLI); nama file lama `dtr-core` dihapus.
- Rating awal semua pemain baru = **1000**, apa pun kategori awal yang dipilih saat mendaftar. Kategori hanya disimpan sebagai `self_assessed_level` (`player_ratings.starting_rating_set_at` mengunci pilihan sekali).
- K tetap 80 sehingga laga seimbang bergerak +40 / -40; kemenangan atas lawan lebih tinggi mendekati +80, kekalahan dari lawan lebih rendah mendekati -80. Kalibrasi 2 pertandingan pertama sebelum rating jadi ranking resmi (`MPR_CALIBRATION_MATCHES`, `mprIsCalibrating`). Doubles memakai rata-rata tim dan kedua rekan mendapat perubahan yang sama.
- Batas tingkat MPR: Beginner 0-1099, Intermediate 1100-1599, Advanced 1600-1999, Expert 2000+. Satu sumber: `MPR_CATEGORIES`; UI (`rating-tier-core.mjs`) menurunkan rentang dari situ.
- `supabase/migrations/00041_mpr_rating.sql`: default kolom rating 1000, policy RLS insert 1000, `apply_dtr_starting_rating` dan `handle_new_user` memakai 1000, dan view `public_players` mempublikasikan rating semua pemain (tidak lagi disensor `show_rating`). Migrasi ini belum diterapkan ke Supabase.
- Verifikasi: `npm run test:unit` 107/107, `npm run test:rating` lulus, `npx tsc --noEmit` bersih, `npm run lint` bersih.

## Liga IKA17 tanpa pilih level (2026-11-25)

- Kategori liga kini 4: **Single Man**, **Double Man**, **Double Woman**, **Double Mix**. womens_doubles_intermediate dihapus dan digabung ke womens_doubles (migrasi `00042_league_classes_from_rating.sql`).
- Pendaftaran tidak lagi memilih level. Pemain hanya memilih kategori dan partner (untuk ganda) serta menyatakan belum pernah ikut PORDA/PORPROV/PON.
- Kelas liga dibentuk otomatis dari hasil pertandingan: **Beginner** bila MPR < 1100, **Intermediate** bila MPR >= 1100 (`ika17ClassOfRating`, batasnya diambil dari tier Intermediate `MPR_CATEGORIES`). Kategori ganda memakai rata-rata MPR kedua pemain (`ika17TeamRating`), baik untuk kelas maupun peringkat.
- 8 besar Beginner **dan** 8 besar Intermediate setiap kategori lolos ke Main Event, dengan syarat minimal 17 pertandingan (`IKA17_MIN_MATCHES`). Kuota 24 peserta/tim sudah dihapus (lihat bagian berikutnya).
- File yang berubah: `src/lib/tournaments/ika17-core.mjs` + `ika17.ts` + `ika17-core.d.mts` (sumber tunggal 4 kategori, kelas, rata-rata MPR), `competition-registration-core.mjs` (tanpa validasi level), `/api/tournaments/register` (tidak mengirim level), `/tournaments` dan `/league` (tanpa pemilih level, teks aturan baru), `tournament-leaderboard.tsx` (filter kelas + 8 besar per kelas), `competition-service.ts` (level/rating dari MPR tim), `seed-admin.mjs` dan `seed-dummy.mjs` (4 kategori, tanpa level).
- `register_for_competition` versi 00042 mempertahankan signature 5 parameter (`p_playing_experience` diabaikan, disimpan NULL) agar pemanggil lama tidak patah; kolom `playing_experience` tetap ada untuk data historis.
- Verifikasi: `npm run test:unit` 107/107, `npx tsc --noEmit` bersih, `npm run lint` bersih, `npm run build` sukses. Migrasi 00042 belum diterapkan ke Supabase.

## MPR +40/-40, kalibrasi 2 match, aktivitas /matches (2026-11-25)

- Skala MPR disesuaikan: **Beginner 0-1099, Intermediate 1100-1599, Advanced 1600-1999, Expert 2000+**. Pemain baru mulai dari **1000** (kategori Beginner).
- Sistem poin: K tetap **80** sehingga laga seimbang bergerak **+40 / -40**; dinamis terhadap selisih rating lawan (menang lawan lebih tinggi mendekati +80, kalah dari lawan lebih rendah mendekati -80). Doubles tetap memakai rata-rata MPR tim.
- **Kalibrasi 2 pertandingan** (`MPR_CALIBRATION_MATCHES`): rating tetap bergerak, tetapi belum dianggap ranking resmi sampai 2 match selesai. UI menampilkan badge "Kalibrasi" di leaderboard dan penanda "(K)" di kartu pemain.
- `/matches` kini punya bagian **Aktivitas Pertandingan Terbaru** yang terbuka untuk semua pemain: daftar pertandingan selesai, pemain kedua tim, skor, dan pemenang. Implementasi di `src/lib/services/match-activity-service.ts` (hanya `status = completed`, memakai `public_players` untuk nama/avatar/MPR).
- File uji baru: `scripts/unit/match-activity.test.mjs`. Nilai K/tier/starting rating diperbarui di `mpr.test.mjs`, `rating-tier.test.mjs`, `starting-rating.test.mjs`, `simulation.test.mjs`, `tournament-categories.test.mjs`, dan `scripts/test-rating.mjs`.
- Feed aktivitas menghormati RLS: match `is_private = true` hanya terlihat oleh host/peserta, sehingga tamu hanya melihat match publik. Data dummy lama semuanya private; `seed-dummy.mjs` kini membuat match uji sebagai publik.
- Perbaikan bug seed: `current_players` diisi 2/1 saat insert match membuat trigger roster melampaui `max_players` sehingga insert `match_participants` gagal diam-diam (77 match selesai tanpa peserta). Nilai awal diubah ke 0 dan error insert peserta sekarang dilaporkan.
- Verifikasi: `npm run test:unit` 113/113, `npm run test:rating` lulus, `npx tsc --noEmit` bersih, `npm run lint` bersih, `npm run build` sukses.

## Kalkulator rating + penghapusan limit peserta (2026-11-25)

- Menu **admin → simulasi** mendapat kalkulator perubahan rating (`src/app/admin/simulasi/rating-calculator.tsx`): masukkan MPR dua pemain, lihat poin untuk kedua kemungkinan hasil. Contoh A 1000 vs B 1300: A menang **+68** (B -68), B menang A **-12** (B +12). A 1000 vs B 1000: **+40/-40**. Kalkulator memanggil `calculateMprSingles` yang sama dengan pertandingan sungguhan.
- Batas **24 peserta** turnamen/liga dihapus: `IKA17_QUOTA = null`, blok kuota di `00042_league_classes_from_rating.sql` dan `src/lib/mysql/competition-registration-core.mjs` dibuang, UI `/tournaments` dan `/league` menampilkan "Peserta diterima"/"Pendaftar" tanpa persentase kuota.
- Perbaikan `ika17TeamRating`: nilai `null`/`undefined` tidak lagi dianggap 0 sebelum `Number()`, sehingga rata-rata MPR tim tidak turun palsu.
- Uji baru `scripts/unit/mpr-spec.test.mjs` mengunci spesifikasi ini (start 1000, ±40, kalibrasi 2, feed aktivitas, kalkulator, kuota hilang).
- Verifikasi: `npm run test:unit` 120/120, `npm run test:rating` lulus, `npx tsc --noEmit` bersih, `npm run lint` bersih, `npm run build` sukses. Commit `a82c885` sudah di `origin/main` dan terverifikasi live di https://matchpoin.vercel.app (tier 0-1099/1100-1599/1600-1999/2000+, "Tidak ada batas" peserta, feed aktivitas tampil).
- **Migrasi `00041_mpr_rating.sql` dan `00042_league_classes_from_rating.sql` masih harus dijalankan manual di Supabase SQL Editor** — tanpa itu trigger `handle_new_user` di database masih menulis rating awal lama dan view `public_players` masih menyensor rating dengan `show_rating`.
## Perbaikan pendaftaran, WhatsApp, dan pratinjau foto (2026-11-25)

- **Tombol submit pendaftaran turnamen mati** (single maupun ganda). Penyebabnya: checkbox persetujuan PORDA/PORPROV/PON ada di kartu kategori, sementara `openRegistration()` me-reset `eligibilityConfirmed = false` tepat setelah modal dibuka dan modal tidak punya checkbox sendiri. Akibatnya tombol `Kirim Pendaftaran` selalu `disabled`. Perbaikan: checkbox dipindah ke dalam modal, kartu kategori sekarang hanya menampilkan teks syarat.
- **Pratinjau foto bukti kosong.** `getPublicUrl()` Supabase menghasilkan URL dengan garis miring ganda (`https://proyek.supabase.co//storage/...`). Browser tetap bisa memuatnya, tetapi optimizer gambar Next.js menolak dengan `400 INVALID_IMAGE_OPTIMIZE_REQUEST`. Perbaikan: `src/lib/utils/image-url-core.mjs` (`normalizeImageUrl`) dipakai saat menyimpan URL baru dan saat merender URL lama, sehingga foto yang sudah terlanjur tersimpan ikut tampil.
- **Registrasi liga wajib nomor WhatsApp.** `parseRegistrationPayload` menolak payload tanpa nomor yang sah; nomor dinormalkan ke `628xxxxxxxxx` dan disimpan ke `public.users.phone` lewat service role. Kedua formulir (`/league` dan `/tournaments`) punya kolom input yang otomatis terisi dari profil. Nomor rumah (`021...`) sengaja ditolak karena bukan WhatsApp.
- **Join otomatis grup WhatsApp liga** `https://chat.whatsapp.com/Lea6qDW5yuNAU5YruHALTV`. Tautan dibuka di tab baru tepat setelah pendaftaran berhasil (`window.open` di dalam handler klik agar tidak diblokir popup blocker), dan langkah sukses menampilkan tombol grup sebagai cadangan.
- **Tombol floating "Chat Admin"** di kanan bawah semua halaman (`src/components/layout/whatsapp-float.tsx`) menuju `wa.me/625128066022`. Nomor admin divalidasi dengan aturan longgar (`normalizeWhatsappContact`) karena bukan nomor seluler `8xx`.
- **Notifikasi WhatsApp ke lawan saat host menantang.** `notifyChallengedOpponents()` di `match-service.ts` mengirim pesan berisi nama host, jadwal, lapangan, dan tautan match. Gateway dikonfigurasi lewat `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `WHATSAPP_API_STYLE` (`form` untuk Fonnte, `json` untuk Wablas). **Tanpa env tersebut pengiriman dilewati tanpa error** dan pembuatan match tetap berhasil — WhatsApp hanya pelengkap, bukan syarat.
- Uji baru `scripts/unit/whatsapp.test.mjs` (15 uji) mengunci normalisasi nomor, isi pesan, kewajiban nomor di registrasi, tombol submit yang tidak lagi mati, normalisasi URL foto, tombol floating, dan jalur notifikasi.
- Uji kuota yang sudah usang diperbarui: `scripts/mysql/competition-registration.test.mjs` dan `scripts/supabase/registration.test.mjs` kini memastikan pendaftaran **tidak** lagi ditolak saat peserta mencapai 24.
- Verifikasi: `npm run test:unit` 135/135, `test:mysql-registration` 16/16, `test:supabase-registration` 12/12, `test:supabase-league` 6/6, `test:mysql-roster` 16/16, `test:supabase-open-match` 7/7, `test:supabase-match-card` 4/4, `test:supabase-admin` 12/12, `test:supabase-storage` 7/7, `test:supabase-chat` 5/5, `npm run test:rating` lulus, `npx tsc --noEmit` bersih, `npm run lint` bersih, `npm run build` sukses. Server produksi lokal: `/`, `/league`, `/tournaments`, `/matches` semuanya 200; tombol floating `wa.me/625128066022` tampil; kedua bundel formulir memuat kolom "No. WhatsApp"; URL foto lama yang dinormalkan lolos optimizer (200).
- Catatan: `npm run test:mysql-workflows` gagal dengan `ERR_REQUIRE_ESM` (impor `mpr-core.mjs` dari `rating-engine.ts`) — **sudah gagal sebelum perubahan ini**, bukan regresi.
