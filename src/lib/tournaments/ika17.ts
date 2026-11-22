export const IKA17_LEAGUE_KEY = "ika17-2027";
export const IKA17_LEAGUE_NAME = "Liga Tennis IKA17";
export const IKA17_SEASON = "Musim 1 2027";
export const IKA17_START_DATE = "2027-01-01";
export const IKA17_END_DATE = "2027-03-31";
export const IKA17_MAIN_EVENT_START = "2027-04-03";
export const IKA17_MAIN_EVENT_END = "2027-04-04";
export const IKA17_REGISTRATION_DEADLINE = "2026-12-31";
export const IKA17_QUOTA = 24;
export const IKA17_MIN_MATCHES = 17;

export type TournamentCategory =
  | "womens_singles"
  | "womens_doubles"
  | "mens_singles"
  | "mens_doubles"
  | "mixed_doubles";

export interface Ika17Category {
  id: TournamentCategory;
  label: string;
  shortLabel: string;
  doubles: boolean;
  genderRule: "male" | "female" | "mixed";
  slug: string;
}

export const IKA17_CATEGORIES: Ika17Category[] = [
  {
    id: "mens_singles",
    label: "Single Man",
    shortLabel: "Tunggal Putra",
    doubles: false,
    genderRule: "male",
    slug: "league-q1-2027-mens-singles",
  },
  {
    id: "womens_singles",
    label: "Single Woman",
    shortLabel: "Tunggal Putri",
    doubles: false,
    genderRule: "female",
    slug: "league-q1-2027-womens-singles",
  },
  {
    id: "mens_doubles",
    label: "Double Man",
    shortLabel: "Ganda Putra",
    doubles: true,
    genderRule: "male",
    slug: "league-q1-2027-mens-doubles",
  },
  {
    id: "womens_doubles",
    label: "Double Woman",
    shortLabel: "Ganda Putri",
    doubles: true,
    genderRule: "female",
    slug: "league-q1-2027-womens-doubles",
  },
  {
    id: "mixed_doubles",
    label: "Double Mix",
    shortLabel: "Ganda Campuran",
    doubles: true,
    genderRule: "mixed",
    slug: "league-q1-2027-mixed-doubles",
  },
];

export function ika17Category(category: string | null | undefined): Ika17Category | null {
  return IKA17_CATEGORIES.find((entry) => entry.id === category) ?? null;
}

export function ika17CategoryLabel(category: string | null | undefined): string {
  return ika17Category(category)?.label ?? category ?? "Kategori";
}
