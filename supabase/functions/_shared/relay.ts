/**
 * Shared helpers for Relay developer edge functions.
 * CORS: the gateway is called by third-party browser apps, so permissive
 * headers are intentional; auth is enforced per-request via tokens.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-relay-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function error(code: string, status = 400, hint?: string): Response {
  return json({ error: code, error_description: hint ?? null }, status);
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

/* ------------------------------- webcrypto -------------------------------- */

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacKey(hexSecret: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(hexSecret.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** bearer token out of the Authorization header (case-insensitive scheme). */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/* ------------------------------ access tokens ----------------------------- */

export type AccessClaims = {
  iss: "relay-id";
  sub: string; // relay user id
  cid: string; // developer_apps.client_id
  scopes: string[];
  exp: number;
  iat: number;
};

async function jwtKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!secret) throw new Error("missing SUPABASE_JWT_SECRET");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signAccessToken(
  claims: Omit<AccessClaims, "iss" | "iat">,
): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    enc.encode(JSON.stringify({ ...claims, iss: "relay-id", iat: Math.floor(Date.now() / 1000) })),
  );
  const key = await jwtKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const key = await jwtKey();
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(`${header}.${payload}`),
  );
  if (!ok) return null;
  try {
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as AccessClaims;
    if (claims.iss !== "relay-id" || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/* ------------------------------ user tokens ------------------------------- */

export type UserTokenPayload = { cid: string; ext: string; exp: number };

/**
 * HMAC user token. Key = sha256hex(app secret) which is exactly the
 * client_secret_hash column — the gateway can verify, nobody else can mint.
 */
export async function signUserToken(
  payload: UserTokenPayload,
  keyHex: string,
): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(keyHex);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyUserToken(
  token: string,
  keyHex: string,
): Promise<UserTokenPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await hmacKey(keyHex);
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/")),
    ) as UserTokenPayload;
    if (!payload.cid || !payload.ext || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
