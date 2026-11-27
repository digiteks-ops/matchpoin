import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles } from "@/lib/supabase/rbac-service";
import { hasRole } from "@/lib/auth/roles";
import { CreateMatchForm, type CityOption } from "@/components/matches/create-match-form";
import { VALID_CATEGORIES, type MatchCategory } from "@/lib/matches/constants";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: { invite?: string; category?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const inviteUserId = typeof searchParams.invite === "string" ? searchParams.invite : undefined;
  // Shortcut dari leaderboard liga membawa kategori peserta supaya mode
  // tunggal/ganda langsung sesuai kategori yang diikuti.
  const requestedCategory =
    typeof searchParams.category === "string" ? searchParams.category : undefined;
  const initialCategory =
    requestedCategory && VALID_CATEGORIES.includes(requestedCategory as MatchCategory)
      ? (requestedCategory as MatchCategory)
      : undefined;

  const { data: cities } = await supabase
    .from("cities")
    .select("id, name, province")
    .eq("is_active", true)
    .order("name", { ascending: true });

  let inviteName: string | undefined;
  if (inviteUserId) {
    const { data: profile } = await supabase
      .from("player_profiles")
      .select("display_name")
      .eq("user_id", inviteUserId)
      .maybeSingle();
    inviteName = profile?.display_name ?? undefined;
  }

  const options: CityOption[] = (cities ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    province: c.province,
  }));

  let isAdmin = false;
  if (user?.id) {
    try {
      isAdmin = hasRole(await getUserRoles(user.id), "admin");
    } catch {
      isAdmin = false;
    }
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href={inviteUserId ? `/players/${inviteUserId}` : "/matches"}
            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {inviteUserId ? "Kembali ke Profil Pemain" : "Kembali ke Pertandingan"}
          </Link>
          <span className="text-xs text-slate-400">Atur jadwal tandingmu</span>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">
            {inviteUserId ? "Undang Bertanding" : "Buat Pertandingan"}
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            {inviteUserId
              ? "Tentukan jadwal dan lokasi lapangan, lalu undangan dikirim otomatis."
              : "Tentukan kategori, lokasi, dan waktu. Pemain lain dapat melihat dan mengajukan diri."}
          </p>
        </div>

        <CreateMatchForm
          cities={options}
          inviteUserId={inviteUserId}
          inviteName={inviteName}
          initialCategory={initialCategory}
          currentUserId={user?.id ?? ""}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}