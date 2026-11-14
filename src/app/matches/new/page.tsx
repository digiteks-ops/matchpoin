import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CreateMatchForm, type CourtOption } from "@/components/matches/create-match-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { ERROR_LOAD, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: { invite?: string };
}) {
  const supabase = createClient();
  const inviteUserId = typeof searchParams.invite === "string" ? searchParams.invite : undefined;

  const { data: courts, error } = await supabase
    .from("tennis_courts")
    .select("id, name, address, city_id, cities(name, province)")
    .eq("status", "available")
    .order("name", { ascending: true })
    .limit(100);

  if (error) logError("matches.new.courts", error);

  let inviteName: string | undefined;
  if (inviteUserId) {
    const { data: profile } = await supabase
      .from("player_profiles")
      .select("display_name")
      .eq("user_id", inviteUserId)
      .maybeSingle();
    inviteName = profile?.display_name ?? undefined;
  }

  const options: CourtOption[] = ((courts ?? []) as unknown as {
    id: string;
    name: string;
    address: string;
    city_id: string;
    cities: { name: string; province: string } | { name: string; province: string }[] | null;
  }[]).map((court) => {
    const city = court.cities
      ? Array.isArray(court.cities)
        ? court.cities[0]
        : court.cities
      : { name: "Makassar", province: "Sulawesi Selatan" };
    return {
      id: court.id,
      name: court.name,
      address: court.address,
      cityName: city.name,
      province: city.province,
    };
  });

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
              ? "Tentukan jadwal dan lapangan, lalu undangan dikirim otomatis."
              : "Tentukan kategori, lapangan, dan waktu. Pemain lain dapat melihat dan mengajukan diri."}
          </p>
        </div>

        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {ERROR_LOAD}
          </div>
        ) : options.length === 0 ? (
          <div className="p-6 bg-white border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold">Belum ada lapangan aktif.</p>
              <p className="mt-1 text-amber-700">
                Tambahkan lapangan pada data <code>tennis_courts</code> dengan status <code>available</code> sebelum
                membuat pertandingan.
              </p>
              <Link href="/matches">
                <Button variant="outline" size="sm" className="mt-3">
                  Kembali
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <CreateMatchForm
            courts={options}
            inviteUserId={inviteUserId}
            inviteName={inviteName}
          />
        )}
      </div>
    </div>
  );
}