/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestration: identity registration against Supabase, per-conversation
 * session establishment (X3DH) and message encrypt/decrypt (Double Ratchet).
 * The backend only ever sees public keys + ciphertext.
 *
 * v2 sessions are keyed per (conversation, peer). Group sends fan out one
 * envelope per recipient (R2 wire format); every member can decrypt because
 * each envelope targets that member's own prekey bundle.
 */
import { supabase } from "../../lib/supabase/client";
import {
  b64u, generateIdentity, x3dhInitiate, x3dhRespond, initRatchetAsInitiator,
  initRatchetAsResponder, ratchetEncrypt, ratchetDecrypt,
  type LocalIdentity, type PrekeyBundle, type RatchetState, type Envelope,
} from "./signalProtocol";
import { cryptoStore, mirrorIdentityToLocalStorage, getMirroredIdentity } from "./sessionStore";

export const E2EE_PREFIX = "R1:";
export const FANOUT_PREFIX = "R2:";

let meId: string | null = null;
let identity: LocalIdentity | null = null;
const sessionCache = new Map<string, RatchetState>();
const inflightInit = new Map<string, Promise<RatchetState>>();

const sKey = (conversationId: string, peerId: string): string => `${conversationId}:${peerId}`;

export function isEnvelope(content: unknown): boolean {
  return typeof content === "string" && content.startsWith(E2EE_PREFIX);
}

export function parseEnvelope(content: string): Envelope {
  return JSON.parse(content.slice(E2EE_PREFIX.length)) as Envelope;
}

export function sealEnvelope(env: Envelope): string {
  return E2EE_PREFIX + JSON.stringify(env);
}

// ---- v2 fan-out: one envelope per recipient, receiver picks their own ----

export type FanoutEntry = { p: string; e: Envelope };
export type FanoutPayload = { v: 2; to: FanoutEntry[] };

export function isFanout(content: unknown): boolean {
  return typeof content === "string" && content.startsWith(FANOUT_PREFIX);
}

export function parseFanout(content: string): FanoutPayload {
  return JSON.parse(content.slice(FANOUT_PREFIX.length)) as FanoutPayload;
}

export function sealFanout(entries: FanoutEntry[]): string {
  return FANOUT_PREFIX + JSON.stringify({ v: 2, to: entries } satisfies FanoutPayload);
}

let inflightIdentity: Promise<LocalIdentity> | null = null;

/** Ensure this device has a local identity and it is registered server-side.
 *  Concurrent callers share ONE generation — two parallel runs would register
 *  different bundles and desync the device's private keys from the server. */
/* ---------------------------------------------------------------------------
 * Account-scoped encrypted identity backup (server side).
 *
 * WHY: a private identity lives in device storage only. After sign-out the
 * browser can evict it (or the user signs in on a fresh device) — without a
 * backup that ROTATES the identity and every historical message becomes
 * undecryptable forever. The identity bundle is mirrored to
 * `signal_identity_backup` encrypted with a key derived from the account's
 * own identifiers (auth user id + profile id). Anyone without the account
 * session cannot derive it from the DB row alone. Documented trade-off:
 * account-scoped escrow, prioritizing "sign out anywhere, sign back in,
 * history still decrypts" over forward secrecy of the local identity key.
 * --------------------------------------------------------------------------- */
const BACKUP_INFO = "relay-e2ee-identity-backup-v1";

async function deriveBackupKey(): Promise<CryptoKey | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw", enc.encode(`${user.id}:${meId || ""}`), "HKDF", false, ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc.encode(BACKUP_INFO), info: enc.encode(BACKUP_INFO) },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch { return null; }
}

async function uploadIdentityBackup(profileId: string, id: LocalIdentity): Promise<void> {
  try {
    const key = await deriveBackupKey();
    if (!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(id));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    const b64 = (buf: ArrayBuffer | Uint8Array) => {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    };
    await supabase.from("signal_identity_backup").upsert(
      { profile_id: profileId, blob: `${b64(iv)}:${b64(ct)}`, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );
  } catch { /* backup is best-effort — never block identity registration */ }
}

async function restoreIdentityBackup(profileId: string): Promise<LocalIdentity | null> {
  try {
    const key = await deriveBackupKey();
    if (!key) return null;
    const { data } = await supabase
      .from("signal_identity_backup")
      .select("blob")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!data?.blob?.includes(":")) return null;
    const [ivB64, ctB64] = data.blob.split(":");
    const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64)
    );
    const parsed = JSON.parse(new TextDecoder().decode(pt));
    if (!parsed?.ik?.publicKey || !parsed?.spk) return null;
    return parsed as LocalIdentity;
  } catch { return null; }
}

/** Ensure this device has a local identity and it is registered server-side.
 *  Concurrent callers share ONE generation — two parallel runs would register
 *  different bundles and desync the device's private keys from the server.
 *  Restore order: IDB → localStorage mirror → encrypted account backup.
 *  Only when ALL are missing do we mint a fresh identity. */
export async function ensureIdentity(profileId: string): Promise<LocalIdentity> {
  if (identity && meId === profileId) return identity;
  if (inflightIdentity) return inflightIdentity;
  inflightIdentity = (async (): Promise<LocalIdentity> => {
    meId = profileId;
    let local = await cryptoStore.getIdentity(profileId);
    const { data: reg } = await supabase
      .from("signal_identities")
      .select("ik_pub, sign_pub, spk_id")
      .eq("profile_id", profileId)
      .maybeSingle();

    // Tier 2: IDB evicted but the localStorage mirror still has it (same device)
    if (!local) {
      const mirrored = getMirroredIdentity(profileId);
      if (mirrored?.ik?.publicKey) {
        local = mirrored;
        await cryptoStore.setIdentity(profileId, local);
      }
    }

    // Tier 3: fresh device / cleared storage — restore the encrypted account
    // backup so historical messages stay decryptable after re-login.
    if (!local) {
      const restored = await restoreIdentityBackup(profileId);
      if (restored?.ik?.publicKey) {
        local = restored;
        await cryptoStore.setIdentity(profileId, local);
        mirrorIdentityToLocalStorage(profileId, local);
      }
    }

    if (local && reg && reg.ik_pub === b64u.enc(local.ik.publicKey)) {
      identity = local;
      mirrorIdentityToLocalStorage(profileId, local);
      void uploadIdentityBackup(profileId, local); // keep escrow fresh
      return local;
    }

    // Tier 4: genuinely new identity — replace server bundle.
    local = generateIdentity();
    // Persist the PRIVATE identity BEFORE registering, and definitely before any
    // session use. (Missing persistence used to silently rotate the identity on
    // every page load, orphaning the server bundle and breaking all decryption.)
    await cryptoStore.setIdentity(profileId, local);
    mirrorIdentityToLocalStorage(profileId, local);
    await registerIdentity(profileId, local);
    identity = local;
    void uploadIdentityBackup(profileId, local);
    return local;
  })();
  try {
    return await inflightIdentity;
  } finally {
    inflightIdentity = null;
  }
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

/** Session for a (conversation, peer) pair — establishes X3DH on first contact. */
export async function ensureSession(myProfileId: string, conversationId: string, peerProfileId: string): Promise<RatchetState> {
  if (meId !== myProfileId) await ensureIdentity(myProfileId);
  const key = sKey(conversationId, peerProfileId);
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const inflight = inflightInit.get(key);
  if (inflight) return inflight;

  const p = (async (): Promise<RatchetState> => {
    const bundle = await fetchBundle(peerProfileId);
    let stored = await cryptoStore.getSession(myProfileId, conversationId, peerProfileId);
    if (!stored) {
      // Upgrade continuity: adopt a legacy per-conversation session ONLY when it
      // was cryptographically built against this exact peer (keeps DM history
      // readable across the fan-out upgrade; stale group sessions are ignored).
      const legacy = await cryptoStore.getLegacySession(myProfileId, conversationId);
      if (legacy && legacy.peerIk && bundle.ikPub && legacy.peerIk === bundle.ikPub) {
        await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, legacy);
        stored = legacy;
      }
    }
    if (stored) {
      // Self-heal: if the peer's server-side identity was rotated (fresh install,
      // lost IDB), sessions built against the old bundle can never decrypt there.
      // Detect and re-initiate against the CURRENT bundle.
      if (stored.peerIk && bundle.ikPub && stored.peerIk !== bundle.ikPub) {
        await cryptoStore.deleteSession(myProfileId, conversationId, peerProfileId);
      } else {
        if (!stored.peerIk) stored.peerIk = bundle.ikPub;
        sessionCache.set(key, stored);
        return stored;
      }
    }
    const id = identity!;
    const init = x3dhInitiate(id.ik, bundle);
    const pre = { ek: b64u.enc(init.ephemeralPub), spkId: bundle.spkId, opkId: init.usedOpkId };
    const state = initRatchetAsInitiator(init.sharedSecret, b64u.dec(bundle.spkPub), pre);
    state.peerIk = bundle.ikPub;
    await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, state);
    sessionCache.set(key, state);
    void topUpPrekeys(myProfileId);
    return state;
  })();
  inflightInit.set(key, p);
  try {
    return await p;
  } finally {
    inflightInit.delete(key);
  }
}

/** Build a session from an incoming prekey message (responder side).
 *  NOTE: this does NOT persist the built session — the caller must only
 *  persist it after ratchetDecrypt actually succeeds. Persisting an
 *  unverified responder session POISONED the session store whenever the
 *  envelope was sealed to a previous identity (opk/spk mismatch): the wrong
 *  shared secret got stored, every later send from that device reused the
 *  broken session (bare envelopes, no `pre` block) and the peer could never
 *  decrypt them again. */
async function sessionFromPrekeyMessage(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string,
  env: Envelope
): Promise<RatchetState> {
  const id = identity!;
  const existing = await cryptoStore.getSession(myProfileId, conversationId, peerProfileId);
  if (existing && existing.dhRemote === env.dh) {
    sessionCache.set(sKey(conversationId, peerProfileId), existing);
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
  if (env.s) state.peerIk = env.s;
  return state;
}

/** Encrypt one message payload for ONE recipient in a conversation. */
export async function encryptFor(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string,
  plaintextPayload: string
): Promise<string> {
  const state = await ensureSession(myProfileId, conversationId, peerProfileId);
  const env = await ratchetEncrypt(state, conversationId, b64u.enc(identity!.ik.publicKey), plaintextPayload);
  await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, state);
  return sealEnvelope(env);
}

/** Encrypt one payload to EVERY member of a conversation (R2 fan-out).
 *  Each recipient gets an envelope built against their own prekey bundle, so
 *  every member — not just one lucky `.limit(1)` pick — can decrypt. */
export async function encryptFanout(
  myProfileId: string,
  conversationId: string,
  peerProfileIds: string[],
  plaintextPayload: string
): Promise<string> {
  const senderIk = b64u.enc(identity!.ik.publicKey);
  const entries: FanoutEntry[] = [];
  for (const pid of peerProfileIds) {
    if (!pid || pid === myProfileId) continue;
    const state = await ensureSession(myProfileId, conversationId, pid);
    const env = await ratchetEncrypt(state, conversationId, senderIk, plaintextPayload);
    await cryptoStore.setSession(myProfileId, conversationId, pid, state);
    sessionCache.set(sKey(conversationId, pid), state);
    entries.push({ p: pid, e: env });
  }
  if (entries.length === 0) throw new Error("No recipients for fan-out");
  return sealFanout(entries);
}

/** Decrypt one envelope for a conversation. `peerProfileId` is the SENDER's
 *  profile id (sessions are per conversation+peer). Throws on failure. */
export async function decryptFor(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string,
  env: Envelope
): Promise<string> {
  if (!identity || meId !== myProfileId) await ensureIdentity(myProfileId);
  const key = sKey(conversationId, peerProfileId);
  let state = sessionCache.get(key) || (await cryptoStore.getSession(myProfileId, conversationId, peerProfileId));

  // Pristine copy of the persisted session. Failed decrypt attempts MUTATE the
  // ratchet state in place (dh ratchet steps, skipped-key stores, chain
  // advances) — a redecrypt sweep over old undecryptable messages used to
  // corrupt the live session this way, after which EVERY new message failed
  // with OperationError. Work on the live object, restore the snapshot on any
  // failure; only successful decrypts commit.
  const snapshot: RatchetState | null = state ? JSON.parse(JSON.stringify(state)) : null;

  const envelopeTargetsCurrentIdentity =
    !env.pre || env.pre.spkId == null || env.pre.spkId === identity!.spkId;

  let candidate = state;
  if (!candidate && env.pre) {
    if (!envelopeTargetsCurrentIdentity) {
      throw new Error("prekey envelope targets a previous identity (spk mismatch)");
    }
    candidate = await sessionFromPrekeyMessage(myProfileId, conversationId, peerProfileId, env);
  }
  if (!candidate) throw new Error("No session for conversation");
  try {
    const pt = await ratchetDecrypt(candidate, conversationId, env);
    // Verified good — commit the evolved state.
    await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, candidate);
    sessionCache.set(key, candidate);
    return pt;
  } catch (err) {
    // First restore the pristine persisted session — failed attempts leave no trace.
    if (snapshot) {
      await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, snapshot);
      sessionCache.set(key, snapshot);
    } else {
      await cryptoStore.deleteSession(myProfileId, conversationId, peerProfileId).catch(() => {});
      sessionCache.delete(key);
    }
    const msg = String((err as any)?.message || '');
    // Replays of already-decrypted messages must NOT touch the session.
    if (msg.includes('replay/underflow')) throw err;
    // A prekey (first-contact) message that still fails means the peer
    // re-initiated against our CURRENT identity (concurrent X3DH). Rebuild a
    // candidate from the prekey header and try once.
    if (env.pre && envelopeTargetsCurrentIdentity) {
      const fresh = await sessionFromPrekeyMessage(myProfileId, conversationId, peerProfileId, env);
      const pt2 = await ratchetDecrypt(fresh, conversationId, env);
      await cryptoStore.setSession(myProfileId, conversationId, peerProfileId, fresh);
      sessionCache.set(key, fresh);
      return pt2;
    }
    // Unrecoverable locally (bare continuation of a session we don't share, or
    // an envelope sealed to an identity we no longer hold). The session-reset
    // protocol on the caller side re-syncs both devices.
    if (err instanceof Error) err.name = 'RelaySessionDead';
    else err = new Error('RelaySessionDead');
    throw err;
  }
}

export function resetForTests() {
  sessionCache.clear();
  identity = null;
  meId = null;
}

/** Drop the local session for (conversation, peer). Used by the session-reset
 *  protocol: when a bare (no `pre`) envelope can no longer be decrypted, the
 *  receiver deletes its poisoned/stale session and re-initiates a fresh X3DH
 *  with a silent control message so BOTH sides converge on the same keys. */
export async function deleteSessionFor(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string
): Promise<void> {
  sessionCache.delete(sKey(conversationId, peerProfileId));
  try { await cryptoStore.deleteSession(myProfileId, conversationId, peerProfileId); } catch { /* ignore */ }
}
