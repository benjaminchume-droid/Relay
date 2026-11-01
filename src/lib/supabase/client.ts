import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Hidden-plumber bootstrap.
 *
 * In production the app talks to its OWN origin — /rest/v1/*, /auth/v1/*,
 * /storage/v1/* and /realtime/v1/* are transparently proxied server-side
 * (see vercel.json). No provider URL is ever visible to the client.
 * Outside production (local dev, Capacitor WebView) we fall back to the
 * direct project URL from env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * Realtime rides the proxy too; if the platform cannot upgrade the socket we
 * re-point the realtime client at the direct URL after a failed probe.
 */

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
const DIRECT_URL = env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

const isBrowser = typeof window !== "undefined";
const hostname = isBrowser ? window.location.hostname : "";
const isLocalHostish =
  !hostname ||
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.startsWith("192.168.") ||
  hostname.endsWith(".local");
const isNativeShell =
  isBrowser &&
  "Capacitor" in window &&
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

/** Origin of the hidden-plumber proxy when we are running on our own domain. */
export const proxyOrigin = isBrowser && !isLocalHostish && !isNativeShell ? window.location.origin : null;

/** The URL supabase-js should use: own origin in prod, direct otherwise. */
export const supabaseUrl = proxyOrigin ?? DIRECT_URL;
export const supabaseAnonKey = ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Fail loudly and early with instructions instead of a cryptic 401 later.
  throw new Error(
    "[relay] Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "in your .env (see .env.example) or in the Vercel project environment.",
  );
}

/** Direct realtime endpoint (used only if the proxy cannot upgrade sockets). */
function directRealtimeEndpoint(): string | null {
  if (!DIRECT_URL) return null;
  return `${DIRECT_URL.replace(/^http/, "ws")}/realtime/v1`;
}

function patchRealtimeToDirect(client: SupabaseClient): void {
  const target = directRealtimeEndpoint();
  if (!target) return;
  try {
    const rt = client.realtime as unknown as { endpoint?: string; disconnect: () => void; connect: () => void };
    if (!rt.endpoint || rt.endpoint === target) return;
    rt.endpoint = target;
    rt.disconnect();
    rt.connect();
    console.warn("[relay] realtime: proxy socket unavailable — switched to direct endpoint");
  } catch {
    /* keep the proxy endpoint; reconnect logic will retry */
  }
}

/** Probe whether the platform can upgrade a websocket through the proxy. */
function probeRealtimeProxy(origin: string, apiKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const wsUrl = `${origin.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(apiKey)}&vsn=1.0.0`;
      const ws = new WebSocket(wsUrl);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        try { ws.close(); } catch { /* noop */ }
        resolve(ok);
      };
      const timer = window.setTimeout(() => done(false), 3500);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
      ws.onclose = (ev) => { if (ev.code !== 1006) done(true); };
    } catch {
      resolve(false);
    }
  });
}

const globalForSupabase = globalThis as unknown as {
  supabaseBrowserInstance?: SupabaseClient;
  supabaseRealtimeProbe?: Promise<void>;
};

function ensureRealtimeDecision(client: SupabaseClient): void {
  if (!proxyOrigin || !globalForSupabase.supabaseRealtimeProbe) {
    globalForSupabase.supabaseRealtimeProbe = (async () => {
      const ok = await probeRealtimeProxy(proxyOrigin!, supabaseAnonKey);
      if (!ok) patchRealtimeToDirect(client);
    })();
  }
}

export const supabase: SupabaseClient =
  globalForSupabase.supabaseBrowserInstance ||
  (globalForSupabase.supabaseBrowserInstance = (() => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
      realtime: {
        params: { eventsPerSecond: 12 },
      },
    });
    if (proxyOrigin && typeof window !== "undefined") ensureRealtimeDecision(client);
    return client;
  })());
