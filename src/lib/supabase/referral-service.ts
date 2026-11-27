import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CommunityReferralSummary {
  code: string | null;
  count: number;
}

/**
 * Reads the host referral code and how many players registered through it.
 * Missing migration 00049 (or RLS denial) yields an inactive link instead of
 * breaking the host dashboard.
 */
export async function getCommunityReferralSummary(
  communityId: string
): Promise<CommunityReferralSummary> {
  let code: string | null = null;
  let count = 0;

  try {
    const supabase = createClient();
    const [{ data, error }, { count: referralCount }] = await Promise.all([
      supabase
        .from("communities")
        .select("referral_code")
        .eq("id", communityId)
        .maybeSingle(),
      supabase
        .from("community_referrals")
        .select("id", { count: "exact", head: true })
        .eq("community_id", communityId),
    ]);

    if (!error && data && typeof data.referral_code === "string") {
      code = data.referral_code;
    }
    count = referralCount ?? 0;
  } catch {
    return { code: null, count: 0 };
  }

  return { code, count };
}