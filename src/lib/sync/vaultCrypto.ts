/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Zero-knowledge sync crypto for Relay.
 *
 * Key hierarchy — the server only ever stores wrapped keys and ciphertext:
 *
 *   Universal Key (UK)  256-bit random, born on the device. Persisted ONLY
 *                       wrapped with AES-GCM under a PBKDF2 key derived from
 *                       the user's sync passphrase (650k iterations, per-user
 *                       random salt). Never uploaded unwrapped, never derived
 *                       from anything the backend contributes.
 *   Space Key (SK)      one per sync space ("app_settings", "identity", ...),
 *                       wrapped by the UK for the owner.
 *   Record Key (RK)     fresh random key per sync write — the "temporary key"
 *                       that encrypts the record (AES-256-GCM, fresh 96-bit
 *                       IV), then is wrapped by the space key. Only someone
 *                       who entered the channel (UK -> SK) can open it.
 *   Share channel       sharing wraps an SK for another user through an
 *                       EPHEMERAL ECDH (P-256) + HKDF-SHA-256 channel: the
 *                       sender's side is throwaway, so the wrapped SK can
 *                       only be opened by the holder of the recipient's
 *                       vault private key.
 *
 * The backend contributes zero key material — anything the server could
 * derive, the server could read, so the derivation stays entirely on-device.
 */

const PBKDF2_ITERATIONS = 650_000;
const HKDF_INFO = "relay-sync-share-v1";

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto unavailable — encrypted sync needs a secure context (https).");
  }
  return crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// --- AES-GCM -------------------------------------------------------------

export async function generateAesKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", bufferSource(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function exportAesKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().exportKey("raw", key));
}

export type SealedBox = { iv: string; ct: string };

export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<SealedBox> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: bufferSource(iv) }, key, bufferSource(plaintext));
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, box: SealedBox): Promise<Uint8Array> {
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: bufferSource(fromBase64(box.iv)) },
    key,
    bufferSource(fromBase64(box.ct)),
  );
  return new Uint8Array(pt);
}

// --- Passphrase KDF (UK wrap) --------------------------------------------

export async function derivePassphraseWrapKey(
  passphrase: string,
  saltB64: string,
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    bufferSource(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(fromBase64(saltB64)),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- ECDH share channel (SK wrap between users) --------------------------

type EcdhJwk = JsonWebKey;

export async function generateVaultKeyPair(): Promise<{ pubJwk: EcdhJwk; privJwk: EcdhJwk }> {
  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const pubJwk = await subtle().exportKey("jwk", pair.publicKey);
  const privJwk = await subtle().exportKey("jwk", pair.privateKey);
  return { pubJwk, privJwk };
}

async function channelKey(privateJwk: EcdhJwk, peerPublicJwk: EcdhJwk): Promise<CryptoKey> {
  const priv = await subtle().importKey(
    "jwk",
    privateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const pub = await subtle().importKey(
    "jwk",
    peerPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const bits = await subtle().deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdf = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bufferSource(new TextEncoder().encode(HKDF_INFO)),
      info: bufferSource(new TextEncoder().encode(HKDF_INFO)),
    },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wrap `payloadRaw` for a recipient via an ephemeral ECDH channel. */
export async function wrapForRecipient(
  payloadRaw: Uint8Array,
  recipientPubJwk: EcdhJwk,
): Promise<{ ephemeralPubJwk: EcdhJwk; wrapIv: string; skWrap: string }> {
  const ephemeral = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const channel = await channelKey(
    await subtle().exportKey("jwk", ephemeral.privateKey),
    recipientPubJwk,
  );
  const iv = randomBytes(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    channel,
    bufferSource(payloadRaw),
  );
  return {
    ephemeralPubJwk: await subtle().exportKey("jwk", ephemeral.publicKey),
    wrapIv: toBase64(iv),
    skWrap: toBase64(new Uint8Array(ct)),
  };
}

/** Open a share: our vault private key + the sender's ephemeral public key. */
export async function unwrapFromShare(
  myPrivJwk: EcdhJwk,
  ephemeralPubJwk: EcdhJwk,
  wrapIv: string,
  skWrap: string,
): Promise<Uint8Array> {
  const channel = await channelKey(myPrivJwk, ephemeralPubJwk);
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: bufferSource(fromBase64(wrapIv)) },
    channel,
    bufferSource(fromBase64(skWrap)),
  );
  return new Uint8Array(pt);
}
