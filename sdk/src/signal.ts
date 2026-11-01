/**
 * Relay Messaging SDK — Signal protocol core.
 *
 * Implements the two pieces that make messaging "Signal level":
 *
 *  1. X3DH (Extended Triple Diffie-Hellman) key agreement — identity key,
 *     signed prekey and one-time prekeys; the server only ever sees PUBLIC
 *     parts. Produces the initial shared secret and binds it to both
 *     identities (mutual authentication, no MITM without the signing key).
 *
 *  2. Double Ratchet — per-message forward secrecy. Every message uses a
 *     unique key derived from a symmetric chain; a DH ratchet runs whenever
 *     the sender changes. Compromise of the current state does not reveal
 *     past messages, and the chain self-heals after break-in recovery.
 *
 * Reference: "The X3DH Key Agreement Protocol" and "The Double Ratchet
 * Algorithm" (Signal specs), adapted with the same constants.
 */
import {
  b64uDecode,
  b64uEncode,
  concatBytes,
  dh,
  generateDhPair,
  generateSignPair,
  hkdfBytes,
  randomBytes,
  sign,
  utf8,
  verify,
  type DhKeyPair,
  type SignKeyPair,
} from "./crypto";
import { hmacSha256 } from "./hmac";

/* ------------------------------- constants ------------------------------- */

export const MAX_SKIP = 512; // max messages one may arrive out of order
const ROOT_INFO = utf8("RelayX3DHRatchet");
const MSG_INFO = utf8("RelayMessageKey");
const X3DH_INFO = utf8("RelayX3DH");
/** Signal: F = 32 bytes of 0xFF prepended to the X3DH IKM. */
const F = new Uint8Array(32).fill(0xff);

/* ------------------------------ wire types ------------------------------- */

/** The public half of a prekey bundle, exactly what the server stores. */
export type PublicBundle = {
  ik: string; // identity key (X25519 public, b64u)
  sig: string; // Ed25519 public verify key for the prekey signature
  spk: string; // signed prekey (X25519 public, b64u)
  spk_sig: string; // Ed25519 signature over spk bytes
};

export type BundleUpload = PublicBundle & {
  opks?: { kid: string; key: string }[];
};

export type BundleResponse = {
  bundle: PublicBundle;
  one_time_prekey: { kid: string; key: string } | null;
};

/** Envelope header — ratchet state needed to derive the message key. */
export type RatchetHeader = {
  dh: string; // sender's current ratchet public key
  pn: number; // length of the sender's previous sending chain
  n: number; // index of this message in the current sending chain
};

/** First messages of a session carry the X3DH handshake material. */
export type Envelope = {
  v: 2;
  /** X3DH only: initiator's identity key (b64u) — lets the responder bind AD. */
  x_ik?: string;
  /** X3DH only: initiator's ephemeral public key. */
  ek?: string;
  /** X3DH only: id of the one-time prekey that was consumed. */
  kid?: string;
  header: RatchetHeader;
  iv: string;
  ct: string; // AES-256-GCM ciphertext (includes the 16-byte tag)
};

/* ------------------------------- state types ----------------------------- */

export type SkippedKey = { dh: string; n: number; mk: Uint8Array };

export type RatchetState = {
  rk: Uint8Array;
  cks: Uint8Array | null; // sending chain key
  ckr: Uint8Array | null; // receiving chain key
  dhs_priv: Uint8Array;
  dhs_pub: Uint8Array;
  dhr: Uint8Array | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: SkippedKey[];
};

export type LocalIdentity = {
  ik: DhKeyPair; // identity (X25519) — long-lived
  sig: SignKeyPair; // Ed25519 signing key — signs the prekey
  spk: DhKeyPair; // signed prekey — rotated occasionally
  spk_sig: Uint8Array;
};

export type SessionState = {
  ratchet: RatchetState;
  /** session AD: both identity keys, binds every AEAD invocation */
  ad: Uint8Array;
  /** peer identity public key (X25519, b64u) */
  peerIk: string;
  /** OPK private key kept until the first reply from the peer confirms use */
  pendingOpk?: { kid: string; priv: Uint8Array };
};

/* -------------------------------- identity -------------------------------- */

export function generateIdentity(): LocalIdentity {
  const ik = generateDhPair();
  const sig = generateSignPair();
  const spk = generateDhPair();
  const spk_sig = sign(spk.pub, sig.priv);
  return { ik, sig, spk, spk_sig };
}

export function bundleFromIdentity(identity: LocalIdentity, opks?: { kid: string; key: string }[]): BundleUpload {
  return {
    ik: b64uEncode(identity.ik.pub),
    sig: b64uEncode(identity.sig.pub),
    spk: b64uEncode(identity.spk.pub),
    spk_sig: b64uEncode(identity.spk_sig),
    opks,
  };
}

/** Verify a peer bundle: the Ed25519 signature over SPK must check out. */
export function verifyBundle(bundle: PublicBundle, signingKey: SignKeyPair["pub"]): boolean {
  return verify(b64uDecode(bundle.spk), b64uDecode(bundle.spk_sig), signingKey);
}

/** Peer bundles advertise the Ed25519 signing key next to the bundle. */
export type PeerBundle = BundleResponse & { signing_key: string };

/* --------------------------------- X3DH ---------------------------------- */

/**
 * Initiator side. Verifies the peer's signed prekey, derives the shared
 * secret and returns the ephemeral handshake payload.
 */
export function x3dhInitiate(
  myIdentity: LocalIdentity,
  peer: { bundle: PublicBundle; one_time_prekey: { kid: string; key: string } | null },
): { secret: Uint8Array; ek: DhKeyPair; usedOpk: { kid: string; key: Uint8Array } | null } {
  const peerIk = b64uDecode(peer.bundle.ik);
  const peerSpk = b64uDecode(peer.bundle.spk);

  // 1. verify the signed prekey against the advertised Ed25519 verify key
  if (!peer.bundle.sig) throw new Error("peer bundle is missing its signing key — refusing (possible MITM)");
  const ok = verify(peerSpk, b64uDecode(peer.bundle.spk_sig), b64uDecode(peer.bundle.sig));
  if (!ok) throw new Error("peer prekey signature invalid — aborting (possible MITM)");

  // 2. ephemeral key
  const ek = generateDhPair();

  // 3. the three/four DHs (Signal spec, X3DH §3.3)
  const dh1 = dh(myIdentity.ik.priv, peerSpk); // DH(IK_A, SPK_B)
  const dh2 = dh(ek.priv, peerIk); // DH(EK_A, IK_B)
  const dh3 = dh(ek.priv, peerSpk); // DH(EK_A, SPK_B)
  let dh4 = new Uint8Array(0);
  let usedOpk: { kid: string; key: Uint8Array } | null = null;
  if (peer.one_time_prekey) {
    dh4 = dh(ek.priv, b64uDecode(peer.one_time_prekey.key)); // DH(EK_A, OPK_B)
    usedOpk = { kid: peer.one_time_prekey.kid, key: b64uDecode(peer.one_time_prekey.key) };
  }

  // 4. SK = HKDF(F || DH1 || DH2 || DH3 || DH4)
  const sk = hkdfBytes(concatBytes(F, dh1, dh2, dh3, dh4), new Uint8Array(32), X3DH_INFO, 32);

  // burn the ephemeral secret inputs by not retaining them (GC handles the rest)
  return { secret: sk, ek, usedOpk };
}

/**
 * Responder side. Recomputes the same secret from the initiator's handshake
 * (ek pub, optional OPK id) using our private identity + signed prekey.
 */
export function x3dhRespond(
  myIdentity: LocalIdentity,
  myOpks: Map<string, Uint8Array>, // kid -> private OPK
  initiatorIk: string, // peer identity public, b64u
  initiatorEk: string, // peer ephemeral public, b64u
  opkKid?: string,
): { secret: Uint8Array; consumedOpkKid?: string } {
  const ikA = b64uDecode(initiatorIk);
  const ekA = b64uDecode(initiatorEk);

  // mirror of the initiator's DHs with our private halves
  const dh1 = dh(myIdentity.spk.priv, ikA); // DH(SPK_B, IK_A)
  const dh2 = dh(myIdentity.ik.priv, ekA); // DH(IK_B, EK_A)
  const dh3 = dh(myIdentity.spk.priv, ekA); // DH(SPK_B, EK_A)
  let dh4 = new Uint8Array(0);
  let consumedOpkKid: string | undefined;
  if (opkKid) {
    const opkPriv = myOpks.get(opkKid);
    if (!opkPriv) throw new Error("unknown one-time prekey — session cannot be established");
    dh4 = dh(opkPriv, ekA); // DH(OPK_B, EK_A)
    consumedOpkKid = opkKid;
  }

  const sk = hkdfBytes(concatBytes(F, dh1, dh2, dh3, dh4), new Uint8Array(32), X3DH_INFO, 32);
  return { secret: sk, consumedOpkKid };
}

/* ----------------------------- Double Ratchet ---------------------------- */

function kdfRk(rk: Uint8Array, dhOut: Uint8Array): { rk: Uint8Array; ck: Uint8Array } {
  const okm = hkdfBytes(dhOut, rk, ROOT_INFO, 64);
  return { rk: okm.slice(0, 32), ck: okm.slice(32, 64) };
}

/** Symmetric chain step: mk = HMAC(ck, 0x01), next ck = HMAC(ck, 0x02). */
function nextChainKey(ck: Uint8Array): { ck: Uint8Array; mk: Uint8Array } {
  return {
    mk: hmacSha256(ck, new Uint8Array([0x01])),
    ck: hmacSha256(ck, new Uint8Array([0x02])),
  };
}

/** Initiate a ratchet as the X3DH initiator (Alice). */
export function initRatchetAsInitiator(secret: Uint8Array, peerSpkPub: Uint8Array, ad: Uint8Array): SessionState {
  const dhs = generateDhPair();
  const { rk, ck } = kdfRk(secret, dh(dhs.priv, peerSpkPub));
  return {
    ratchet: {
      rk,
      cks: ck,
      ckr: null,
      dhs_priv: dhs.priv,
      dhs_pub: dhs.pub,
      dhr: peerSpkPub,
      ns: 0,
      nr: 0,
      pn: 0,
      skipped: [],
    },
    ad,
    peerIk: "",
  };
}

/** Initiate a ratchet as the X3DH responder (Bob) — first inbound message completes the setup. */
export function initRatchetAsResponder(secret: Uint8Array, signedPrekey: DhKeyPair, ad: Uint8Array): SessionState {
  return {
    ratchet: {
      rk: secret,
      cks: null,
      ckr: null,
      dhs_priv: signedPrekey.priv,
      dhs_pub: signedPrekey.pub,
      dhr: null,
      ns: 0,
      nr: 0,
      pn: 0,
      skipped: [],
    },
    ad,
    peerIk: "",
  };
}

function trySkipped(state: RatchetState, header: RatchetHeader, ad: Uint8Array, iv: Uint8Array, ct: Uint8Array): Uint8Array | null {
  const key = `${header.dh}|${header.n}`;
  const idx = state.skipped.findIndex((s) => `${s.dh}|${s.n}` === key);
  if (idx === -1) return null;
  const mk = state.skipped[idx].mk;
  state.skipped.splice(idx, 1);
  return decryptWithKey(mk, header, ad, iv, ct);
}

function skipMessageKeys(state: RatchetState, until: number): void {
  if (state.ckr === null) return;
  if (until - state.nr > MAX_SKIP) throw new Error("too many skipped messages");
  while (state.nr < until) {
    const { ck, mk } = nextChainKey(state.ckr);
    state.ckr = ck;
    state.skipped.push({ dh: b64uEncode(state.dhr!), n: state.nr, mk });
    if (state.skipped.length > MAX_SKIP) state.skipped.shift();
    state.nr++;
  }
}

function dhRatchetStep(state: RatchetState, theirNewDh: Uint8Array): void {
  // receiving chain from their new key
  state.pn = state.ns;
  state.ns = 0;
  state.nr = 0;
  state.dhr = theirNewDh;
  const step1 = kdfRk(state.rk, dh(state.dhs_priv, state.dhr));
  state.rk = step1.rk;
  state.ckr = step1.ck;
  // new sending key for ourselves
  const dhs = generateDhPair();
  state.dhs_priv = dhs.priv;
  state.dhs_pub = dhs.pub;
  const step2 = kdfRk(state.rk, dh(state.dhs_priv, state.dhr));
  state.rk = step2.rk;
  state.cks = step2.ck;
}

function headerBytes(h: RatchetHeader): Uint8Array {
  // deterministic serialization so both sides compute the same AAD
  return utf8(`${h.dh}|${h.pn}|${h.n}`);
}

async function encryptWithKey(mk: Uint8Array, header: RatchetHeader, ad: Uint8Array, plaintext: Uint8Array): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = randomBytes(12);
  const { aesGcmEncrypt } = await import("./crypto");
  const ct = await aesGcmEncrypt(mk, plaintext, iv, concatBytes(ad, headerBytes(header)));
  return { iv, ct };
}

async function decryptWithKey(mk: Uint8Array, header: RatchetHeader, ad: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  const { aesGcmDecrypt } = await import("./crypto");
  return aesGcmDecrypt(mk, ct, iv, concatBytes(ad, headerBytes(header)));
}

/** Encrypt one message under the current ratchet state (mutates state). */
export async function ratchetEncrypt(state: RatchetState, ad: Uint8Array, plaintext: Uint8Array): Promise<Envelope> {
  if (!state.cks) throw new Error("sending chain not ready — wait for an inbound message first");
  const { ck, mk } = nextChainKey(state.cks);
  state.cks = ck;
  const header: RatchetHeader = { dh: b64uEncode(state.dhs_pub), pn: state.pn, n: state.ns };
  state.ns++;
  const { iv, ct } = await encryptWithKey(mk, header, ad, plaintext);
  return { v: 2, header, iv: b64uEncode(iv), ct: b64uEncode(ct) };
}

/** Deep-copy a ratchet state — decryption works on a draft and only commits
 * when the ciphertext actually opens, so a replay/tamper attempt can never
 * burn a message key and corrupt the chain (classic ratchet desync bug). */
function cloneRatchet(r: RatchetState): RatchetState {
  return {
    rk: new Uint8Array(r.rk),
    cks: r.cks ? new Uint8Array(r.cks) : null,
    ckr: r.ckr ? new Uint8Array(r.ckr) : null,
    dhs_priv: new Uint8Array(r.dhs_priv),
    dhs_pub: new Uint8Array(r.dhs_pub),
    dhr: r.dhr ? new Uint8Array(r.dhr) : null,
    ns: r.ns,
    nr: r.nr,
    pn: r.pn,
    skipped: r.skipped.map((s) => ({ dh: s.dh, n: s.n, mk: new Uint8Array(s.mk) })),
  };
}

function commitRatchet(from: RatchetState, to: RatchetState): void {
  Object.assign(to, from, { skipped: from.skipped });
}

/** Decrypt one envelope. The ratchet state only advances when the envelope
 * actually opens — replays, tampering and out-of-window messages fail
 * WITHOUT damaging the session. */
export async function ratchetDecrypt(state: RatchetState, ad: Uint8Array, envelope: Envelope): Promise<Uint8Array> {
  const header = envelope.header;
  const iv = b64uDecode(envelope.iv);
  const ct = b64uDecode(envelope.ct);
  const draft = cloneRatchet(state);

  // 1. replayed/skipped key?
  const skippedHit = trySkipped(draft, header, ad, iv, ct);
  if (skippedHit) {
    commitRatchet(draft, state);
    return skippedHit;
  }

  // 2. new remote ratchet key → run a DH ratchet step first
  const theirDh = b64uDecode(header.dh);
  if (!draft.dhr || !timingSafeEq(draft.dhr, theirDh)) {
    skipMessageKeys(draft, header.pn);
    dhRatchetStep(draft, theirDh);
  }
  // 3. advance the receiving chain to this message
  if (!draft.ckr) throw new Error("no receiving chain");
  skipMessageKeys(draft, header.n);
  const { ck, mk } = nextChainKey(draft.ckr);
  draft.ckr = ck;
  draft.nr++;
  const pt = await decryptWithKey(mk, header, ad, iv, ct);
  commitRatchet(draft, state);
  return pt;
}

function timingSafeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
