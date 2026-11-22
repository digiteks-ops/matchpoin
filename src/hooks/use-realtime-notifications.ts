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
  const connectedRef = useRef(false);
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
    const client = supabaseRef.current;

    const initChannel = async () => {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const channel = client.channel(`user-notifications:${user.id}`, {
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
          connectedRef.current = status === "SUBSCRIBED";
          if (mounted) setIsConnected(status === "SUBSCRIBED");
        });

        channelRef.current = channel;
      } catch (error) {
        console.error("Failed to init realtime channel:", error);
      }
    };

    initChannel();
    fetchNotifications();

    // Fallback polling only while the realtime channel is not connected.
    const pollInterval = setInterval(() => {
      if (!connectedRef.current) void fetchNotifications();
    }, 60000);

    return () => {
      mounted = false;
      connectedRef.current = false;
      clearInterval(pollInterval);
      if (channelRef.current) {
        // Remove (not just unsubscribe) so a remount opens a fresh channel
        // instead of reusing a stale subscribed topic.
        client.removeChannel(channelRef.current);
        channelRef.current = null;
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
