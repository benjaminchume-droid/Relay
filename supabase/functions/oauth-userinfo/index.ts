/**
 * GET /v1/oauth/userinfo — Bearer access token (from /v1/oauth/token) →
 * Relay identity, filtered by the granted scopes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bearer,
  error,
  json,
  preflight,
  verifyAccessToken,
} from "../_shared/relay.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  const token = bearer(req);
  if (!token) return error("invalid_token", 401, "Missing bearer token.");
  const claims = await verifyAccessToken(token);
  if (!claims) return error("invalid_token", 401, "Token is invalid or expired.");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", claims.sub)
    .maybeSingle();

  const out: Record<string, unknown> = { sub: claims.sub };
  if (claims.scopes.includes("identity")) {
    out.preferred_username = profile?.username ?? null;
  }
  if (claims.scopes.includes("profile:read")) {
    out.name = profile?.display_name ?? null;
    out.picture = profile?.avatar_url ?? null;
  }
  if (claims.scopes.includes("email:read")) {
    const { data: u } = await admin.auth.admin.getUserById(claims.sub);
    out.email = u?.user?.email ?? null;
    out.email_verified = Boolean(u?.user?.email_confirmed_at);
  }
  out.scopes = claims.scopes;
  out.client_id = claims.cid;
  return json(out);
});
