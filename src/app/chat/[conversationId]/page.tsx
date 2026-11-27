"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import { ERROR_GENERIC, ERROR_LOAD, logError } from "@/lib/errors";
import { ArrowLeft, Loader2, MessageSquare, Send, ShieldCheck } from "lucide-react";

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  type: string;
  createdAt: string;
}

interface ChatMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
}

interface ConversationDetail {
  conversationId: string;
  kind: "match" | "dm";
  title: string;
  subtitle: string | null;
  matchId: string | null;
  members: ChatMember[];
  messages: ChatMessage[];
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ChatConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadConversation = useCallback(async () => {
    const response = await fetch(`/api/chat/${params.conversationId}/messages`, {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      success?: boolean;
      conversation?: ConversationDetail;
      message?: string;
    };
    if (!response.ok || !result.success) {
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      throw new Error(result.message || ERROR_LOAD);
    }
    setConversation(result.conversation ?? null);
  }, [params.conversationId]);

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace(`/login?redirectTo=/chat/${params.conversationId}`);
          return;
        }
        setViewerId(user.id);
        await loadConversation();
      } catch (err) {
        setError(err instanceof Error ? err.message : ERROR_LOAD);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [loadConversation, params.conversationId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.length]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/${params.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: ChatMessage | string;
      };
      if (!response.ok || !result.success) {
        throw new Error(typeof result.message === "string" ? result.message : ERROR_GENERIC);
      }

      const sent = typeof result.message === "object" && result.message ? result.message : null;
      setDraft("");
      if (sent) {
        setConversation((prev) =>
          prev ? { ...prev, messages: [...prev.messages, sent] } : prev
        );
      } else {
        await loadConversation();
      }
    } catch (err) {
      logError("chat.send.ui", err, { conversationId: params.conversationId });
      setError(err instanceof Error ? err.message : ERROR_GENERIC);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl space-y-4 px-4 sm:px-6">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-matchpoin-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Semua Percakapan
        </Link>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {conversation?.title ?? (isLoading ? "Memuat percakapan..." : "Percakapan")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {conversation?.subtitle ?? " "}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {conversation?.kind === "match" ? "Semua peserta" : "Pribadi"}
                </Badge>
                {conversation?.matchId && (
                  <Link href={`/matches/${conversation.matchId}`}>
                    <Button size="sm" variant="outline" className="text-[11px]">
                      Detail Pertandingan
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            {conversation && conversation.members.length > 0 && (
              <p className="pt-2 text-[11px] text-slate-400">
                {conversation.members.length} peserta:{" "}
                {conversation.members
                  .map((member) => (member.isOrganizer ? `${member.name} (host)` : member.name))
                  .join(", ")}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Memuat pesan...
              </div>
            ) : notFound || !conversation ? (
              <EmptyState
                icon={MessageSquare}
                title="Percakapan tidak ditemukan"
                description="Anda hanya dapat membuka percakapan pertandingan yang Anda ikuti."
                action={
                  <Link href="/chat">
                    <Button variant="outline" size="sm">
                      Kembali ke daftar
                    </Button>
                  </Link>
                }
              />
            ) : (
              <>
                <div className="h-[50vh] min-h-[280px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  {conversation.messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                      <MessageSquare className="h-8 w-8 text-slate-300" />
                      <p>Belum ada pesan.</p>
                      <p className="text-xs text-slate-400">Kirim pesan pertama untuk memulai percakapan.</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {conversation.messages.map((message, index) => {
                        const isMine = message.senderId === viewerId;
                        const previous = conversation.messages[index - 1];
                        const showDay =
                          !previous || formatDay(previous.createdAt) !== formatDay(message.createdAt);
                        return (
                          <li key={message.id} className="space-y-2">
                            {showDay && (
                              <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                {formatDay(message.createdAt)}
                              </p>
                            )}
                            <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                                {initials(message.senderName) || "P"}
                              </div>
                              <div className={`max-w-[75%] ${isMine ? "text-right" : ""}`}>
                                {!isMine && (
                                  <p className="mb-0.5 text-[10px] font-semibold text-slate-500">
                                    {message.senderName}
                                  </p>
                                )}
                                <div
                                  className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                    isMine
                                      ? "bg-matchpoin-navy text-white"
                                      : "bg-white text-slate-800 ring-1 ring-slate-200"
                                  }`}
                                >
                                  {message.content}
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {formatTime(message.createdAt)}
                                </p>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={handleSend} className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Tulis pesan..."
                    maxLength={2000}
                    disabled={isSending}
                    aria-label="Pesan"
                  />
                  <Button
                    type="submit"
                    variant="tennis"
                    className="shrink-0 text-matchpoin-navy"
                    disabled={isSending || draft.trim().length === 0}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Kirim</span>
                  </Button>
                </form>

                <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <ShieldCheck className="h-3 w-3" />
                  Pesan hanya dapat dibaca peserta pertandingan ini.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}