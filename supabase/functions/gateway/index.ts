/**
 * Relay Messaging SDK gateway — /v1/*
 *
 * Routes (path after the function root):
 *   POST tokens                  {external_id}                (app secret)
 *   POST identities              {bundle, meta}               (user token)
 *       bundle = { ik, spk, spk_sig, opks?: [{kid, key}] }  (Signal X3DH)
 *   GET  identities/:external_id                              (user token / app secret)
 *       -> { bundle, one_time_prekey | null }  (OPK consumed atomically)
 *   POST identities/opks         {opks: [{kid, key}]}         (user token)
 *   POST messages                {to, envelope, kind?}        (user token)
 *   GET  messages?since=&limit=                               (user token)
 *   POST messages/read           {ids}                        (user token)
 *   GET  conversations                                        (user token)
 *
 * The gateway is ciphertext-only. Bundles hold PUBLIC X25519/Ed25519 keys
 * only; envelopes are Double-Ratchet + AES-256-GCM boxes produced inside the
 * SDK. Relay routes ciphertext and prekey bundles — it never holds private
 * keys or plaintext.
 *
 * App auth:  Authorization: Bearer rs_…            (server-to-server)
 * User auth: Authorization: Bearer <user token>    (HMAC, minted via /tokens)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bearer,
  error,
  json,
  preflight,
  readJson,
  sha256Hex,
  signUserToken,
  verifyUserToken,
} from "../_shared/relay.ts";

type AppRow = {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  product: string;
  is_active: boolean;
  scopes: string[];
};

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  // …/gateway/<route> — take everything after the function name
  const route = url.pathname.split("/gateway/")[1] ?? "";

  /* ------------------------------ app auth ------------------------------ */
  async function resolveAppBySecret(): Promise<AppRow | null> {
    const secret = bearer(req) ?? req.headers.get("x-relay-secret");
    if (!secret || !secret.startsWith("rs_")) return null;
    const { data: app } = await admin
      .from("developer_apps")
      .select("id, client_id, client_secret_hash, product, is_active, scopes")
      .eq("client_secret_hash", await sha256Hex(secret))
      .eq("is_active", true)
      .maybeSingle<AppRow>();
    return app ?? null;
  }

  /* ----------------------------- user auth ------------------------------ */
  async function resolveUserToken(): Promise<{ payload: { cid: string; ext: string; exp: number }; app: AppRow } | null> {
    const token = bearer(req);
    if (!token) return null;
    // token payload embeds the client_id; verify HMAC with the stored hash
    let cid = "";
    try {
      const body = token.split(".")[0];
      const parsed = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
      cid = parsed.cid ?? "";
    } catch {
      return null;
    }
    if (!cid) return null;
    const { data: app } = await admin
      .from("developer_apps")
      .select("id, client_id, client_secret_hash, product, is_active, scopes")
      .eq("client_id", cid)
      .eq("is_active", true)
      .maybeSingle<AppRow>();
    if (!app?.client_secret_hash) return null;
    const payload = await verifyUserToken(token, app.client_secret_hash);
    if (!payload) return null;
    return { payload, app };
  }

  try {
    /* POST /tokens — mint a user token (app secret required) */
    if (route === "tokens" && req.method === "POST") {
      const app = await resolveAppBySecret();
      if (!app) return error("invalid_app", 401, "Missing or wrong app secret.");
      const body = await readJson<{ external_id?: string; ttl_seconds?: number }>(req);
      const ext = (body.external_id ?? "").trim();
      if (!ext || ext.length > 128) return error("invalid_external_id", 400);
      const ttl = Math.min(Math.max(Number(body.ttl_seconds ?? 86400), 300), 7 * 86400);
      const token = await signUserToken(
        { cid: app.client_id, ext, exp: Math.floor(Date.now() / 1000) + ttl },
        app.client_secret_hash!,
      );
      return json({ token, expires_in: ttl, external_id: ext });
    }

    const ctx = await resolveUserToken();
    const asApp = ctx ? null : await resolveAppBySecret();

    /* POST /identities — register/update this user's prekey bundle (X3DH).
     *
     * bundle = { ik: b64u, spk: b64u, spk_sig: b64u(Ed25519 over spk),
     *            opks?: [{kid, key}] }
     * Legacy JWK uploads (plain ECDH identity) are still accepted so older
     * clients keep working, but the Signal SDK always sends a bundle. */
    if (route === "identities" && req.method === "POST") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      const body = await readJson<{
        bundle?: Record<string, unknown>;
        public_key?: unknown;
        meta?: Record<string, unknown>;
      }>(req);
      const bundle = body.bundle;
      if (bundle) {
        const { ik, sig, spk, spk_sig } = bundle as Record<string, string>;
        if (typeof ik !== "string" || typeof spk !== "string" || typeof spk_sig !== "string") {
          return error("invalid_bundle", 400, "bundle needs ik, spk and spk_sig (base64url strings).");
        }
        const pub = { ik, sig: typeof sig === "string" ? sig : null, spk, spk_sig, v: 2 };
        const { error: upErr } = await admin.from("sdk_identities").upsert(
          {
            app_id: ctx.app.id,
            external_id: ctx.payload.ext,
            public_key: pub,
            meta: body.meta ?? {},
          },
          { onConflict: "app_id,external_id" },
        );
        if (upErr) return error("upsert_failed", 500, upErr.message);
        // top up one-time prekeys in the same request (best effort)
        const opks = Array.isArray(bundle.opks) ? bundle.opks : [];
        const rows = opks
          .filter((o): o is { kid: string; key: string } =>
            !!o && typeof (o as { kid?: unknown }).kid === "string" &&
            typeof (o as { key?: unknown }).key === "string")
          .slice(0, 100)
          .map((o) => ({
            app_id: ctx.app.id,
            external_id: ctx.payload.ext,
            key_id: o.kid,
            public_key: o.key,
          }));
        if (rows.length) {
          await admin.from("sdk_one_time_prekeys").upsert(rows, { onConflict: "app_id,external_id,key_id" });
        }
        return json({ ok: true, external_id: ctx.payload.ext, opks_stored: rows.length });
      }
      // legacy path
      if (!body.public_key || typeof body.public_key !== "object") {
        return error("invalid_key", 400, "public_key (JWK object) or bundle is required.");
      }
      const { error: upErr } = await admin.from("sdk_identities").upsert(
        {
          app_id: ctx.app.id,
          external_id: ctx.payload.ext,
          public_key: body.public_key,
          meta: body.meta ?? {},
        },
        { onConflict: "app_id,external_id" },
      );
      if (upErr) return error("upsert_failed", 500, upErr.message);
      return json({ ok: true, external_id: ctx.payload.ext });
    }

    /* POST /identities/opks — top up one-time prekeys */
    if (route === "identities/opks" && req.method === "POST") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      const body = await readJson<{ opks?: { kid?: string; key?: string }[] }>(req);
      const rows = (Array.isArray(body.opks) ? body.opks : [])
        .filter((o): o is { kid: string; key: string } =>
          typeof o?.kid === "string" && typeof o?.key === "string")
        .slice(0, 100)
        .map((o) => ({
          app_id: ctx.app.id,
          external_id: ctx.payload.ext,
          key_id: o.kid,
          public_key: o.key,
        }));
      if (!rows.length) return error("invalid_opks", 400, "opks must be [{kid, key}] (base64url).");
      const { error: upErr } = await admin
        .from("sdk_one_time_prekeys")
        .upsert(rows, { onConflict: "app_id,external_id,key_id" });
      if (upErr) return error("upsert_failed", 500, upErr.message);
      return json({ ok: true, opks_stored: rows.length });
    }

    /* GET /identities/:external_id — fetch a peer's prekey bundle.
     * One unused one-time prekey is consumed atomically per fetch (X3DH
     * convention); when none are left the initiator falls back to DH only. */
    if (route.startsWith("identities/") && req.method === "GET") {
      const rest = route.slice("identities/".length);
      if (rest === "opks") return error("method_not_allowed", 405, "POST your opks here.");
      const ext = decodeURIComponent(rest).trim();
      if (!ext) return error("invalid_external_id", 400);
      let appId: string;
      if (ctx) appId = ctx.app.id;
      else if (asApp) appId = asApp.id;
      else return error("unauthorized", 401);
      const { data: ident } = await admin
        .from("sdk_identities")
        .select("external_id, public_key, meta, updated_at")
        .eq("app_id", appId)
        .eq("external_id", ext)
        .maybeSingle();
      if (!ident) return error("not_found", 404, "No identity registered for that id.");
      const { data: opk, error: opkErr } = await admin
        .rpc("sdk_consume_opk", { p_app_id: appId, p_external_id: ext })
        .maybeSingle<{ key_id: string; public_key: string }>();
      if (opkErr) return error("opk_failed", 500, opkErr.message);
      return json({
        external_id: ident.external_id,
        bundle: ident.public_key,
        meta: ident.meta,
        updated_at: ident.updated_at,
        one_time_prekey: opk ? { kid: opk.key_id, key: opk.public_key } : null,
      });
    }

    /* POST /messages — encrypted envelope drop-off */
    if (route === "messages" && req.method === "POST") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      if (!ctx.app.scopes.includes("messages:send")) {
        return error("insufficient_scope", 403, "App lacks messages:send.");
      }
      const body = await readJson<{ to?: string; envelope?: unknown; kind?: string }>(req);
      const to = (body.to ?? "").trim();
      if (!to || !body.envelope || typeof body.envelope !== "object") {
        return error("invalid_message", 400, "to and envelope are required.");
      }
      // recipient must have a registered bundle so the sender could encrypt
      const { data: peer } = await admin
        .from("sdk_identities")
        .select("external_id")
        .eq("app_id", ctx.app.id)
        .eq("external_id", to)
        .maybeSingle();
      if (!peer) return error("unknown_recipient", 404, "Recipient has no registered identity.");
      if (peer.external_id === ctx.payload.ext) {
        return error("self_send", 400, "Cannot message your own external id.");
      }
      const { data: inserted, error: insErr } = await admin
        .from("sdk_messages")
        .insert({
          app_id: ctx.app.id,
          sender_external_id: ctx.payload.ext,
          recipient_external_id: to,
          envelope: body.envelope,
        })
        .select("id, created_at")
        .maybeSingle();
      if (insErr || !inserted) return error("send_failed", 500, insErr?.message ?? "insert failed");
      return json({ id: inserted.id, created_at: inserted.created_at });
    }

    /* GET /messages — inbox (ciphertext envelopes addressed to me) */
    if (route === "messages" && req.method === "GET") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      if (!ctx.app.scopes.includes("messages:read")) {
        return error("insufficient_scope", 403, "App lacks messages:read.");
      }
      const since = url.searchParams.get("since");
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 200);
      let q = admin
        .from("sdk_messages")
        .select("id, sender_external_id, envelope, created_at, delivered_at, read_at")
        .eq("app_id", ctx.app.id)
        .eq("recipient_external_id", ctx.payload.ext)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (since) q = q.gt("created_at", since);
      const { data, error: qErr } = await q;
      if (qErr) return error("query_failed", 500, qErr.message);
      const ids = (data ?? []).filter((m) => !m.delivered_at).map((m) => m.id);
      if (ids.length) {
        await admin.from("sdk_messages").update({ delivered_at: new Date().toISOString() }).in("id", ids);
      }
      return json({ messages: data ?? [] });
    }

    /* POST /messages/read */
    if (route === "messages/read" && req.method === "POST") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      const body = await readJson<{ ids?: string[] }>(req);
      if (!Array.isArray(body.ids) || !body.ids.length) return error("invalid_ids", 400);
      await admin
        .from("sdk_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", body.ids.slice(0, 200))
        .eq("app_id", ctx.app.id)
        .eq("recipient_external_id", ctx.payload.ext);
      return json({ ok: true });
    }

    /* GET /conversations — distinct partners + last activity */
    if (route === "conversations" && req.method === "GET") {
      if (!ctx) return error("invalid_token", 401, "User token required.");
      const { data, error: qErr } = await admin
        .from("sdk_messages")
        .select("sender_external_id, recipient_external_id, created_at, envelope")
        .or(
          `and(app_id.eq.${ctx.app.id},recipient_external_id.eq.${ctx.payload.ext}),` +
            `and(app_id.eq.${ctx.app.id},sender_external_id.eq.${ctx.payload.ext})`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (qErr) return error("query_failed", 500, qErr.message);
      const seen = new Map<string, { partner: string; last_at: string; last_envelope: unknown }>();
      for (const m of data ?? []) {
        const partner = m.recipient_external_id === ctx.payload.ext
          ? m.sender_external_id
          : m.recipient_external_id;
        if (!seen.has(partner)) {
          seen.set(partner, { partner, last_at: m.created_at, last_envelope: m.envelope });
        }
      }
      return json({ conversations: [...seen.values()] });
    }

    return error("not_found", 404, `Unknown route: ${route || "(root)"}`);
  } catch (err) {
    return error("internal", 500, err instanceof Error ? err.message : String(err));
  }
});
