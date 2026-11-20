"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  referenceId: string | null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login?redirectTo=/notifications");
          return;
        }

        const response = await fetch("/api/notifications?limit=100", { cache: "no-store" });
        const result = (await response.json()) as {
          success?: boolean;
          notifications?: NotificationRow[];
          message?: string;
        };
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Gagal memuat notifikasi.");
        }
        setNotifications(result.notifications ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat notifikasi.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [router]);

  const markAllRead = async () => {
    setIsMarking(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } finally {
      setIsMarking(false);
    }
  };

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900">Notifikasi</h1>
            <p className="mt-1 text-sm text-slate-600">Semua pembaruan pertandingan, liga, dan akun Anda.</p>
          </div>
          <Button variant="outline" onClick={markAllRead} disabled={isMarking || notifications.every((n) => n.isRead)}>
            {isMarking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
            Tandai semua dibaca
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-matchpoin-navy" />
              Daftar Notifikasi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Memuat notifikasi...
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="Belum ada notifikasi"
                description="Pembaruan pertandingan dan liga akan muncul di sini."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const target =
                    notification.referenceId && notification.type.startsWith("match")
                      ? `/matches/${notification.referenceId}`
                      : notification.type.startsWith("tournament")
                        ? "/tournaments"
                        : null;
                  return (
                    <li key={notification.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{notification.title}</p>
                          {!notification.isRead && <Badge variant="secondary">Baru</Badge>}
                        </div>
                        <p className="text-sm text-slate-600">{notification.message}</p>
                        <p className="text-xs text-slate-400">{formatDate(notification.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {target && (
                          <Link href={target}>
                            <Button size="sm" variant="outline">Lihat</Button>
                          </Link>
                        )}
                        {!notification.isRead && (
                          <Button size="sm" variant="ghost" onClick={() => markRead(notification.id)}>
                            Tandai dibaca
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
