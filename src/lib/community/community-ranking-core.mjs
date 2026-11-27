// Pure community ranking used by /api/leaderboard. Keeping it here makes the
// ordering rules testable without a database connection.

/**
 * @param {Array<{ id: string, name: string, city?: string | null }>} communities
 * @param {Array<{ community_id: string, user_id: string }>} members
 * @param {Array<{ user_id: string, current_rating?: number | string | null, wins?: number | null }>} players
 */
export function buildCommunityRankings(communities, members, players) {
  const ratings = new Map();
  const wins = new Map();
  for (const player of players) {
    const rating = Number(player.current_rating);
    if (Number.isFinite(rating)) ratings.set(player.user_id, rating);
    const playerWins = Number(player.wins);
    wins.set(player.user_id, Number.isFinite(playerWins) ? playerWins : 0);
  }

  const entries = new Map();
  for (const community of communities) {
    if (!community?.id) continue;
    entries.set(community.id, {
      id: community.id,
      name: community.name || "Komunitas",
      city: community.city || null,
      memberCount: 0,
      totalWins: 0,
      ratingSum: 0,
      ratingCount: 0,
    });
  }

  for (const member of members) {
    const entry = entries.get(member.community_id);
    if (!entry) continue;
    entry.memberCount += 1;
    entry.totalWins += wins.get(member.user_id) ?? 0;
    if (ratings.has(member.user_id)) {
      entry.ratingSum += ratings.get(member.user_id);
      entry.ratingCount += 1;
    }
  }

  return [...entries.values()]
    .filter((entry) => entry.memberCount > 0)
    .map(({ ratingSum, ratingCount, ...entry }) => ({
      ...entry,
      averageRating: ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0,
    }))
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.totalWins - a.totalWins ||
        b.memberCount - a.memberCount ||
        a.name.localeCompare(b.name)
    );
}