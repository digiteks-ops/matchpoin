import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { getMatchDetail } from "@/lib/services/match-service";
import { getMatchResult } from "@/lib/services/rating-service";
import { getUserRoles } from "@/lib/supabase/rbac-service";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import type { ViewerInfo } from "@/components/matches/match-detail-client";

// Heavy interactive detail view is split into its own chunk.
const MatchDetailClient = nextDynamic(
  () =>
    import("@/components/matches/match-detail-client").then((mod) => mod.MatchDetailClient),
  { loading: () => <PageSkeleton variant="detail" /> }
);

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const match = await getMatchDetail(params.id);
  if (!match) notFound();

  const result = await getMatchResult(params.id);

  let viewer: ViewerInfo = {
    id: user?.id ?? null,
    isParticipant: false,
    isOrganizer: false,
    isPending: false,
    isInvited: false,
    inviteId: null,
    team: null,
    isAdmin: false,
  };

  if (user) {
    const confirmed = match.participants.find((p) => p.userId === user.id);
    const pending = match.pendingRequests.find((p) => p.userId === user.id);
    const invited = match.invitedPlayers.find((p) => p.userId === user.id);
    const participant = confirmed ?? pending ?? invited;
    let isAdmin = false;
    try {
      const roles = await getUserRoles(user.id);
      isAdmin = roles.includes("admin") || roles.includes("super_admin");
    } catch {
      isAdmin = false;
    }

    viewer = {
      id: user.id,
      isParticipant: Boolean(confirmed),
      isOrganizer: match.organizerId === user.id,
      isPending: Boolean(pending),
      isInvited: Boolean(invited),
      inviteId: invited?.id ?? null,
      team: participant?.team ?? null,
      isAdmin,
    };
  }

  return <MatchDetailClient match={match} result={result} viewer={viewer} />;
}
