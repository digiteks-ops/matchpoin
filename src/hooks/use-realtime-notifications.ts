"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  referenceId: string | null;
  createdAt: string;
  isRead: boolean;
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);
  const supabaseRef = useRef(createClient());

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?limit=50");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.notifications) {
          setNotifications(data.notifications);
          setUnreadCount(data.notifications.filter((n: RealtimeNotification) => !n.isRead).length);
        }
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initChannel = async () => {
      try {
        const { data: { user } } = await supabaseRef.current.auth.getUser();
        if (!user) return;

        const channel = supabaseRef.current.channel(`user-notifications:${user.id}`, {
          config: { broadcast: { self: true } },
        });

        channel.on("broadcast", { event: "notification" }, (payload) => {
          if (!mounted) return;
          const notification = payload.payload as RealtimeNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === notification.id)) return prev;
            return [notification, ...prev].slice(0, 100);
          });
          setUnreadCount((prev) => prev + 1);
        });

        channel.subscribe((status) => {
          if (mounted) setIsConnected(status === "SUBSCRIBED");
        });

        channelRef.current = channel;
      } catch (error) {
        console.error("Failed to init realtime channel:", error);
      }
    };

    initChannel();
    fetchNotifications();

    // Fallback polling every 30 seconds
    const pollInterval = setInterval(fetchNotifications, 30000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isConnected,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}

export function useNotificationSound() {
  const playSound = useCallback(() => {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.3;
    audio.play().catch(() => {});
  }, []);
  return { playSound };
}