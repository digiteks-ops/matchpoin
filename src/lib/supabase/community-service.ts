import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeWhatsappContact,
  whatsappContactUrl,
} from "@/lib/notifications/whatsapp-core.mjs";

export interface CommunityRecord {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  admin_id: string | null;
  admin_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityWithMeta extends CommunityRecord {
  admin_name: string | null;
  member_count: number;
}

export interface CommunityMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface CommunityInput {
  name: string;
  city?: string | null;
  adminPhone?: string | null;
}

export class CommunityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityError";
  }
}

const COMMUNITY_COLUMNS =
  "id, name, slug, city, admin_id, admin_phone, created_at, updated_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommunityId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeWhatsAppPhone(
  value: string | null | undefined
): string | null {
  return normalizeWhatsappContact(value) || null;
}

export function whatsappChatUrl(
  phone: string | null | undefined
): string | null {
  return whatsappContactUrl(phone) || null;
}

async function ownedCommunity(hostId: string, communityId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("id, admin_id")
    .eq("id", communityId)
    .maybeSingle();

  if (error) throw new CommunityError("Gagal memuat komunitas.");
  if (!data || data.admin_id !== hostId) {
    throw new CommunityError("Komunitas tidak ditemukan atau bukan milik Anda.");
  }
  return supabase;
}

export async function listHostCommunities(
  hostId: string
): Promise<CommunityWithMeta[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("admin_id", hostId)
    .order("created_at", { ascending: true });

  if (error) throw new CommunityError("Gagal memuat komunitas.");

  const communities = (data ?? []) as CommunityRecord[];
  if (communities.length === 0) return [];

  const ids = communities.map((community) => community.id);
  const [{ data: memberRows }, { data: hostUser }] = await Promise.all([
    supabase.from("community_members").select("community_id").in("community_id", ids),
    supabase.from("users").select("full_name, email").eq("id", hostId).maybeSingle(),
  ]);

  const counts = new Map<string, number>();
  for (const row of (memberRows ?? []) as { community_id: string }[]) {
    counts.set(row.community_id, (counts.get(row.community_id) ?? 0) + 1);
  }

  const adminName = hostUser?.full_name || hostUser?.email || null;
  return communities.map((community) => ({
    ...community,
    admin_name: adminName,
    member_count: counts.get(community.id) ?? 0,
  }));
}

export async function getHostCommunity(
  hostId: string
): Promise<CommunityWithMeta | null> {
  const communities = await listHostCommunities(hostId);
  return communities[0] ?? null;
}

export async function getCommunity(
  communityId: string
): Promise<CommunityWithMeta | null> {
  if (!isCommunityId(communityId)) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .eq("id", communityId)
    .maybeSingle();

  if (error) throw new CommunityError("Gagal memuat komunitas.");
  if (!data) return null;

  const community = data as CommunityRecord;
  const [adminResult, countResult] = await Promise.all([
    community.admin_id
      ? supabase
          .from("users")
          .select("full_name, email")
          .eq("id", community.admin_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("community_members")
      .select("id", { count: "exact", head: true })
      .eq("community_id", community.id),
  ]);

  return {
    ...community,
    admin_name:
      adminResult.data?.full_name || adminResult.data?.email || null,
    member_count: countResult.count ?? 0,
  };
}

export async function listCommunityMembers(
  communityId: string
): Promise<CommunityMember[]> {
  if (!isCommunityId(communityId)) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("community_members")
    .select("id, user_id, role, joined_at")
    .eq("community_id", communityId)
    .order("joined_at", { ascending: true });

  if (error) throw new CommunityError("Gagal memuat anggota komunitas.");

  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    role: string;
    joined_at: string;
  }[];
  if (rows.length === 0) return [];

  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email, avatar_url")
    .in(
      "id",
      rows.map((row) => row.user_id)
    );

  const byId = new Map(
    ((users ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
    }[]).map((user) => [user.id, user])
  );

  return rows.map((row) => {
    const user = byId.get(row.user_id);
    return {
      ...row,
      full_name: user?.full_name ?? null,
      email: user?.email ?? null,
      avatar_url: user?.avatar_url ?? null,
    };
  });
}

export async function createCommunity(
  hostId: string,
  input: CommunityInput
): Promise<CommunityRecord> {
  const supabase = createClient();
  const { count, error: countError } = await supabase
    .from("communities")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", hostId);

  if (countError) throw new CommunityError("Gagal memeriksa komunitas.");
  if ((count ?? 0) > 0) {
    throw new CommunityError("Anda sudah memiliki komunitas.");
  }

  const { data, error } = await supabase
    .from("communities")
    .insert({
      name: input.name.trim(),
      city: input.city?.trim() || null,
      admin_phone: input.adminPhone?.trim() || null,
      admin_id: hostId,
    })
    .select(COMMUNITY_COLUMNS)
    .single();

  if (error) throw new CommunityError("Gagal membuat komunitas.");
  return data as CommunityRecord;
}

export async function updateCommunity(
  hostId: string,
  communityId: string,
  input: Partial<CommunityInput>
): Promise<CommunityRecord> {
  if (!isCommunityId(communityId)) {
    throw new CommunityError("Komunitas tidak ditemukan.");
  }

  const supabase = await ownedCommunity(hostId, communityId);
  const update: Record<string, string | null> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.city !== undefined) update.city = input.city?.trim() || null;
  if (input.adminPhone !== undefined) {
    update.admin_phone = input.adminPhone?.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    throw new CommunityError("Tidak ada perubahan untuk disimpan.");
  }

  const { data, error } = await supabase
    .from("communities")
    .update(update)
    .eq("id", communityId)
    .eq("admin_id", hostId)
    .select(COMMUNITY_COLUMNS)
    .single();

  if (error) throw new CommunityError("Gagal menyimpan pengaturan komunitas.");
  return data as CommunityRecord;
}

export async function addCommunityMember(
  hostId: string,
  communityId: string,
  playerId: string
): Promise<void> {
  if (!isCommunityId(communityId) || !isCommunityId(playerId)) {
    throw new CommunityError("Pemain atau komunitas tidak valid.");
  }

  const supabase = await ownedCommunity(hostId, communityId);
  const { data: player, error: playerError } = await supabase
    .from("users")
    .select("id")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) throw new CommunityError("Gagal memeriksa pemain.");
  if (!player) throw new CommunityError("Pemain tidak ditemukan.");

  const { error } = await supabase.from("community_members").insert({
    community_id: communityId,
    user_id: playerId,
    role: "player",
  });

  if (error) {
    if (error.code === "23505") {
      throw new CommunityError("Pemain sudah menjadi anggota komunitas ini.");
    }
    throw new CommunityError("Gagal menambahkan pemain ke komunitas.");
  }
}

export async function removeCommunityMember(
  hostId: string,
  communityId: string,
  playerId: string
): Promise<void> {
  if (!isCommunityId(communityId) || !isCommunityId(playerId)) {
    throw new CommunityError("Pemain atau komunitas tidak valid.");
  }

  const supabase = await ownedCommunity(hostId, communityId);
  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", playerId);

  if (error) throw new CommunityError("Gagal mengeluarkan pemain dari komunitas.");
}
