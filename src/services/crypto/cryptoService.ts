/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestration: identity registration against Supabase, per-conversation
 * session establishment (X3DH) and message encrypt/decrypt (Double Ratchet).
 * The backend only ever sees public keys + ciphertext.
 */
import { supabase } from "../../lib/supabase/client";
import {
  b64u, generateIdentity, x3dhInitiate, x3dhRespond, initRatchetAsInitiator,
  initRatchetAsResponder, ratchetEncrypt, ratchetDecrypt,
  type LocalIdentity, type PrekeyBundle, type RatchetState, type Envelope,
} from "./signalProtocol";
import { cryptoStore } from "./sessionStore";

export const E2EE_PREFIX = "R1:";

let meId: string | null = null;
let identity: LocalIdentity | null = null;
const sessionCache = new Map<string, RatchetState>();
const inflightInit = new Map<string, Promise<RatchetState>>();

export function isEnvelope(content: unknown): boolean {
  return typeof content === "string" && content.startsWith(E2EE_PREFIX);
}

export function parseEnvelope(content: string): Envelope {
  return JSON.parse(content.slice(E2EE_PREFIX.length)) as Envelope;
}

export function sealEnvelope(env: Envelope): string {
  return E2EE_PREFIX + JSON.stringify(env);
}

/** Ensure this device has a local identity and it is registered server-side. */
export async function ensureIdentity(profileId: string): Promise<LocalIdentity> {
  if (identity && meId === profileId) return identity;
  meId = profileId;
  let local = await cryptoStore.getIdentity(profileId);
  const { data: reg } = await supabase
    .from("signal_identities")
    .select("ik_pub, sign_pub, spk_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (local && reg && reg.ik_pub === b64u.enc(local.ik.publicKey)) {
    identity = local;
    return local;
  }
  // fresh device / lost IDB — new identity, replace server bundle
  local = generateIdentity();
  await registerIdentity(profileId, local);
  identity = local;
  return local;
}

async function registerIdentity(profileId: string, id: LocalIdentity): Promise<void> {
  const ikPub = b64u.enc(id.ik.publicKey);
  const row = {
    profile_id: profileId,
    ik_pub: ikPub,
    sign_pub: b64u.enc(id.sign.publicKey),
    spk_pub: b64u.enc(id.spk.publicKey),
    spk_id: id.spkId,
    spk_sig: b64u.enc(id.spkSig),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("signal_identities")
    .upsert(row, { onConflict: "profile_id" });
  if (error) throw new Error("Failed to register identity keys: " + error.message);

  await supabase.from("signal_one_time_prekeys").delete().eq("profile_id", profileId);
  const opkRows = id.opks.map((o) => ({
    profile_id: profileId,
    opk_id: o.id,
    opk_pub: b64u.enc(o.pair.publicKey),
  }));
  const { error: opkErr } = await supabase.from("signal_one_time_prekeys").insert(opkRows);
  if (opkErr) throw new Error("Failed to upload prekeys: " + opkErr.message);
}

/** Top up one-time prekeys when the server pool runs low. */
export async function topUpPrekeys(profileId: string): Promise<void> {
  if (!identity) return;
  const { count } = await supabase
    .from("signal_one_time_prekeys")
    .select("opk_id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if ((count ?? 0) > 8) return;
  for (let i = 0; i < 15; i++) {
    const pair = await import("./signalProtocol").then((m) => m.generateDhPair());
    const opk = { profile_id: profileId, opk_id: Math.floor(Math.random() * 2 ** 31), opk_pub: b64u.enc(pair.publicKey) };
    await supabase.from("signal_one_time_prekeys").insert(opk);
    identity.opks.push({ id: opk.opk_id, pair });
  }
}

async function fetchBundle(peerId: string): Promise<PrekeyBundle> {
  const { data, error } = await supabase.rpc("get_prekey_bundle", { p_profile_id: peerId });
  if (error || !data) throw new Error(error?.message || "No prekey bundle for peer");
  const b = data as any;
  return {
    ikPub: b.ik_pub, signPub: b.sign_pub, spkPub: b.spk_pub,
    spkId: Number(b.spk_id), spkSig: b.spk_sig,
    opkPub: b.opk_pub ?? null, opkId: b.opk_id ?? null,
  };
}

/** Session for a conversation — establishes X3DH on first contact. */
export async function ensureSession(myProfileId: string, conversationId: string, peerProfileId: string): Promise<RatchetState> {
  if (meId !== myProfileId) await ensureIdentity(myProfileId);
  const cached = sessionCache.get(conversationId);
  if (cached) return cached;
  const inflight = inflightInit.get(conversationId);
  if (inflight) return inflight;

  const p = (async (): Promise<RatchetState> => {
    const stored = await cryptoStore.getSession(myProfileId, conversationId);
    if (stored) {
      sessionCache.set(conversationId, stored);
      return stored;
    }
    const id = identity!;
    const bundle = await fetchBundle(peerProfileId);
    const init = x3dhInitiate(id.ik, bundle);
    const pre = { ek: b64u.enc(init.ephemeralPub), spkId: bundle.spkId, opkId: init.usedOpkId };
    const state = initRatchetAsInitiator(init.sharedSecret, b64u.dec(bundle.spkPub), pre);
    await cryptoStore.setSession(myProfileId, conversationId, state);
    sessionCache.set(conversationId, state);
    void topUpPrekeys(myProfileId);
    return state;
  })();
  inflightInit.set(conversationId, p);
  try {
    return await p;
  } finally {
    inflightInit.delete(conversationId);
  }
}

/** Build a session from an incoming prekey message (responder side). */
async function sessionFromPrekeyMessage(
  myProfileId: string,
  conversationId: string,
  env: Envelope
): Promise<RatchetState> {
  const id = identity!;
  const existing = await cryptoStore.getSession(myProfileId, conversationId);
  if (existing && existing.dhRemote === env.dh) {
    sessionCache.set(conversationId, existing);
    return existing;
  }
  // locate the consumed OPK locally by id (kept device-side after upload)
  const opk = env.pre?.opkId != null ? id.opks.find((o) => o.id === env.pre!.opkId) : null;
  const shared = x3dhRespond(
    id.ik,
    id.spk,
    opk ? opk.pair : null,
    b64u.dec(env.s),
    b64u.dec(env.pre!.ek)
  );
  const state = initRatchetAsResponder(shared, id.spk);
  await cryptoStore.setSession(myProfileId, conversationId, state);
  sessionCache.set(conversationId, state);
  return state;
}

/** Encrypt one message payload (JSON string) for a conversation. */
export async function encryptFor(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string,
  plaintextPayload: string
): Promise<string> {
  const state = await ensureSession(myProfileId, conversationId, peerProfileId);
  const env = await ratchetEncrypt(state, conversationId, b64u.enc(identity!.ik.publicKey), plaintextPayload);
  await cryptoStore.setSession(myProfileId, conversationId, state);
  return sealEnvelope(env);
}

/** Decrypt one envelope for a conversation. Throws on failure. */
export async function decryptFor(
  myProfileId: string,
  conversationId: string,
  env: Envelope
): Promise<string> {
  if (!identity || meId !== myProfileId) await ensureIdentity(myProfileId);
  let state = sessionCache.get(conversationId) || (await cryptoStore.getSession(myProfileId, conversationId));
  if (!state && env.pre) state = await sessionFromPrekeyMessage(myProfileId, conversationId, env);
  if (!state) throw new Error("No session for conversation");
  const pt = await ratchetDecrypt(state, conversationId, env);
  await cryptoStore.setSession(myProfileId, conversationId, state);
  return pt;
}

export function resetForTests() {
  sessionCache.clear();
  identity = null;
  meId = null;
}
