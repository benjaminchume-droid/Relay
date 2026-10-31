/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Encrypted media pipeline. Uploads are AES-256-GCM encrypted client-side;
 * the blob key travels INSIDE the ratchet-encrypted message payload, so the
 * storage bucket only ever holds opaque ciphertext.
 */
import { b64u } from "./signalProtocol";

const te = new TextEncoder();

export type EncryptedUpload = {
  path: string;
  url: string;          // signed URL of the encrypted blob
  mediaKey: string;     // b64u key to embed in the encrypted message payload
  size: number;
};

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptBytes(bytes: Uint8Array): Promise<{ ct: Uint8Array; iv: Uint8Array; key: Uint8Array }> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ckey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 }, ckey, bytes as BufferSource);
  return { ct: new Uint8Array(ct), iv, key };
}

export async function decryptBytes(
  keyB64u: string,
  data: ArrayBuffer
): Promise<Uint8Array> {
  // blob layout: iv (12) || ciphertext+tag
  const raw = new Uint8Array(data);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const key = await crypto.subtle.importKey("raw", b64u.dec(keyB64u) as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 }, key, ct as BufferSource);
  return new Uint8Array(pt);
}

const blobUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let active = 0;
const queue: Array<() => void> = [];

function pump() {
  while (active < 4 && queue.length) {
    const fn = queue.shift()!;
    active += 1;
    fn();
  }
}

function settle() {
  active -= 1;
  pump();
}

/** Fetch + decrypt an encrypted attachment into an object URL (cached, concurrency-capped).
 *  `preferredMime` (from the encrypted payload) wins over byte sniffing. */
export function getDecryptedMediaUrl(messageId: string, url: string, keyB64u: string, preferredMime?: string): Promise<string> {
  const cacheKey = `${messageId}`;
  const cached = blobUrls.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(cacheKey);
  if (running) return running;

  const task = new Promise<string>((resolve, reject) => {
    queue.push(() => {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`media fetch ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => decryptBytes(keyB64u, buf))
        .then((pt) => {
          const mime = (preferredMime && preferredMime !== "application/octet-stream" ? preferredMime : null)
            || sniffMime(pt)
            || "application/octet-stream";
          const objUrl = URL.createObjectURL(new Blob([pt as unknown as BlobPart], { type: mime }));
          blobUrls.set(cacheKey, objUrl);
          resolve(objUrl);
        })
        .catch(reject)
        .finally(settle);
    });
    pump();
  });
  inflight.set(cacheKey, task);
  task.finally(() => inflight.delete(cacheKey)).catch(() => {});
  return task;
}

function sniffMime(b: Uint8Array): string | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.length > 12 && b[8] === 0x66 && b[9] === 0x74 && b[10] === 0x79) return "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45) return "audio/webm"; // EBML (webm/matroska audio)
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // RIFF container: WAVE → wav, otherwise generic riff
    if (b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return "audio/wav";
    return "audio/webm";
  }
  if (b.length > 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  if (b.length > 4 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "audio/mpeg";
  if (b.length > 2 && b[0] === 0x25 && b[1] === 0x50) return "application/pdf";
  return null;
}

/** Plaintext payload shapes carried inside the Double Ratchet. */
export type MsgPayload =
  | { k: "t"; t: string }                                   // text
  | { k: "m"; u: string; key: string; mime: string; name: string; dur?: number; w?: string } // media
  | { k: "s"; t: string }                                   // system-ish
  | { k: "r" };                                             // session-reset control (never rendered)

export function encodePayload(p: MsgPayload): string {
  return JSON.stringify(p);
}

export function decodePayload(s: string): MsgPayload | null {
  try {
    const p = JSON.parse(s);
    if (p && typeof p.k === "string") return p as MsgPayload;
    return null;
  } catch {
    return null;
  }
}

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
export const teEncode = te;
