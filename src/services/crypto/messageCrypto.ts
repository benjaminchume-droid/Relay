/**
 * Optional per-conversation AES-GCM content encryption foundation.
 * Not full Signal Protocol — keys must be exchanged securely separately.
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toB64(raw);
}

export async function importKey(b64: string): Promise<CryptoKey> {
  const raw = fromB64(b64);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(plaintext));
  return `e2ee:v1:${toB64(iv.buffer)}:${toB64(ct)}`;
}

export async function decryptText(key: CryptoKey, payload: string): Promise<string> {
  if (!payload.startsWith("e2ee:v1:")) return payload;
  const parts = payload.split(":");
  if (parts.length < 4) return payload;
  const iv = fromB64(parts[2]);
  const ct = fromB64(parts[3]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return textDecoder.decode(pt);
}

export function isEncryptedPayload(content?: string | null): boolean {
  return !!content && content.startsWith("e2ee:v1:");
}
