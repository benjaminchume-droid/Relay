/**
 * Relay Messaging SDK — crypto primitives.
 *
 * X25519 + Ed25519 key agreement/signing via @noble/curves (pure JS, no
 * native deps), SHA-256/HKDF via @noble/hashes, and AES-256-GCM via the
 * platform WebCrypto engine. Works in browsers, Node 18+, Deno and Bun.
 */
import { x25519, ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { hkdf } from "@noble/hashes/hkdf";

/* ------------------------------ encodings -------------------------------- */

export function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(text: string): Uint8Array {
  const pad = (4 - (text.length % 4)) % 4;
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function sha256Bytes(...parts: Uint8Array[]): Uint8Array {
  return sha256(parts.length === 1 ? parts[0] : concatBytes(...parts));
}

/* --------------------------------- keys ---------------------------------- */

export type DhKeyPair = { priv: Uint8Array; pub: Uint8Array };
export type SignKeyPair = { priv: Uint8Array; pub: Uint8Array };

export function generateDhPair(): DhKeyPair {
  const priv = x25519.utils.randomPrivateKey();
  return { priv, pub: x25519.getPublicKey(priv) };
}

/** Derive the X25519 public point from a private scalar. */
export function dhPubFromPriv(priv: Uint8Array): Uint8Array {
  return x25519.getPublicKey(priv);
}

/** Diffie-Hellman over Curve25519. Returns the 32-byte shared secret. */
export function dh(priv: Uint8Array, peerPub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, peerPub);
}

export function generateSignPair(): SignKeyPair {
  const priv = ed25519.utils.randomPrivateKey();
  return { priv, pub: ed25519.getPublicKey(priv) };
}

export function sign(msg: Uint8Array, signPriv: Uint8Array): Uint8Array {
  return ed25519.sign(msg, signPriv);
}

export function verify(msg: Uint8Array, sig: Uint8Array, signPub: Uint8Array): boolean {
  try {
    return ed25519.verify(sig, msg, signPub);
  } catch {
    return false;
  }
}

/* --------------------------------- HKDF ---------------------------------- */

const HKDF_INFO_PREFIX = utf8("relay-sdk-v1");

/**
 * RFC 5869 HKDF-SHA256. The Signal spec prepends 32 bytes of 0xFF to the IKM
 * for X3DH ("F"); pass those bytes in as part of ikm when needed.
 */
export function hkdfBytes(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  return hkdf(sha256, ikm, salt, concatBytes(HKDF_INFO_PREFIX, info), length);
}

/* ------------------------------ AES-256-GCM ------------------------------ */

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as unknown as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** AES-256-GCM. Output = ciphertext || 16-byte tag (WebCrypto appends the tag). */
export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const key = await aesKey(keyBytes);
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
    key,
    plaintext as unknown as BufferSource,
  );
  return new Uint8Array(buf);
}

export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const key = await aesKey(keyBytes);
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
    key,
    ciphertext as unknown as BufferSource,
  );
  return new Uint8Array(buf);
}

/* -------------------------------- helpers -------------------------------- */

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Short human fingerprint of a public key: pairs of hex, e.g. "3A F1 …". */
export function fingerprint(pub: Uint8Array): string {
  const h = sha256Bytes(pub);
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
