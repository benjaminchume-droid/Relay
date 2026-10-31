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
    if (!notificationService.getPrefs().systemEnabled) return;
    const notif = new Notification(n.title || "Relay", {
      body: notificationService.getPrefs().showPreview ? (n.body || "New message") : "New message",
      tag: n.id,
      icon: "/icon-192.png",
    });
    notif.onclick = () => {
      try {
        window.focus();
        if (n.conversationId) {
          window.dispatchEvent(new CustomEvent("relay:open-chat", { detail: { chatId: n.conversationId } }));
        }
        notif.close();
      } catch { /* ignore */ }
    };
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
          notificationService.playPop();
          notificationService.vibrate();
          notificationService.setTitleUnread(get().unread);
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

/* ---------------------------------------------------------------------------
 * User-facing notification engine controls (Settings → Notifications).
 * Wraps permission, in-app sound/vibration, previews and the tab-title badge.
 * --------------------------------------------------------------------------- */
export type NotificationPrefs = {
  systemEnabled: boolean;
  sound: boolean;
  vibration: boolean;
  showPreview: boolean;
};

const PREFS_KEY = "relay_notification_prefs_v1";

const DEFAULT_PREFS: NotificationPrefs = {
  systemEnabled: false,
  sound: true,
  vibration: true,
  showPreview: true,
};

let prefs: NotificationPrefs = loadPrefs();
let lastSoundAt = 0;

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export const notificationService = {
  getPrefs(): NotificationPrefs {
    return { ...prefs };
  },

  setPrefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
    prefs = { ...prefs, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    return { ...prefs };
  },

  permission(): "granted" | "denied" | "default" | "unsupported" {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  },

  /** Must be called from a user gesture (Settings toggle). */
  async requestPermission(): Promise<"granted" | "denied" | "default" | "unsupported"> {
    const result = await requestWebNotificationPermission();
    if (result === "granted") {
      prefs = { ...prefs, systemEnabled: true };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    }
    return result;
  },

  /** Soft two-note pop — WebAudio, no asset, throttled to one per 1.5s. */
  playPop(): void {
    if (!prefs.sound) return;
    const now = Date.now();
    if (now - lastSoundAt < 1500) return;
    lastSoundAt = now;
    try {
      const AudioCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const nowT = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, nowT);
      gain.gain.exponentialRampToValueAtTime(0.09, nowT + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, nowT + 0.28);
      gain.connect(ctx.destination);
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(nowT + i * 0.09);
        osc.stop(nowT + i * 0.09 + 0.16);
      });
      setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 800);
    } catch { /* audio unavailable */ }
  },

  vibrate(pattern: number | number[] = [18, 60, 18]): void {
    if (!prefs.vibration) return;
    try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
  },

  /** WhatsApp-style unread counter in the browser tab title. */
  setTitleUnread(total: number): void {
    try {
      document.title = total > 0 ? `(${total}) Relay` : "Relay";
    } catch { /* ignore */ }
  },
};
