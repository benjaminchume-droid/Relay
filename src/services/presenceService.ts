/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Presence: heartbeat into user_presence + profiles.last_seen; helpers to
 * fetch peers' presence and render Active now / Last seen / Offline labels.
 */
import { supabase } from "../lib/supabase/client";

export type PresenceRow = {
  profile_id: string;
  is_online: boolean | null;
  is_away: boolean | null;
  is_idle: boolean | null;
  is_invisible: boolean | null;
  last_seen_at: string | null;
  heartbeat_at: string | null;
  show_last_seen: boolean | null;
  app_state: string | null;
};

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let myProfileId: string | null = null;

async function beat(online: boolean) {
  if (!myProfileId) return;
  const now = new Date().toISOString();
  try {
    await supabase.from("user_presence").upsert({
      profile_id: myProfileId,
      is_online: online,
      last_seen_at: now,
      heartbeat_at: now,
      last_active_at: now,
      app_state: online ? "foreground" : "background",
    }, { onConflict: "profile_id" });
    await supabase.from("profiles").update({ last_seen: now }).eq("id", myProfileId);
  } catch (e) {
    console.warn("[presence] heartbeat failed", e);
  }
}

export const presenceService = {
  start(profileId: string) {
    if (myProfileId === profileId && heartbeatTimer) return;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    myProfileId = profileId;
    void beat(true);
    heartbeatTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void beat(true);
    }, 45_000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void beat(true);
      });
      window.addEventListener("beforeunload", () => { void beat(false); });
    }
  },

  stop() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    void beat(false);
    myProfileId = null;
  },
};

export async function fetchPresence(profileIds: string[]): Promise<Record<string, PresenceRow>> {
  const out: Record<string, PresenceRow> = {};
  const ids = [...new Set(profileIds)].filter(Boolean).slice(0, 200);
  if (!ids.length) return out;
  const { data } = await supabase
    .from("user_presence")
    .select("profile_id, is_online, is_away, is_idle, is_invisible, last_seen_at, heartbeat_at, show_last_seen, app_state")
    .in("profile_id", ids);
  for (const row of data || []) out[(row as any).profile_id] = row as PresenceRow;
  return out;
}

export function formatRelative(ts: string | null | undefined): string {
  if (!ts) return "a while ago";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function presenceLabel(row?: PresenceRow | null): string {
  if (!row) return "Offline";
  if (row.is_invisible) return "Offline";
  const hbAge = row.heartbeat_at ? Date.now() - new Date(row.heartbeat_at).getTime() : Infinity;
  const online = row.is_online && hbAge < 120_000;
  if (online) return row.is_away || row.is_idle ? "Away" : "Active now";
  if (row.show_last_seen === false) return "Offline";
  return `Last seen ${formatRelative(row.last_seen_at)}`;
}

export function isPresenceActive(row?: PresenceRow | null): boolean {
  if (!row) return false;
  if (row.is_invisible) return false;
  const hbAge = row.heartbeat_at ? Date.now() - new Date(row.heartbeat_at).getTime() : Infinity;
  return !!row.is_online && hbAge < 120_000;
}
