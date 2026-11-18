-- Migration 0015: LIGA TENNIS IKA 17 Tournament Data
-- Inserts the official tournament with categories, schedule, and quotas

-- Insert category sub-tournaments (using tournaments table with is_league = TRUE)
-- Each category is a separate tournament entry for registration purposes

-- Tunggal Putra (Men's Singles)
INSERT INTO tournaments (id, name, slug, description, category, season, start_date, end_date, registration_deadline, max_participants, status, is_league)
VALUES (
  'ika17-mens-singles',
  'LIGA TENNIS IKA 17',
  'liga-tennis-ika-17-mens-singles',
  'Kategori: Tunggal Putra (Men''s Singles)\nKuota: 24 peserta\nJadwal pendaftaran: 1-31 Desember 2026\nKompetisi reguler: 1 Januari - 31 Maret 2027\nMain Event: 3-4 April 2027\nFormat: Race to 8, ganti lapangan di 4 poin\nPoin: Menang 3, Kalah 0, WO perlu persetujuan admin\nTop 8 lolos ke Main Event',
  'mens_singles',
  '2027',
  '2027-01-01',
  '2027-03-31',
  '2026-12-31',
  24,
  'registration_open',
  TRUE
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);

-- Tunggal Putri (Women's Singles)
INSERT INTO tournaments (id, name, slug, description, category, season, start_date, end_date, registration_deadline, max_participants, status, is_league)
VALUES (
  'ika17-womens-singles',
  'LIGA TENNIS IKA 17',
  'liga-tennis-ika-17-womens-singles',
  'Kategori: Tunggal Putri (Women''s Singles)\nKuota: 24 peserta\nJadwal pendaftaran: 1-31 Desember 2026\nKompetisi reguler: 1 Januari - 31 Maret 2027\nMain Event: 3-4 April 2027\nFormat: Race to 8, ganti lapangan di 4 poin\nPoin: Menang 3, Kalah 0, WO perlu persetujuan admin\nTop 8 lolos ke Main Event',
  'womens_singles',
  '2027',
  '2027-01-01',
  '2027-03-31',
  '2026-12-31',
  24,
  'registration_open',
  TRUE
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);

-- Ganda Putra (Men's Doubles)
INSERT INTO tournaments (id, name, slug, description, category, season, start_date, end_date, registration_deadline, max_participants, status, is_league)
VALUES (
  'ika17-mens-doubles',
  'LIGA TENNIS IKA 17',
  'liga-tennis-ika-17-mens-doubles',
  'Kategori: Ganda Putra (Men''s Doubles)\nKuota: 24 tim (48 pemain)\nJadwal pendaftaran: 1-31 Desember 2026\nKompetisi reguler: 1 Januari - 31 Maret 2027\nMain Event: 3-4 April 2027\nFormat: Race to 8, ganti lapangan di 4 poin\nPoin: Menang 3, Kalah 0, WO perlu persetujuan admin\nTop 8 lolos ke Main Event',
  'mens_doubles',
  '2027',
  '2027-01-01',
  '2027-03-31',
  '2026-12-31',
  24,
  'registration_open',
  TRUE
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);

-- Ganda Putri (Women's Doubles)
INSERT INTO tournaments (id, name, slug, description, category, season, start_date, end_date, registration_deadline, max_participants, status, is_league)
VALUES (
  'ika17-womens-doubles',
  'LIGA TENNIS IKA 17',
  'liga-tennis-ika-17-womens-doubles',
  'Kategori: Ganda Putri (Women''s Doubles)\nKuota: 24 tim (48 pemain)\nJadwal pendaftaran: 1-31 Desember 2026\nKompetisi reguler: 1 Januari - 31 Maret 2027\nMain Event: 3-4 April 2027\nFormat: Race to 8, ganti lapangan di 4 poin\nPoin: Menang 3, Kalah 0, WO perlu persetujuan admin\nTop 8 lolos ke Main Event',
  'womens_doubles',
  '2027',
  '2027-01-01',
  '2027-03-31',
  '2026-12-31',
  24,
  'registration_open',
  TRUE
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);

-- Ganda Campuran (Mixed Doubles)
INSERT INTO tournaments (id, name, slug, description, category, season, start_date, end_date, registration_deadline, max_participants, status, is_league)
VALUES (
  'ika17-mixed-doubles',
  'LIGA TENNIS IKA 17',
  'liga-tennis-ika-17-mixed-doubles',
  'Kategori: Ganda Campuran (Mixed Doubles)\nKuota: 24 tim (48 pemain) - wajib 1 putra + 1 putri per tim\nJadwal pendaftaran: 1-31 Desember 2026\nKompetisi reguler: 1 Januari - 31 Maret 2027\nMain Event: 3-4 April 2027\nFormat: Race to 8, ganti lapangan di 4 poin\nPoin: Menang 3, Kalah 0, WO perlu persetujuan admin\nTop 8 lolos ke Main Event',
  'mixed_doubles',
  '2027',
  '2027-01-01',
  '2027-03-31',
  '2026-12-31',
  24,
  'registration_open',
  TRUE
) ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);