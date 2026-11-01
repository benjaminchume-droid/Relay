/**
 * Relay Messaging SDK — crypto module.
 *
 * Envelope encryption with zero dependencies: ECDH (P-256) key agreement,
 * HKDF-SHA256 key derivation and AES-256-GCM sealing, all through WebCrypto.
 *
 * Per message the sender generates a fresh ephemeral key pair, derives the
 * shared secret against the recipient's static identity key and seals the
 * body. The envelope carries only the ephemeral public key, an IV and
 * ciphertext. Relay never sees plaintext, keys or recipients in the clear.
 */

export type Envelope = {
  v: 1;
  /** sender's ephemeral public key (JWK) */
  epk: JsonWebKey;
  /** AES-GCM IV, base64url */
  iv: string;
  /** ciphertext, base64url */
  ct: string;
};

export type IdentityKeys = {
  /** static identity key pair (JWK, private included) — never leaves the device */
  identity: JsonWebKey;
  createdAt: string;
};

export type PublicBundle = {
  /** identity public key (JWK, public only) — what peers encrypt to */
  identity: JsonWebKey;
};

const subtle = () => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto unavailable — the SDK needs a secure context (https or localhost).');
  }
  return crypto.subtle;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/* --------------------------------- keys ----------------------------------- */

/** Generate the device identity key pair. The private half stays client-side. */
export async function generateIdentityKeys(): Promise<IdentityKeys> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
  const identity = await subtle().exportKey('jwk', pair.privateKey);
  return { identity, createdAt: new Date().toISOString() };
}

/** Strip the private material out of an identity JWK. */
export function publicBundle(keys: IdentityKeys): PublicBundle {
  const { d: _d, key_ops: _k, ...pub } = keys.identity;
  return { identity: pub };
}

function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
}

function importPublic(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

/** ECDH → HKDF-SHA256 → AES-256-GCM key for a specific context. */
async function messageKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  context: string,
): Promise<CryptoKey> {
  // step 1: ECDH shared secret into an HKDF base key (HKDF keys may only derive)
  const hkdfBase = await subtle().deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(context),
      info: enc.encode('relay-sdk-v1'),
    },
    false,
    ['deriveKey'],
  );
  // step 2: HKDF → the actual AES-GCM message key
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(context), info: enc.encode('relay-sdk-v1') },
    hkdfBase,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/* ------------------------------- envelopes -------------------------------- */

/**
 * Seal `plaintext` for a peer bundle. Fresh ephemeral key pair per message —
 * one message compromised never unlocks another.
 */
export async function seal(
  keys: IdentityKeys,
  peer: PublicBundle,
  plaintext: string,
  context: string,
): Promise<Envelope> {
  const ephemeral = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
  const peerPub = await importPublic(peer.identity);
  const msgKey = await messageKey(ephemeral.privateKey, peerPub, context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, msgKey, enc.encode(plaintext));
  return {
    v: 1,
    epk: await subtle().exportKey('jwk', ephemeral.publicKey),
    iv: b64url(iv),
    ct: b64url(ct),
  };
}

/** Open an envelope with the recipient identity keys. */
export async function open(
  keys: IdentityKeys,
  envelope: Envelope,
  context: string,
): Promise<string> {
  const myPriv = await importPrivate(keys.identity);
  const senderEph = await importPublic(envelope.epk);
  const msgKey = await messageKey(myPriv, senderEph, context);
  const pt = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromB64url(envelope.iv) },
    msgKey,
    fromB64url(envelope.ct),
  );
  return dec.decode(pt);
}
