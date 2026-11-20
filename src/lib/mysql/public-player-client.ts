/**
 * Legacy import path kept for the MySQL-era screens.
 *
 * Runtime reads now go to Supabase (`/api/players`, `/api/players/[id]`).
 * `isMySqlPublicPlayerReads()` always returns false so the old MySQL branch in
 * the player/leaderboard pages is never executed; the MySQL modules remain in
 * the repository for rollback only.
 */
export {
  fetchPublicPlayers as fetchMySqlPublicPlayers,
  fetchPublicPlayer as fetchMySqlPublicPlayer,
  type SupabasePublicPlayer as MySqlPublicPlayer,
  type SupabasePlayerCity as MySqlPlayerCity,
} from "@/lib/players/public-player-client";

export function isMySqlPublicPlayerReads(): boolean {
  return false;
}
