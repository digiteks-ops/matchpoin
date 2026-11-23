export interface RatingTier {
  level: string;
  label: string;
  min: number;
  max: number | null;
}

export const RATING_TIERS: RatingTier[];
export const RATING_TIER_RANGES: Record<string, string>;
export const RATING_TIER_LEVELS: string[];
export const RATING_TIER_OPTIONS: Array<{ value: string; label: string }>;

export function ratingTierOf(rating: number | string | null | undefined): string;
export function ratingTierLabel(rating: number | string | null | undefined): string;
export function matchesRatingTier(
  selected: string | null | undefined,
  rating: number | string | null | undefined
): boolean;