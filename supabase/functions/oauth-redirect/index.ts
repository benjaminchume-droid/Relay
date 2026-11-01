/**
 * GET /v1/redirect — the vanity redirect endpoint third-party apps register.
 * Proxies an authorization code handoff to the app's registered redirect URI:
 *   /v1/redirect?client_id=rl_…&code=…&state=…
 * → 302 to <registered URI>?code=…&state=…
 * Without a code it answers with a small discovery JSON so the URL is alive.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, error, json, preflight } from "../_shared/relay.ts";

function redirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: url },
  });
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state");

  if (!clientId || !code) {
    return json({ service: "relay-id", endpoint: "redirect", ok: true });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: app } = await admin
    .from("developer_apps")
    .select("redirect_uris, is_active")
    .eq("client_id", clientId)
    .maybeSingle<{ redirect_uris: string[]; is_active: boolean }>();

  if (!app || !app.is_active || !app.redirect_uris?.length) {
    return error("unknown_client", 404, "No active app matches this client_id.");
  }

  const target = new URL(app.redirect_uris[0]);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return redirect(target.toString());
});
