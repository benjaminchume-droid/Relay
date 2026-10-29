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
  }

  return servers;
}

/** True when TURN is configured (better success behind strict NATs). */
export function hasTurnConfigured(): boolean {
  const turnUrls = parseTurnUrls();
  return turnUrls.length > 0 && !!envStr("VITE_TURN_USERNAME") && !!envStr("VITE_TURN_CREDENTIAL");
}
