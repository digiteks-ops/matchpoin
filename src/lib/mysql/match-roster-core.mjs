const VALID_CATEGORIES = new Set([
  "mens_singles",
  "womens_singles",
  "mens_doubles",
  "womens_doubles",
  "mixed_doubles",
]);

export class MatchRosterError extends Error {
  constructor(message) {
    super(message);
    this.name = "MatchRosterError";
  }
}

export function isDoublesCategory(category) {
  return typeof category === "string" && category.includes("doubles");
}

export function logicalRosterSize(category) {
  return isDoublesCategory(category) ? 4 : 2;
}

function cleanId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Builds the roster for a new match.
 *
 * Singles always play with 2 players (host plus one opponent). Doubles always
 * play with 4 players. A private doubles match requires the full roster to be
 * selected up front, while an open doubles match starts with the host only and
 * fills the remaining slots through join requests/invitations. A player may
 * only occupy one slot per match.
 */
export function buildMatchRoster(input) {
  const category = input?.category;
  if (!VALID_CATEGORIES.has(category)) {
    throw new MatchRosterError("Kategori pertandingan tidak valid.");
  }

  const organizerId = cleanId(input.organizerId);
  if (!organizerId) {
    throw new MatchRosterError("Penyelenggara pertandingan tidak valid.");
  }

  const doubles = isDoublesCategory(category);
  const requestedType = input.matchType;
  const matchType = requestedType ?? (doubles ? "open" : "private");
  if (matchType !== "open" && matchType !== "private") {
    throw new MatchRosterError("Tipe pertandingan tidak valid.");
  }
  if (!doubles && matchType !== "private") {
    throw new MatchRosterError("Tipe pertandingan tidak valid.");
  }

  const partnerUserId = cleanId(input.partnerUserId);
  const opponentUserId = cleanId(input.opponentUserId);
  const opponentPartnerUserId = cleanId(input.opponentPartnerUserId);

  const participants = [
    { userId: organizerId, team: 1, isOrganizer: true, role: "organizer" },
  ];

  if (!doubles) {
    if (partnerUserId || opponentPartnerUserId) {
      throw new MatchRosterError("Partner hanya berlaku untuk pertandingan ganda.");
    }
    if (opponentUserId) {
      if (opponentUserId === organizerId) {
        throw new MatchRosterError("Pemain lawan harus berbeda dari penyelenggara.");
      }
      participants.push({
        userId: opponentUserId,
        team: 2,
        isOrganizer: false,
        role: "opponent",
      });
    }
  } else if (matchType === "private") {
    if (!partnerUserId || !opponentUserId || !opponentPartnerUserId) {
      throw new MatchRosterError("Ganda privat wajib memilih partner dan 2 pemain lawan.");
    }
    const uniquePlayers = new Set([
      organizerId,
      partnerUserId,
      opponentUserId,
      opponentPartnerUserId,
    ]);
    if (uniquePlayers.size !== 4) {
      throw new MatchRosterError("Host, partner, dan pemain lawan harus berbeda.");
    }
    participants.push(
      { userId: partnerUserId, team: 1, isOrganizer: false, role: "host_partner" },
      { userId: opponentUserId, team: 2, isOrganizer: false, role: "opponent" },
      {
        userId: opponentPartnerUserId,
        team: 2,
        isOrganizer: false,
        role: "opponent_partner",
      }
    );
  } else if (partnerUserId || opponentUserId || opponentPartnerUserId) {
    throw new MatchRosterError(
      "Pertandingan ganda terbuka tidak dapat menentukan pemain manual."
    );
  }

  const maxPlayers = logicalRosterSize(category);
  const currentPlayers = participants.length;

  return {
    category,
    matchType,
    isPrivate: matchType === "private",
    maxPlayers,
    currentPlayers,
    status: currentPlayers >= maxPlayers ? "full" : "open",
    participants,
    playerIdsToVerify: participants
      .filter((participant) => !participant.isOrganizer)
      .map((participant) => participant.userId),
  };
}
