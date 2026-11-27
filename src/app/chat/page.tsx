"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import { ERROR_LOAD } from "@/lib/errors";
import { MessageSquare, Loader2, Users, Swords, ArrowLeft } from "lucide-react";

interface ConversationSummary {
  conversationId: string;
  kind: "match" | "dm";
  title: string;
  subtitle: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

function formatRelative(value: string | null): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60_000) return "Baru saja";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(time));
}

export default function ChatListPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login?redirectTo=/chat");
          return;
        }

        const response = await fetch("/api/chat", { cache: "no-store" });
        const result = (await response.json()) as {
          success?: boolean;
          conversations?: ConversationSummary[];
          message?: string;
        };
        if (!response.ok || !result.success) {
          throw new Error(result.message || ERROR_LOAD);
        }
        setConversations(result.conversations ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : ERROR_LOAD);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router]);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-matchpoin-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold font-heading text-slate-900">Chat</h1>
          <p className="text-sm text-slate-600">
            Percakapan pertandingan bersama seluruh peserta, dan chat pribadi dengan host atau penantang.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-matchpoin-navy" />
              Daftar Percakapan
            </CardTitle>
            <CardDescription className="text-xs">Pesan terbaru tampil di bawah judul.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Memuat percakapan...
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Belum ada percakapan"
                description="Buka detail pertandingan yang Anda ikuti, lalu tekan tombol Chat untuk mulai berbicara dengan peserta lain."
                action={
                  <Link href="/matches">
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy">
                      Lihat Pertandingan
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {conversations.map((conversation) => (
                  <li key={conversation.conversationId}>
                    <Link
                      href={`/chat/${conversation.conversationId}`}
                      className="flex items-start gap-3 py-4 transition-colors hover:bg-slate-50/80"
                    >
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        {conversation.kind === "match" ? (
                          <Swords className="h-5 w-5" />
                        ) : (
                          <Users className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold text-slate-900">{conversation.title}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {conversation.kind === "match" ? "Pertandingan" : "Pribadi"}
                          </Badge>
                        </div>
                        {conversation.subtitle && (
                          <p className="text-[11px] text-slate-400">{conversation.subtitle}</p>
                        )}
                        <p className="mt-1 truncate text-sm text-slate-600">
                          {conversation.lastMessagePreview || "Belum ada pesan. Mulai percakapan."}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatRelative(conversation.lastMessageAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}