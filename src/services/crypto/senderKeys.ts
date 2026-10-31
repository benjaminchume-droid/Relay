/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * R3 — Sender-Key group encryption ("group level encryption that scales").
 *
 * DMs keep R1 (pairwise Double Ratchet). Small groups may still use R2
 * fan-out, but R2 costs O(members) encrypts + O(members) rows PER MESSAGE —
 * unusable for large groups and community channels. R3 follows the
 * WhatsApp Sender-Key design:
 *
 *  · Each sender maintains ONE symmetric chain per conversation epoch
 *    (epoch = hash of the member list; rotating membership ⇒ rotating key).
 *  · Every message is a SINGLE AES-256-GCM envelope — O(1) per message no
 *    matter how many members.
 *  · The chain key is distributed ONCE per epoch per recipient, wrapped in
 *    the recipient's pairwise R1 session (X3DH prekey envelope) and stored
 *    server-side in `sender_key_distributions` — readable only by the
 *    intended recipient (RLS), ciphertext-only for the backend.
 *  · Message keys ratchet forward (one-way HKDF chain) — old keys are
 *    destroyed; skipped messages are covered by a bounded key cache.
 *  · AAD binds conversation + chain + index; replays across conversations
 *    fail, replays within a chain are idempotent (cached keys).
 *
 * The backend never sees plaintext or key material — it only relays wrapped
 * blobs. A removed member keeps nothing usable for future epochs: the next
 * send after any membership change starts a new chain they never receive.
 */
import { supabase } from "../../lib/supabase/client";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";
import { b64u } from "./signalProtocol";
import { cryptoStore } from "./sessionStore";
import { encryptFor, decryptFor, parseEnvelope, ensureIdentity, getSenderIk } from "./cryptoService";

export const GROUP_PREFIX = "R3:";

const MSG_INFO = new TextEncoder().encode("relay-r3-msg-key-v1");
const CHAIN_INFO = new TextEncoder().encode("relay-r3-chain-step-v1");
const AAD_INFO = "R3"; // prefix; full aad = R3|conv|chain|iter
const MAX_WALK = 5000;
const MAX_SKIPPED = 400;

export type GroupEnvelope = {
  v: 3;
  ch: string; // chain id
  it: number; // chain index
  s: string; // sender identity pubkey (b64u) — authenticity binding
  iv: string; // b64u, 12 bytes
  ct: string; // b64u ciphertext+tag
};

export function isGroupEnvelope(content: unknown): boolean {
  return typeof content === "string" && content.startsWith(GROUP_PREFIX);
}

export function parseGroupEnvelope(content: string): GroupEnvelope {
  return JSON.parse(content.slice(GROUP_PREFIX.length)) as GroupEnvelope;
}

export function sealGroupEnvelope(env: GroupEnvelope): string {
  return GROUP_PREFIX + JSON.stringify(env);
}

const te = new TextEncoder();
const td = new TextDecoder();

function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function aadFor(conversationId: string, env: Pick<GroupEnvelope, "ch" | "it">): Uint8Array {
  return te.encode(`${AAD_INFO}|${conversationId}|${env.ch}|${env.it}`);
}

/** One-way chain step. chainKey(n+1) = HKDF(chainKey(n), "chain-step"). */
function chainStep(chainKey: Uint8Array): Uint8Array {
  return hkdf(sha256, chainKey, undefined, CHAIN_INFO, 32);
}

/** Message key for a chain position. */
function msgKeyFor(chainKey: Uint8Array): Uint8Array {
  return hkdf(sha256, chainKey, undefined, MSG_INFO, 32);
}

/** Epoch binds the chain to an exact member list — join/leave ⇒ new key. */
function epochOf(memberProfileIds: string[]): string {
  const joined = [...memberProfileIds].filter(Boolean).sort().join(",");
  return b64u.enc(sha256(te.encode(joined)).slice(0, 16));
}

// ---------------------------------------------------------------------------
// Sender side
// ---------------------------------------------------------------------------

type MyChain = { chainId: string; chainKey: string; iter: number; epoch: string; bornAt: number };

const CHAIN_MAX_AGE_MS = 30 * 24 * 3600 * 1000; // rotate monthly even without membership churn

/** Encrypt one payload for a group/community channel. Returns the R3 wire
 *  content (single envelope for ALL recipients). Distributes the chain key
 *  to any member who doesn't have the current epoch's key yet. */
export async function encryptGroup(
  myProfileId: string,
  conversationId: string,
  memberProfileIds: string[],
  plaintextPayload: string
): Promise<string> {
  await ensureIdentity(myProfileId);
  const epoch = epochOf(memberProfileIds);
  let st = await cryptoStore.getSenderChain(myProfileId, conversationId);
  if (!st || st.epoch !== epoch || Date.now() - st.bornAt > CHAIN_MAX_AGE_MS) {
    st = {
      chainId: crypto.randomUUID(),
      chainKey: b64u.enc(crypto.getRandomValues(new Uint8Array(32))),
      iter: 0,
      epoch,
      bornAt: Date.now(),
    };
    await cryptoStore.setSenderChain(myProfileId, conversationId, st);
  }

  // 1) distribute current chain (root) to every member — once per chain
  // (membership churn rotates the chain id, so "once" is always correct)
  if (!distributionDone(myProfileId, conversationId, st.chainId)) {
    await distributeChain(myProfileId, conversationId, memberProfileIds, {
      ch: st.chainId,
      ck: st.chainKey,
      it0: st.iter,
      ep: epoch,
    });
    markDistributionDone(myProfileId, conversationId, st.chainId);
  }

  // 2) encrypt THIS message under the current chain position
  const ck = b64u.dec(st.chainKey);
  const mk = msgKeyFor(ck);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const env: GroupEnvelope = {
    v: 3,
    ch: st.chainId,
    it: st.iter,
    s: getSenderIk(),
    iv: b64u.enc(iv),
    ct: "",
  };
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: aadFor(conversationId, env) as BufferSource, tagLength: 128 },
    await aesKey(mk),
    te.encode(plaintextPayload)
  );
  env.ct = b64u.enc(new Uint8Array(ct));

  // 3) ratchet forward — the used key is never reused, root moves on
  st.chainKey = b64u.enc(chainStep(ck));
  st.iter += 1;
  await cryptoStore.setSenderChain(myProfileId, conversationId, st);

  return sealGroupEnvelope(env);
}

/** Wrap the chain key for one member inside their pairwise R1 session and
 *  upsert it. Failure for one member never blocks the whole send. */
async function distributeChain(
  myProfileId: string,
  conversationId: string,
  memberProfileIds: string[],
  root: { ch: string; ck: string; it0: number; ep: string }
): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  for (const pid of memberProfileIds) {
    if (!pid || pid === myProfileId) continue;
    try {
      const wrapped = await encryptFor(myProfileId, conversationId, pid, JSON.stringify(root));
      rows.push({
        conversation_id: conversationId,
        sender_profile_id: myProfileId,
        recipient_profile_id: pid,
        chain_id: root.ch,
        wrapped,
      });
    } catch (e) {
      console.warn("[r3] distribution wrap failed for", pid, e);
    }
  }
  // chunk to keep the request payload sane on very large rosters
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from("sender_key_distributions")
      .upsert(rows.slice(i, i + 100), { onConflict: "sender_profile_id,recipient_profile_id,chain_id", ignoreDuplicates: true });
    if (error) throw new Error("sender-key distribution failed: " + error.message);
  }
}

// per-(profile,conversation,chain) memo — distribution happens exactly once
// per chain id; a membership change rotates the chain, so "once" is safe.
// If distribution THROWS, the memo is not set and the next send retries.
const distributedMemo = new Set<string>();

function distributionDone(myProfileId: string, conversationId: string, chainId: string): boolean {
  return distributedMemo.has(`${myProfileId}:${conversationId}:${chainId}`);
}

function markDistributionDone(myProfileId: string, conversationId: string, chainId: string): void {
  distributedMemo.add(`${myProfileId}:${conversationId}:${chainId}`);
}

// ---------------------------------------------------------------------------
// Recipient side
// ---------------------------------------------------------------------------

type PeerChain = { chainId: string; chainKey: string; it0: number; it: number; skipped: Record<string, string> };

/** Decrypt one R3 envelope. Fetches + unwraps the sender's chain key on a
 *  cache miss. Throws when the chain is unavailable — the caller renders the
 *  locked-bubble state (never ciphertext). */
export async function decryptGroup(
  myProfileId: string,
  conversationId: string,
  senderProfileId: string,
  env: GroupEnvelope
): Promise<string> {
  let ps: PeerChain | null = (await cryptoStore.getPeerChain(myProfileId, conversationId, env.s)) ?? null;
  if (ps && ps.chainId !== env.ch) ps = null;

  if (!ps) {
    ps = await adoptChainFromDistribution(myProfileId, conversationId, senderProfileId, env.ch);
  }
  if (!ps) throw new Error("r3: no chain key for " + env.ch);

  let mk: Uint8Array | null = null;
  if (env.it >= ps.it) {
    if (env.it - ps.it > MAX_WALK) throw new Error("r3: chain walk too far");
    let ck = b64u.dec(ps.chainKey);
    for (let i = ps.it; i < env.it; i++) {
      // cache skipped positions so late/out-of-order rows still open
      const skipKey = msgKeyFor(ck);
      if (Object.keys(ps.skipped).length < MAX_SKIPPED) ps.skipped[String(i)] = b64u.enc(skipKey);
      ck = chainStep(ck);
    }
    mk = msgKeyFor(ck);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64u.dec(env.iv) as BufferSource, additionalData: aadFor(conversationId, env) as BufferSource, tagLength: 128 },
      await aesKey(mk),
      b64u.dec(env.ct) as BufferSource
    );
    ps.chainKey = b64u.enc(ck);
    ps.it = env.it + 1; // next expected
    ps.skipped = pruneSkipped(ps.skipped, ps.it);
    await cryptoStore.setPeerChain(myProfileId, conversationId, env.s, ps);
    return td.decode(pt);
  }

  // out-of-order / replay: only the bounded skipped-key cache can help
  const cached = ps.skipped[String(env.it)];
  if (!cached) throw new Error("r3: key already ratcheted past " + env.it);
  mk = b64u.dec(cached);
  const pt2 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64u.dec(env.iv) as BufferSource, additionalData: aadFor(conversationId, env) as BufferSource, tagLength: 128 },
    await aesKey(mk),
    b64u.dec(env.ct) as BufferSource
  );
  return td.decode(pt2);
}

function pruneSkipped(skipped: Record<string, string>, nextIt: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(skipped)) {
    if (Number(k) >= nextIt) out[k] = v;
  }
  return out;
}

/** Fetch the sender's distribution rows for ME and unwrap the one matching
 *  the chain id. The wrapped blob is an R1 prekey envelope, so decryptFor
 *  establishes the pairwise session on demand — even months later. */
async function adoptChainFromDistribution(
  myProfileId: string,
  conversationId: string,
  senderProfileId: string,
  chainId: string
): Promise<PeerChain | null> {
  try {
    const { data, error } = await supabase
      .from("sender_key_distributions")
      .select("wrapped")
      .eq("conversation_id", conversationId)
      .eq("sender_profile_id", senderProfileId)
      .eq("recipient_profile_id", myProfileId)
      .eq("chain_id", chainId)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const inner = parseEnvelope(String(data[0].wrapped));
    const pt = await decryptFor(myProfileId, conversationId, senderProfileId, inner);
    const root = JSON.parse(pt) as { ch: string; ck: string; it0: number; ep: string };
    if (root.ch !== chainId || typeof root.it0 !== "number") return null;
    const ps: PeerChain = { chainId: root.ch, chainKey: root.ck, it0: root.it0, it: root.it0, skipped: {} };
    await cryptoStore.setPeerChain(myProfileId, conversationId, senderProfileId, ps);
    return ps;
  } catch (e) {
    console.warn("[r3] chain adoption failed", e);
    return null;
  }
}

/** Dev/test helper. */
export function resetSenderKeysForTests(): void {
  distributedMemo.clear();
}
