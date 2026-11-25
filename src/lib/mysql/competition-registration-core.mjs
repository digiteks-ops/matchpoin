const MAX_ID_LENGTH = 36;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * League identifiers are stored in `tournaments.id` (CHAR(36)). The seeded
 * IKA 17 leagues use slug identifiers such as `ika17-mens-singles`, so a UUID
 * check would reject valid leagues. Accept any non-empty identifier that fits
 * the column and has a safe character set; existence is verified in MySQL.
 */
export function isValidId(value) {
  const id = normalizeId(value);
  return id.length > 0 && id.length <= MAX_ID_LENGTH && ID_PATTERN.test(id);
}

export function inferCategory(name) {
  if (/mix/i.test(name)) return "mixed_doubles";
  // Label resmi memakai "Double Woman"/"Double Man" (tunggal, bukan "Doubles"),
  // jadi cocokkan "double" dan "doubles" sekaligus.
  if (/wom[ae]n/i.test(name) && /doubles?|ganda/i.test(name)) return "womens_doubles";
  if (/doubles?|ganda/i.test(name)) return "mens_doubles";
  return "mens_singles";
}

export function isDoubles(category) {
  return typeof category === "string" && category.includes("_doubles");
}

/**
 * "2026-12-01" -> "1 Desember 2026". Dipakai di pesan agar tanggal buka terbaca
 * sama di semua halaman.
 */
export function formatRegistrationOpen(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate ?? ""));
  if (!match) return "tanggal yang ditentukan";
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const month = months[Number(match[2]) - 1] ?? "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function parseRegistrationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, message: "Data tidak valid." };
  }

  const leagueId = normalizeId(payload.tournamentId);
  if (!leagueId) return { ok: false, message: "ID Liga wajib diisi." };
  if (!isValidId(leagueId)) return { ok: false, message: "ID Liga tidak valid." };

  const rawPartner = payload.partnerUserId;
  if (rawPartner !== undefined && rawPartner !== null && typeof rawPartner !== "string") {
    return { ok: false, message: "Partner tidak valid." };
  }
  const partnerUserId = normalizeId(rawPartner);
  if (partnerUserId && !isValidId(partnerUserId)) {
    return { ok: false, message: "Partner tidak valid." };
  }

  if (payload.eligibilityConfirmed !== true) {
    return {
      ok: false,
      message: "Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.",
    };
  }

  return {
    ok: true,
    leagueId,
    partnerUserId: partnerUserId || null,
    eligibilityConfirmed: true,
  };
}

/**
 * Applies the league registration business rules in one place so the API and
 * the service cannot drift apart.
 *
 * A player MAY register in several categories (for example Single Man plus
 * Double Man). The duplicate checks below are therefore per category: they only
 * look at entries already registered in THIS category. Cross-category blocking
 * was the bug that stopped a second registration.
 */
export function evaluateLeagueRegistration(input) {
  const {
    tournament,
    userId,
    partnerUserId,
    registeredUserIds = [],
    entryCount = 0,
    userGender = null,
    partnerGender = null,
    userExists = true,
    partnerExists = true,
    eligibilityConfirmed = true,
    today,
  } = input;

  if (!tournament) return { ok: false, message: "Liga tidak ditemukan." };

  const category = tournament.category || inferCategory(tournament.name || "");
  const doubles = isDoubles(category);

  if (eligibilityConfirmed === false) {
    return {
      ok: false,
      message: "Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.",
    };
  }

  if (!doubles && partnerUserId) {
    return { ok: false, message: "Kategori tunggal tidak dapat memilih partner." };
  }
  if (tournament.status !== "registration_open") {
    return { ok: false, message: "Pendaftaran untuk kategori ini sudah ditutup." };
  }
  // Periode pendaftaran: 1 - 31 Desember 2026. Sebelum tanggal buka, pemain
  // belum boleh mendaftar — dulu /league memblokir tetapi /tournaments tidak,
  // sehingga aturannya berbeda antar halaman.
  if (tournament.registration_open_at && today) {
    const openDate = String(tournament.registration_open_at).slice(0, 10);
    if (today < openDate) {
      return {
        ok: false,
        message: `Pendaftaran dibuka mulai ${formatRegistrationOpen(openDate)}.`,
      };
    }
  }
  if (tournament.registration_deadline && today && tournament.registration_deadline < today) {
    return { ok: false, message: "Pendaftaran untuk kategori ini sudah ditutup." };
  }
  if (doubles && !partnerUserId) {
    return { ok: false, message: "Kategori ganda wajib memilih partner." };
  }
  if (partnerUserId && partnerUserId === userId) {
    return { ok: false, message: "Partner tidak boleh sama dengan diri sendiri." };
  }
  if (registeredUserIds.includes(userId)) {
    return { ok: false, message: "Anda sudah terdaftar pada kategori ini." };
  }
  if (partnerUserId && registeredUserIds.includes(partnerUserId)) {
    return {
      ok: false,
      message: "Partner yang dipilih sudah terdaftar di kategori ini.",
    };
  }
  if (doubles && partnerUserId && partnerExists === false) {
    return { ok: false, message: "Partner tidak ditemukan." };
  }
  if (category === "mixed_doubles" && partnerUserId) {
    if (userExists === false) {
      return { ok: false, message: "Akun pemain tidak ditemukan." };
    }
    if (userGender && partnerGender && userGender === partnerGender) {
      return {
        ok: false,
        message: "Ganda Campuran wajib terdiri dari 1 pemain putra dan 1 pemain putri.",
      };
    }
  }

  const maxParticipants = Number(tournament.max_participants);
  if (
    Number.isFinite(maxParticipants) &&
    maxParticipants > 0 &&
    entryCount >= maxParticipants
  ) {
    return { ok: false, message: "Kuota kategori ini sudah penuh." };
  }

  return { ok: true, category, doubles };
}
