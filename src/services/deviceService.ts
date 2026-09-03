/**
 * Phase 5: register current device + optional push token for call/message alerts.
 * Uses public.devices (and push_tokens when a token is available).
 */
import { supabase } from "../lib/supabase/client";

const DEVICE_KEY = "relay_device_id";

function getOrCreateLocalDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function detectPlatform(): { platform: string; deviceType: string; deviceName: string } {
  if (typeof navigator === "undefined") {
    return { platform: "web", deviceType: "web", deviceName: "Relay Web" };
  }
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isCapacitor =
    !!(window as any).Capacitor ||
    /Capacitor/i.test(ua) ||
    document.documentElement?.classList?.contains("plt-capacitor");

  if (isAndroid) {
    return {
      platform: "android",
      deviceType: isCapacitor ? "mobile" : "web",
      deviceName: isCapacitor ? "Relay Android" : "Relay Android Web",
    };
  }
  if (isIOS) {
    return {
      platform: "ios",
      deviceType: isCapacitor ? "mobile" : "web",
      deviceName: isCapacitor ? "Relay iOS" : "Relay iOS Web",
    };
  }
  return { platform: "web", deviceType: "web", deviceName: "Relay Web" };
}

export type RegisterDeviceResult = {
  ok: boolean;
  deviceRowId?: string;
  error?: string;
};

/**
 * Upsert the current browser/app as an active device for the profile.
 * Safe to call on every authenticated session start.
 */
export async function registerCurrentDevice(profileId: string): Promise<RegisterDeviceResult> {
  if (!profileId) return { ok: false, error: "missing profileId" };

  const localId = getOrCreateLocalDeviceId();
  const { platform, deviceType, deviceName } = detectPlatform();
  const appVersion = (import.meta as any).env?.VITE_APP_VERSION || "0.0.0";
  const now = new Date().toISOString();

  try {
    const { data: existing, error: findErr } = await supabase
      .from("devices")
      .select("id")
      .eq("profile_id", profileId)
      .eq("model", localId)
      .maybeSingle();

    if (findErr && findErr.code !== "PGRST116") {
      // ignore missing row style errors
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("devices")
        .update({
          is_active: true,
          is_current_device: true,
          last_seen_at: now,
          last_login_at: now,
          app_version: appVersion,
          platform,
          device_type: deviceType,
          device_name: deviceName,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (error) return { ok: false, error: error.message };
      return { ok: true, deviceRowId: existing.id };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("devices")
      .insert({
        profile_id: profileId,
        device_name: deviceName,
        device_type: deviceType,
        platform,
        app_version: appVersion,
        model: localId,
        is_current_device: true,
        is_trusted: true,
        is_active: true,
        last_login_at: now,
        last_seen_at: now,
      })
      .select("id")
      .single();

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, deviceRowId: inserted?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Store / refresh a push token for the current device row.
 * provider: 'fcm' | 'apns' | 'web-push'
 */
export async function registerPushToken(opts: {
  profileId: string;
  token: string;
  provider?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { profileId, token, provider = "fcm" } = opts;
  if (!profileId || !token) return { ok: false, error: "missing args" };

  const reg = await registerCurrentDevice(profileId);
  if (!reg.ok || !reg.deviceRowId) {
    return { ok: false, error: reg.error || "device register failed" };
  }

  try {
    await supabase
      .from("devices")
      .update({
        push_token: token,
        push_provider: provider,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reg.deviceRowId);

    const { data: existing } = await supabase
      .from("push_tokens")
      .select("id")
      .eq("profile_id", profileId)
      .eq("device_id", reg.deviceRowId)
      .eq("token", token)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("push_tokens")
        .update({
          is_active: true,
          last_used_at: new Date().toISOString(),
          provider,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("push_tokens").insert({
        profile_id: profileId,
        device_id: reg.deviceRowId,
        provider,
        token,
        is_active: true,
        last_used_at: new Date().toISOString(),
      });
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Best-effort: if Capacitor PushNotifications is present, request permission and register token.
 * No-ops on pure web without a push plugin.
 */
export async function tryRegisterNativePush(profileId: string): Promise<void> {
  try {
    const Cap = (window as any).Capacitor;
    if (!Cap?.isNativePlatform?.()) return;

    let PushNotifications: any;
    try {
      PushNotifications = (await import("@capacitor/push-notifications")).PushNotifications;
    } catch {
      return;
    }

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (token: { value: string }) => {
      if (token?.value) {
        await registerPushToken({
          profileId,
          token: token.value,
          provider: Cap.getPlatform?.() === "ios" ? "apns" : "fcm",
        });
      }
    });
  } catch {
    // silent — push is optional until plugin is installed
  }
}
