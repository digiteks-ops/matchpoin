"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, MessageSquare, AlertCircle, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { formatDistanceToNow } from "date-fns";
import { id } from "date-fns/locale";
import Link from "next/link";

function NotificationItem({
  notification,
  onMarkRead,
  onClick,
}: {
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    referenceId: string | null;
    createdAt: string;
    isRead: boolean;
  };
  onMarkRead: (id: string) => void;
  onClick?: () => void;
}) {
  const getIcon = (type: string) => {
    switch (type) {
      case "match_challenge":
      case "challenge_accepted":
      case "challenge_rejected":
        return <MessageSquare className="w-5 h-5 text-matchpoin-navy" />;
      case "player_joined":
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case "match_cancelled":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case "result_confirmed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case "result_disputed":
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
      case "tournament_registration":
        return <MessageSquare className="w-5 h-5 text-blue-600" />;
      case "admin_announcement":
        return <AlertCircle className="w-5 h-5 text-purple-600" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    onClick?.();
  };

  return (
    <Button
      variant={notification.isRead ? "ghost" : "outline"}
      className={`w-full justify-start gap-3 p-3 text-left transition-colors ${
        notification.isRead ? "bg-white" : "bg-blue-50 border-blue-100"
      }`}
      onClick={handleClick}
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon(notification.type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium text-sm ${notification.isRead ? "text-slate-700" : "text-slate-900"}`}>
            {notification.title}
          </p>
          <time className="text-xs text-slate-400 whitespace-nowrap">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: id })}
          </time>
        </div>
        <p className="mt-1 text-xs text-slate-600 line-clamp-2">{notification.message}</p>
        {notification.referenceId && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono">{notification.referenceId.slice(0, 8)}…</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </div>
        )}
      </div>
      {!notification.isRead && (
        <span className="w-2 h-2 bg-matchpoin-navy rounded-full flex-shrink-0 mt-2" />
      )}
    </Button>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { notifications, unreadCount, isConnected, isLoading, markAsRead, markAllAsRead, refetch } =
    useRealtimeNotifications();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadNotifications = notifications.filter((n) => !n.isRead);

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="relative text-slate-600 hover:text-matchpoin-navy"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ""}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {!isConnected && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] text-white" title="Offline, menggunakan polling">
            ⚡
          </span>
        )}
      </Button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-96 origin-top-right rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5 animate-in fade-in-0 zoom-in-95 transition-all duration-150"
          role="menu"
        >
          <CardHeader className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">Notifikasi</CardTitle>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-xs text-slate-600 hover:text-slate-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAllAsRead();
                    }}
                    title="Tandai semua sebagai dibaca"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-xs text-slate-600 hover:text-slate-900"
                  onClick={(e) => {
                    e.stopPropagation();
                    refetch();
                  }}
                  title="Muat ulang"
                >
                  <Clock className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-500">
                <Clock className="w-6 h-6 animate-spin mx-auto text-matchpoin-navy" />
                <p className="mt-2 text-sm">Memuat notifikasi…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 mx-auto text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">Belum ada notifikasi</p>
                <p className="text-xs text-slate-400">Notifikasi akan muncul di sini saat ada aktivitas baru</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-slate-100">
                    {notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkRead={markAsRead}
                        onClick={() => {
                          setIsOpen(false);
                          if (notification.referenceId) {
                            if (notification.type.startsWith("match")) {
                              router.push(`/matches/${notification.referenceId}`);
                            } else if (notification.type.startsWith("tournament")) {
                              router.push("/tournaments");
                            }
                          }
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
                <Separator />
                <div className="p-3 text-center">
                  <Link
                    href="/notifications"
                    className="text-sm font-medium text-matchpoin-navy hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                  >
                    Lihat semua notifikasi
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </div>
      )}
    </div>
  );
}