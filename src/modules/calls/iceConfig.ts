/**
 * Phase 5: ICE servers — public STUN + optional TURN via env.
 * Set VITE_TURN_URLS (comma-separated), VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
 * for production NAT traversal (e.g. Metered, Twilio, self-hosted coturn).
 */
export type IceServerConfig = RTCIceServer;

const PUBLIC_STUN: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/**
 * Free public TURN fallback (OpenRelay by Metered). Without a TURN server,
 * calls fail outright on carrier-grade NAT (most African / mobile-carrier
 * networks) — STUN-only ICE finds no viable candidate pair and the call
 * drops after ~20s of black-hole ringing. OpenRelay is best-effort: set
 * VITE_TURN_* to your own TURN (Metered / Twilio / coturn) for production
 * reliability and the env config takes precedence.
 */
const FALLBACK_TURN: IceServerConfig = {
  urls: [
    "turn:openrelay.metered.ca:80",
    "turn:openrelay.metered.ca:443",
    "turn:openrelay.metered.ca:443?transport=tcp",
    "turns:openrelay.metered.ca:443",
  ],
  username: "openrelayproject",
  credential: "openrelayproject",
};

function parseTurnUrls(): string[] {
  try {
    const raw =
      (import.meta as any).env?.VITE_TURN_URLS ||
      (typeof process !== "undefined" ? (process as any).env?.VITE_TURN_URLS : "") ||
      "";
    if (!raw || typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function envStr(key: string): string | undefined {
  try {
    const v =
      (import.meta as any).env?.[key] ||
      (typeof process !== "undefined" ? (process as any).env?.[key] : undefined);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns ICE servers for RTCPeerConnection.
 * Always includes public STUN; appends TURN when credentials are configured.
 */
export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [...PUBLIC_STUN];
  const turnUrls = parseTurnUrls();
  const username = envStr("VITE_TURN_USERNAME");
  const credential = envStr("VITE_TURN_CREDENTIAL");

  if (turnUrls.length > 0 && username && credential) {
    servers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username,
      credential,
    });
  } else {
    // No self-hosted TURN configured — use the public fallback so calls
    // actually connect behind carrier NAT instead of dying after ~20s.
    servers.push(FALLBACK_TURN);
  }

  return servers;
}

/** True when TURN is configured (better success behind strict NATs). */
export function hasTurnConfigured(): boolean {
  const turnUrls = parseTurnUrls();
  if (turnUrls.length > 0 && !!envStr("VITE_TURN_USERNAME") && !!envStr("VITE_TURN_CREDENTIAL")) {
    return true;
  }
  return true; // public fallback TURN is always present
}
