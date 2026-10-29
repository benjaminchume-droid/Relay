/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notification engine (client half). The server writes rows via the
 * trg_notify_message_recipients trigger; this store streams them in realtime,
 * keeps the badge, and surfaces web notifications when the tab is hidden.
 */
import { create } from "zustand";
import { supabase } from "../lib/supabase/client";

export type RelayNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  createdAt: string;
  isRead: boolean;
};

type NotificationState = {
  items: RelayNotification[];
  unread: number;
  loaded: boolean;
  fetch: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  startStream: (profileId: string) => void;
  stopStream: () => void;
  reset: () => void;
};

let channel: any = null;
let currentProfileId: string | null = null;

function toWebNotification(n: RelayNotification) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (document.visibilityState === "visible") return; // in-app is enough when visible
    if (Notification.permission !== "granted") return;
    new Notification(n.title || "Relay", {
      body: n.body || "New message",
      tag: n.id,
      icon: "/icon-192.png",
    });
  } catch { /* notifications optional */ }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,

  fetch: async () => {
    if (!currentProfileId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", currentProfileId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return;
    const items: RelayNotification[] = (data || []).map((r: any) => ({
      id: r.id,
      type: r.notification_type || "message",
      title: r.title || "Relay",
      body: r.body || "",
      conversationId: r.conversation_id || null,
      messageId: r.message_id || null,
      createdAt: r.created_at,
      isRead: !!r.is_read,
    }));
    set({ items, unread: items.filter((i) => !i.isRead).length, loaded: true });
  },

  markAllRead: async () => {
    if (!currentProfileId) return;
    set((s) => ({ items: s.items.map((i) => ({ ...i, isRead: true })), unread: 0 }));
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("profile_id", currentProfileId)
      .eq("is_read", false);
  },

  markRead: async (id: string) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
      unread: s.items.filter((i) => !i.isRead && i.id !== id).length,
    }));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  },

  startStream: (profileId: string) => {
    if (currentProfileId === profileId && channel) return;
    get().stopStream();
    currentProfileId = profileId;
    void get().fetch();

    channel = supabase
      .channel(`notifications:${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${profileId}` },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id) return;
          const n: RelayNotification = {
            id: row.id,
            type: row.notification_type || "message",
            title: row.title || "Relay",
            body: row.body || "",
            conversationId: row.conversation_id || null,
            messageId: row.message_id || null,
            createdAt: row.created_at,
            isRead: !!row.is_read,
          };
          set((s) => ({
            items: [n, ...s.items.filter((i) => i.id !== n.id)].slice(0, 60),
            unread: s.unread + (n.isRead ? 0 : 1),
          }));
          toWebNotification(n);
        }
      )
      .subscribe();
  },

  stopStream: () => {
    if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
    channel = null;
  },

  reset: () => {
    get().stopStream();
    currentProfileId = null;
    set({ items: [], unread: 0, loaded: false });
  },
}));

/** Ask once for web notification permission (called from a user gesture). */
export async function requestWebNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
    return await Notification.requestPermission();
  } catch {
    return "unsupported";
  }
}
