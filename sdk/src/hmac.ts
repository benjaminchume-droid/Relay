/**
 * Relay Messaging SDK — HMAC-SHA256 helper.
 * Used by the Double Ratchet's symmetric chain (KDF_CK in the Signal spec).
 */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return hmac(sha256, key, msg);
}
