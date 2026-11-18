const staticRoutes: Record<string, string> = {
  "/login": "/mysql/auth/login",
  "/register": "/mysql/auth/register",
  "/forgot-password": "/mysql/auth/forgot-password",
  "/reset-password": "/mysql/auth/reset-password",
  "/dashboard": "/mysql/dashboard",
  "/profile": "/mysql/profile",
  "/profile/edit": "/mysql/profile/edit",
  "/matches": "/mysql/matches",
  "/matches/new": "/mysql/matches/new",
  "/players": "/mysql/players",
  "/leaderboard": "/mysql/leaderboard",
  "/tournaments": "/mysql/tournaments",
  "/league": "/mysql/league",
};

export function mysqlPathForPrimaryRoute(pathname: string): string | null {
  const staticTarget = staticRoutes[pathname];
  if (staticTarget) return staticTarget;

  const matchRoute = pathname.match(/^\/matches\/([^/]+)(\/result)?$/);
  if (matchRoute) {
    return `/mysql/matches/${matchRoute[1]}${matchRoute[2] ?? ""}`;
  }
  const playerRoute = pathname.match(/^\/players\/([^/]+)$/);
  if (playerRoute) return `/mysql/players/${playerRoute[1]}`;
  return null;
}
