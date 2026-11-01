/**
 * POST /v1/oauth/token — Relay Auth token endpoint.
 *
 * grant_type=authorization_code:
 *   code + code_verifier (+ client_id) → access_token (JWT, 1 h).
 * The code must be unexpired, unburned, issued to this client, and the PKCE
 * S256 verifier must match the stored challenge. Single use, fail closed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bearer,
  error,
  json,
  preflight,
  readJson,
  sha256Hex,
  signAccessToken,
} from "../_shared/relay.ts";

type TokenRow = {
  id: string;
  app_id: string;
  user_id: string;
  redirect_uri: string;
  scopes: string[];
  code_challenge: string;
  expires_at: string;
  used_at: string | null;
};

type AppRow = { id: string; client_id: string; is_active: boolean };

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return error("invalid_request", 405, "POST only");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // accept both form-encoded (standard) and JSON bodies
  const ct = req.headers.get("content-type") ?? "";
  let grantType = "", code = "", verifier = "", clientId = "", redirectUri = "";
  if (ct.includes("application/json")) {
    const body = await readJson<{
      grant_type?: string; code?: string; code_verifier?: string;
      client_id?: string; redirect_uri?: string;
    }>(req);
    grantType = body.grant_type ?? "";
    code = body.code ?? "";
    verifier = body.code_verifier ?? "";
    clientId = body.client_id ?? "";
    redirectUri = body.redirect_uri ?? "";
  } else {
    const form = await req.formData();
    grantType = String(form.get("grant_type") ?? "");
    code = String(form.get("code") ?? "");
    verifier = String(form.get("code_verifier") ?? "");
    clientId = String(form.get("client_id") ?? "");
    redirectUri = String(form.get("redirect_uri") ?? "");
  }

  if (grantType !== "authorization_code") {
    return error("unsupported_grant_type", 400, "Only authorization_code is supported.");
  }
  if (!code || !verifier || !clientId) {
    return error("invalid_request", 400, "code, code_verifier and client_id are required.");
  }

  // resolve the client
  const { data: app } = await admin
    .from("developer_apps")
    .select("id, client_id, is_active")
    .eq("client_id", clientId)
    .maybeSingle<AppRow>();
  if (!app || !app.is_active) return error("invalid_client", 401, "Unknown or inactive client.");

  // burn the code atomically (update … where used_at is null prevents reuse)
  const { data: row } = await admin
    .from("oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", await sha256Hex(code))
    .eq("app_id", app.id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id, user_id, redirect_uri, scopes, code_challenge")
    .maybeSingle<TokenRow>();

  if (!row) {
    return error("invalid_grant", 400, "The code is expired, already used or unknown.");
  }
  if (redirectUri && redirectUri !== row.redirect_uri) {
    return error("invalid_grant", 400, "redirect_uri does not match the authorize request.");
  }

  // PKCE S256
  const challenge = (await sha256Hex(verifier))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (challenge !== row.code_challenge) {
    return error("invalid_grant", 400, "PKCE verification failed.");
  }

  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signAccessToken({
    sub: row.user_id,
    cid: app.client_id,
    scopes: row.scopes,
    exp: now + 3600,
  });

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: row.scopes.join(" "),
  });
});
