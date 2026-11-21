import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://matchpoin.vercel.app").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/login", "/register", "/matches", "/tournaments", "/players", "/leaderboard", "/league", "/privacy", "/terms"];
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "" || route === "/leaderboard" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/tournaments" || route === "/matches" ? 0.8 : 0.5,
  }));
}