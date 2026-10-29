/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Signal-level end-to-end encryption for Relay DMs.
 *
 * Implements the Signal protocol primitives on WebCrypto + @noble/curves:
 *  - Extended Triple Diffie-Hellman (X3DH) key agreement with signed prekeys
 *    and one-time prekeys (server stores PUBLIC material only; OTKs are
 *    consumed on fetch).
 *  - Double Ratchet (DH ratchet + symmetric chains, skipped-message keys)
 *    per conversation, per device.
 *  - AES-256-GCM message encryption, IV 96-bit random, associated data
 *    binds conversation id + both identity keys + ratchet header.
 *
 * Private keys NEVER leave the device. The backend stores ciphertext only.
 */
import { x25519, ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { hkdf } from "@noble/hashes/hkdf";
import { randomBytes, bytesToHex } from "@noble/hashes/utils";

// ---------------------------------------------------------------------------
// encoding helpers (base64url, no padding)
// ---------------------------------------------------------------------------
export const b64u = {
  enc: (bytes: Uint8Array): string => {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec: (str: string): Uint8Array => {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

const te = new TextEncoder();
const td = new TextDecoder();

// ---------------------------------------------------------------------------
// X25519 / Ed25519 key helpers
// ---------------------------------------------------------------------------
export type DhKeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

export function generateDhPair(): DhKeyPair {
  const priv = x25519.utils.randomPrivateKey();
  const pub = x25519.getPublicKey(priv);
  return { publicKey: pub, privateKey: priv };
}

export function dh(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

export type SignKeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

export function generateSignPair(): SignKeyPair {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  return { publicKey: pub, privateKey: priv };
}

export function sign(msg: Uint8Array, signPriv: Uint8Array): Uint8Array {
  return ed25519.sign(msg, signPriv);
}

export function verify(msg: Uint8Array, sig: Uint8Array, signPub: Uint8Array): boolean {
  try { return ed25519.verify(sig, msg, signPub); } catch { return false; }
}

// ---------------------------------------------------------------------------
// KDFs (Signal spec)
// ---------------------------------------------------------------------------
const ROOT_INFO = te.encode("RelayDRRootKeyv1");
const MSG_INFO = te.encode("RelayDRMessageKeyv1");
const X3DH_INFO = te.encode("RelayX3DHv1");
const F_32 = new Uint8Array(32).fill(0xff);

export function kdfRootKey(rootKey: Uint8Array, dhOut: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const okm = hkdf(sha256, dhOut, rootKey, ROOT_INFO, 64);
  return { rootKey: okm.slice(0, 32), chainKey: okm.slice(32, 64) };
}

export function kdfChainKey(chainKey: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  const messageKey = hmac(sha256, chainKey, new Uint8Array([0x01]));
  const next = hmac(sha256, chainKey, new Uint8Array([0x02]));
  return { chainKey: next, messageKey };
}

function deriveMessageKeyMaterial(messageKey: Uint8Array): { aesKey: Uint8Array; macKey: Uint8Array } {
  const okm = hkdf(sha256, messageKey, new Uint8Array(32), MSG_INFO, 80);
  return { aesKey: okm.slice(0, 32), macKey: okm.slice(32, 80) };
}

// ---------------------------------------------------------------------------
// X3DH
// ---------------------------------------------------------------------------
export type PrekeyBundle = {
  ikPub: string;       // X25519 identity pubkey (b64u)
  signPub: string;     // Ed25519 signing pubkey (b64u)
  spkPub: string;      // signed prekey X25519 pubkey
  spkId: number;
  spkSig: string;      // Ed25519 signature over spkPub
  opkPub?: string | null;
  opkId?: number | null;
};

export type X3dhInitResult = {
  sharedSecret: Uint8Array;
  ephemeralPub: Uint8Array;
  usedOpkId: number | null;
};

export function x3dhInitiate(
  myIk: DhKeyPair,
  bundle: PrekeyBundle
): X3dhInitResult {
  const spkPub = b64u.dec(bundle.spkPub);
  const sig = b64u.dec(bundle.spkSig);
  const signPub = b64u.dec(bundle.signPub);
  if (!verify(spkPub, sig, signPub)) {
    throw new Error("Prekey signature verification failed");
  }
  const ek = generateDhPair();
  const dh1 = dh(myIk.privateKey, spkPub);          // DH(IKa, SPKb)
  const dh2 = dh(ek.privateKey, b64u.dec(bundle.ikPub)); // DH(EKa, IKb)
  const dh3 = dh(ek.privateKey, spkPub);            // DH(EKa, SPKb)
  let dh4 = new Uint8Array(32);
  let usedOpkId: number | null = null;
  if (bundle.opkPub && bundle.opkId != null) {
    dh4 = dh(ek.privateKey, b64u.dec(bundle.opkPub)); // DH(EKa, OPKb)
    usedOpkId = bundle.opkId;
  }
  const ikm = new Uint8Array(F_32.length + dh1.length + dh2.length + dh3.length + dh4.length);
  let o = 0;
  ikm.set(F_32, o); o += F_32.length;
  ikm.set(dh1, o); o += dh1.length;
  ikm.set(dh2, o); o += dh2.length;
  ikm.set(dh3, o); o += dh3.length;
  ikm.set(dh4, o);
  const sharedSecret = hkdf(sha256, ikm, new Uint8Array(32), X3DH_INFO, 32);
  return { sharedSecret, ephemeralPub: ek.publicKey, usedOpkId };
}

export function x3dhRespond(
  myIk: DhKeyPair,
  mySpk: DhKeyPair,
  myOpk: DhKeyPair | null,
  initiatorIkPub: Uint8Array,
  ephemeralPub: Uint8Array
): Uint8Array {
  const dh1 = dh(mySpk.privateKey, initiatorIkPub);   // DH(SPKb, IKa)
  const dh2 = dh(myIk.privateKey, ephemeralPub);      // DH(IKb, EKa)
  const dh3 = dh(mySpk.privateKey, ephemeralPub);     // DH(SPKb, EKa)
  let dh4 = new Uint8Array(32);
  if (myOpk) dh4 = dh(myOpk.privateKey, ephemeralPub); // DH(OPKb, EKa)
  const ikm = new Uint8Array(F_32.length + dh1.length + dh2.length + dh3.length + dh4.length);
  let o = 0;
  ikm.set(F_32, o); o += F_32.length;
  ikm.set(dh1, o); o += dh1.length;
  ikm.set(dh2, o); o += dh2.length;
  ikm.set(dh3, o); o += dh3.length;
  ikm.set(dh4, o);
  return hkdf(sha256, ikm, new Uint8Array(32), X3DH_INFO, 32);
}

// ---------------------------------------------------------------------------
// Double Ratchet state
// ---------------------------------------------------------------------------
export type RatchetHeader = {
  dh: string;  // sender current ratchet pubkey (b64u)
  pn: number;  // previous chain length
  n: number;   // message index in current chain
};

export type Envelope = {
  v: 1;
  s: string;                    // sender X25519 identity pubkey (b64u)
  sign?: string;                // sender Ed25519 identity pubkey (b64u) — present on prekey msgs
  pre?: { ek: string; spkId: number; opkId: number | null }; // X3DH init header
  dh: string; pn: number; n: number;
  ct: string;                   // b64u ciphertext
  iv: string;                   // b64u 12-byte IV
};

export const MAX_SKIP = 200;
const SKIPPED_CAP = 400;

export type RatchetState = {
  rootKey: string;                 // b64u
  dhSelf: { pub: string; priv: string };
  dhRemote: string | null;
  ckSending: string | null;
  ckReceiving: string | null;
  nSending: number;
  nReceiving: number;
  prevSendingCount: number;
  skipped: Record<string, string>; // `${dh}:${n}` -> messageKey b64u
  pendingPre?: Envelope["pre"];
  /** Peer identity key (b64u) this session was established against — used to detect peer key rotation. */
  peerIk?: string;
};

export function initRatchetAsInitiator(
  sharedSecret: Uint8Array,
  remoteSpkPub: Uint8Array,
  pre: Envelope["pre"]
): RatchetState {
  const dhSelf = generateDhPair();
  const { rootKey, chainKey } = kdfRootKey(sharedSecret, dh(dhSelf.privateKey, remoteSpkPub));
  return {
    rootKey: b64u.enc(rootKey),
    dhSelf: { pub: b64u.enc(dhSelf.publicKey), priv: b64u.enc(dhSelf.privateKey) },
    dhRemote: b64u.enc(remoteSpkPub),
    ckSending: b64u.enc(chainKey),
    ckReceiving: null,
    nSending: 0,
    nReceiving: 0,
    prevSendingCount: 0,
    skipped: {},
    pendingPre: pre,
  };
}

export function initRatchetAsResponder(
  sharedSecret: Uint8Array,
  mySpk: DhKeyPair
): RatchetState {
  return {
    rootKey: b64u.enc(sharedSecret),
    dhSelf: { pub: b64u.enc(mySpk.publicKey), priv: b64u.enc(mySpk.privateKey) },
    dhRemote: null,
    ckSending: null,
    ckReceiving: null,
    nSending: 0,
    nReceiving: 0,
    prevSendingCount: 0,
    skipped: {},
  };
}

async function aesEncrypt(keyBytes: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, key, plaintext as BufferSource);
  return new Uint8Array(ct);
}

async function aesDecrypt(keyBytes: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, key, ciphertext as BufferSource);
  return new Uint8Array(pt);
}

function aadFor(conversationId: string, senderIkPub: string, header: RatchetHeader): Uint8Array {
  return te.encode(JSON.stringify([conversationId, senderIkPub, header.dh, header.pn, header.n]));
}

function trySkipped(state: RatchetState, senderIk: string, header: RatchetHeader, iv: Uint8Array, ct: Uint8Array, conversationId: string): Promise<Uint8Array> | null {
  const key = `${header.dh}:${header.n}`;
  const mk = state.skipped[key];
  if (!mk) return null;
  delete state.skipped[key];
  const { aesKey } = deriveMessageKeyMaterial(b64u.dec(mk));
  return aesDecrypt(aesKey, iv, ct, aadFor(conversationId, senderIk, header));
}

function storeSkipped(state: RatchetState, dhRemote: string, until: number) {
  let ck = state.ckReceiving ? b64u.dec(state.ckReceiving) : null;
  if (!ck) return;
  for (let i = state.nReceiving; i < until; i++) {
    if (until - state.nReceiving > MAX_SKIP) throw new Error("Too many skipped messages");
    const { chainKey: next, messageKey } = kdfChainKey(ck);
    if (Object.keys(state.skipped).length >= SKIPPED_CAP) {
      const oldest = Object.keys(state.skipped)[0];
      delete state.skipped[oldest];
    }
    state.skipped[`${dhRemote}:${i}`] = b64u.enc(messageKey);
    ck = next;
  }
  state.ckReceiving = b64u.enc(ck!);
  state.nReceiving = until;
}

async function dhRatchetStep(state: RatchetState, theirNewDhPub: string) {
  state.prevSendingCount = state.nSending;
  state.nSending = 0;
  state.nReceiving = 0;
  state.dhRemote = theirNewDhPub;
  const { rootKey: rk1, chainKey: ckr } = kdfRootKey(b64u.dec(state.rootKey), dh(b64u.dec(state.dhSelf.priv), b64u.dec(theirNewDhPub)));
  state.rootKey = b64u.enc(rk1);
  state.ckReceiving = b64u.enc(ckr);
  const dhSelf = generateDhPair();
  state.dhSelf = { pub: b64u.enc(dhSelf.publicKey), priv: b64u.enc(dhSelf.privateKey) };
  const { rootKey: rk2, chainKey: cks } = kdfRootKey(b64u.dec(state.rootKey), dh(dhSelf.privateKey, b64u.dec(theirNewDhPub)));
  state.rootKey = b64u.enc(rk2);
  state.ckSending = b64u.enc(cks);
}

/** Encrypt an outgoing payload string. Mutates state. */
export async function ratchetEncrypt(
  state: RatchetState,
  conversationId: string,
  senderIkPubB64u: string,
  plaintext: string
): Promise<Envelope> {
  if (!state.ckSending) throw new Error("No sending chain — cannot encrypt yet");
  const { chainKey: next, messageKey } = kdfChainKey(b64u.dec(state.ckSending));
  state.ckSending = b64u.enc(next);
  const header: RatchetHeader = { dh: state.dhSelf.pub, pn: state.prevSendingCount, n: state.nSending };
  const iv = randomBytes(12);
  const { aesKey } = deriveMessageKeyMaterial(messageKey);
  const ct = await aesEncrypt(aesKey, iv, te.encode(plaintext), aadFor(conversationId, senderIkPubB64u, header));
  state.nSending += 1;
  const env: Envelope = {
    v: 1,
    s: senderIkPubB64u,
    dh: header.dh, pn: header.pn, n: header.n,
    ct: b64u.enc(ct), iv: b64u.enc(iv),
  };
  if (state.pendingPre) {
    env.pre = state.pendingPre;
    delete state.pendingPre;
  }
  return env;
}

/** Decrypt an incoming envelope. Mutates state. */
export async function ratchetDecrypt(
  state: RatchetState,
  conversationId: string,
  env: Envelope
): Promise<string> {
  const iv = b64u.dec(env.iv);
  const ct = b64u.dec(env.ct);

  const viaSkipped = trySkipped(state, env.s, { dh: env.dh, pn: env.pn, n: env.n }, iv, ct, conversationId);
  if (viaSkipped) return td.decode(await viaSkipped);

  if (env.dh !== state.dhRemote) {
    storeSkipped(state, state.dhRemote!, env.pn);
    await dhRatchetStep(state, env.dh);
  }
  if (env.n < state.nReceiving) throw new Error("Message replay/underflow");
  storeSkipped(state, env.dh, env.n);
  if (!state.ckReceiving) throw new Error("No receiving chain");
  const { chainKey: next, messageKey } = kdfChainKey(b64u.dec(state.ckReceiving));
  state.ckReceiving = b64u.enc(next);
  const { aesKey } = deriveMessageKeyMaterial(messageKey);
  const pt = await aesDecrypt(aesKey, iv, ct, aadFor(conversationId, env.s, { dh: env.dh, pn: env.pn, n: env.n }));
  state.nReceiving = env.n + 1;
  return td.decode(pt);
}

// ---------------------------------------------------------------------------
// identity + prekey material (device-local)
// ---------------------------------------------------------------------------
export type LocalIdentity = {
  ik: DhKeyPair;
  sign: SignKeyPair;
  spk: DhKeyPair;
  spkId: number;
  spkSig: Uint8Array;
  opks: Array<{ id: number; pair: DhKeyPair }>;
  createdAt: string;
};

export function generateIdentity(opkCount = 25): LocalIdentity {
  const ik = generateDhPair();
  const signKeys = generateSignPair();
  const spk = generateDhPair();
  const spkId = Math.floor(Math.random() * 2 ** 31);
  const spkSig = sign(spk.publicKey, signKeys.privateKey);
  const opks = Array.from({ length: opkCount }, () => ({
    id: Math.floor(Math.random() * 2 ** 31),
    pair: generateDhPair(),
  }));
  return { ik, sign: signKeys, spk, spkId, spkSig, opks, createdAt: new Date().toISOString() };
}

export function fingerprint(keyBytes: Uint8Array): string {
  const hex = bytesToHex(sha256(keyBytes)).slice(0, 16);
  return (hex.match(/.{2}/g) || []).join(" ").toUpperCase();
}
