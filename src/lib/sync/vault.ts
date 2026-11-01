/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Encrypted cloud sync vault — high-level API for Relay.
 *
 * The user's design, made concrete: one persistent universal key per user
 * (device-born, passphrase-wrapped), per-space channel keys, and a fresh
 * temporary key for every record that can only be opened through the
 * channel it was written through. The server stores wrappers + ciphertext
 * only and can decrypt nothing.
 *
 * Tables (supabase/migrations/20261101120000_sync_vault.sql):
 *   sync_vaults       – UK wrapped by the passphrase KDF (+ salt)
 *   vault_pubkeys     – ECDH public key used to address shares to this user
 *   vault_private_keys– vault private key, wrapped by the UK
 *   sync_space_keys   – per-space key wrapped by the UK
 *   sync_blobs        – per-record ciphertext + record key wrapped by the SK
 *   sync_space_shares – SK re-wrapped through an ephemeral ECDH channel
 */

import { supabase } from "../supabase/client";
import {
  derivePassphraseWrapKey,
  fromBase64,
  generateAesKey,
  generateVaultKeyPair,
  importAesKey,
  open,
  exportAesKey,
  randomBytes,
  seal,
  toBase64,
  unwrapFromShare,
  wrapForRecipient,
  type SealedBox,
} from "./vaultCrypto";

export type VaultStatus = "missing" | "locked" | "unlocked";

export type VaultMeta = {
  status: VaultStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

type VaultRow = {
  user_id: string;
  kdf_salt: string;
  uk_wrap: string;
  wrap_iv: string;
  created_at: string;
  updated_at: string;
};

type SpaceKeyRow = { space: string; sk_wrap: string; wrap_iv: string };

type BlobRow = {
  record_id: string;
  iv: string;
  ct: string;
  rk_wrap: string;
  rk_wrap_iv: string | null;
  updated_at: string;
};

// Unlocked UK lives in module memory only — never persisted raw.
let unlockedUk: Uint8Array | null = null;
const spaceKeyCache = new Map<string, CryptoKey>();

function requireUk(): Uint8Array {
  if (!unlockedUk) throw new Error("Sync vault is locked — unlock it first.");
  return unlockedUk;
}

async function myUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to use encrypted sync.");
  return data.user.id;
}

async function fetchVaultRow(): Promise<VaultRow | null> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("sync_vaults")
    .select("user_id,kdf_salt,uk_wrap,wrap_iv,created_at,updated_at")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as VaultRow | null) ?? null;
}

async function fetchPrivateKeyJwk(): Promise<JsonWebKey | null> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("vault_private_keys")
    .select("priv_wrap,priv_wrap_iv")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { priv_wrap: string; priv_wrap_iv: string };
  const raw = await open(await importAesKey(requireUk()), {
    iv: row.priv_wrap_iv,
    ct: row.priv_wrap,
  });
  return JSON.parse(new TextDecoder().decode(raw)) as JsonWebKey;
}

export async function getVaultMeta(): Promise<VaultMeta> {
  const row = await fetchVaultRow();
  if (!row) return { status: "missing", createdAt: null, updatedAt: null };
  return {
    status: unlockedUk ? "unlocked" : "locked",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** True when the sync tables are not deployed on the backend yet. */
export function isMissingTableError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? "");
  return /does not exist|schema cache|42P01|PGRST205|Could not find the table/i.test(text);
}

/** Create the vault: UK born here, wrapped by the passphrase, pubkey published. */
export async function setupVault(passphrase: string): Promise<void> {
  if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
  const existing = await fetchVaultRow();
  if (existing) throw new Error("A sync vault already exists on this account.");
  const uid = await myUserId();

  const uk = await generateAesKey();
  const ukRaw = await exportAesKey(uk);

  const kdfSalt = toBase64(randomBytes(16));
  const wrapKey = await derivePassphraseWrapKey(passphrase, kdfSalt);
  const ukBox: SealedBox = await seal(wrapKey, ukRaw);

  const { error: vaultErr } = await supabase.from("sync_vaults").insert({
    user_id: uid,
    kdf_salt: kdfSalt,
    uk_wrap: ukBox.ct,
    wrap_iv: ukBox.iv,
  });
  if (vaultErr) throw vaultErr;

  // Vault keypair: the public half is uploaded (that is how shares are
  // addressed to this user), the private half is wrapped by the UK — the raw
  // private key never leaves the device.
  const pair = await generateVaultKeyPair();
  const privBox = await seal(uk, new TextEncoder().encode(JSON.stringify(pair.privJwk)));
  const { error: pubErr } = await supabase.from("vault_pubkeys").upsert({
    user_id: uid,
    pub_jwk: pair.pubJwk,
  });
  if (pubErr) throw pubErr;
  const { error: privErr } = await supabase.from("vault_private_keys").upsert({
    user_id: uid,
    priv_wrap: privBox.ct,
    priv_wrap_iv: privBox.iv,
  });
  if (privErr) throw privErr;

  unlockedUk = ukRaw;
  spaceKeyCache.clear();
  await ensureSpaceKey("app_settings");
}

/** Unlock with the passphrase (derives the KDF key locally, unwraps the UK). */
export async function unlockVault(passphrase: string): Promise<void> {
  const row = await fetchVaultRow();
  if (!row) throw new Error("No sync vault on this account yet.");
  const wrapKey = await derivePassphraseWrapKey(passphrase, row.kdf_salt);
  const ukRaw = await open(wrapKey, { iv: row.wrap_iv, ct: row.uk_wrap });
  // Wrong passphrases fail GCM auth — surfaced as a friendly message by the UI.
  unlockedUk = ukRaw;
  spaceKeyCache.clear();
}

export function lockVault(): void {
  unlockedUk?.fill(0);
  unlockedUk = null;
  spaceKeyCache.clear();
}

export async function changePassphrase(oldPass: string, newPass: string): Promise<void> {
  if (newPass.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
  const row = await fetchVaultRow();
  if (!row) throw new Error("No sync vault on this account yet.");
  const oldWrap = await derivePassphraseWrapKey(oldPass, row.kdf_salt);
  const ukRaw = await open(oldWrap, { iv: row.wrap_iv, ct: row.uk_wrap });
  const newSalt = toBase64(randomBytes(16));
  const newWrap = await derivePassphraseWrapKey(newPass, newSalt);
  const box = await seal(newWrap, ukRaw);
  const { error } = await supabase
    .from("sync_vaults")
    .update({ kdf_salt: newSalt, uk_wrap: box.ct, wrap_iv: box.iv, updated_at: new Date().toISOString() })
    .eq("user_id", row.user_id);
  if (error) throw error;
  unlockedUk = ukRaw;
}

export function vaultUnlocked(): boolean {
  return unlockedUk !== null;
}

// --- Space keys ------------------------------------------------------------

async function ensureSpaceKey(space: string): Promise<CryptoKey> {
  const cached = spaceKeyCache.get(space);
  if (cached) return cached;
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("sync_space_keys")
    .select("space,sk_wrap,wrap_iv")
    .eq("user_id", uid)
    .eq("space", space)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const row = data as SpaceKeyRow;
    const skRaw = await open(await importAesKey(requireUk()), { iv: row.wrap_iv, ct: row.sk_wrap });
    const sk = await importAesKey(skRaw);
    spaceKeyCache.set(space, sk);
    return sk;
  }

  const sk = await generateAesKey();
  const skRaw = await exportAesKey(sk);
  const box = await seal(await importAesKey(requireUk()), skRaw);
  const { error: insErr } = await supabase.from("sync_space_keys").upsert({
    user_id: uid,
    space,
    sk_wrap: box.ct,
    wrap_iv: box.iv,
  });
  if (insErr) throw insErr;
  spaceKeyCache.set(space, sk);
  return sk;
}

// --- Record read/write -----------------------------------------------------

/** Encrypt + upsert one record. Fresh record key + IV on every write. */
export async function vaultPut(space: string, recordId: string, payload: unknown): Promise<void> {
  const sk = await ensureSpaceKey(space);
  const rk = await generateAesKey();
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const recordBox = await seal(rk, plaintext);
  const rkRaw = await exportAesKey(rk);
  const rkBox = await seal(sk, rkRaw);
  const uid = await myUserId();
  const { error } = await supabase.from("sync_blobs").upsert({
    user_id: uid,
    space,
    record_id: recordId,
    iv: recordBox.iv,
    ct: recordBox.ct,
    rk_wrap: rkBox.ct,
    rk_wrap_iv: rkBox.iv,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Fetch + decrypt one record (null when absent). */
export async function vaultGet<T>(space: string, recordId: string): Promise<T | null> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("sync_blobs")
    .select("record_id,iv,ct,rk_wrap,rk_wrap_iv,updated_at")
    .eq("user_id", uid)
    .eq("space", space)
    .eq("record_id", recordId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as BlobRow;
  const sk = await ensureSpaceKey(space);
  const rkRaw = await open(sk, { iv: row.rk_wrap_iv ?? row.iv, ct: row.rk_wrap });
  const plaintext = await open(await importAesKey(rkRaw), { iv: row.iv, ct: row.ct });
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** List this user's own spaces with last-write time (ids stay opaque). */
export async function listMyRecords(space: string): Promise<string[]> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("sync_blobs")
    .select("record_id")
    .eq("user_id", uid)
    .eq("space", space);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { record_id: string }).record_id);
}

export type SyncShare = {
  owner_id: string;
  space: string;
  created_at: string;
};

/** Wrap this space's key for another user through an ephemeral ECDH channel. */
export async function shareSpace(space: string, recipientId: string): Promise<void> {
  const uid = await myUserId();
  if (uid === recipientId) throw new Error("That is already your space.");
  const { data: pubRow, error: pubErr } = await supabase
    .from("vault_pubkeys")
    .select("pub_jwk")
    .eq("user_id", recipientId)
    .maybeSingle();
  if (pubErr) throw pubErr;
  if (!pubRow) throw new Error("That account has not enabled encrypted sync yet.");
  const sk = await ensureSpaceKey(space);
  const skRaw = await exportAesKey(sk);
  const wrapped = await wrapForRecipient(skRaw, (pubRow as { pub_jwk: JsonWebKey }).pub_jwk);
  const { error } = await supabase.from("sync_space_shares").upsert({
    space_owner: uid,
    space,
    recipient_id: recipientId,
    ephemeral_pub_jwk: wrapped.ephemeralPubJwk,
    sk_wrap: wrapped.skWrap,
    wrap_iv: wrapped.wrapIv,
  });
  if (error) throw error;
}

/** Spaces shared WITH me — openable only via my vault private key. */
export async function listSharedWithMe(): Promise<SyncShare[]> {
  const uid = await myUserId();
  const { data, error } = await supabase
    .from("sync_space_shares")
    .select("space_owner,space,created_at")
    .eq("recipient_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    owner_id: (r as { space_owner: string }).space_owner,
    space: (r as { space: string }).space,
    created_at: (r as { created_at: string }).created_at,
  }));
}

/** Open a space shared with me (needs the vault unlocked). */
export async function openShared<T>(ownerId: string, space: string, recordId: string): Promise<T | null> {
  const uid = await myUserId();
  const { data: shareRow, error: shareErr } = await supabase
    .from("sync_space_shares")
    .select("ephemeral_pub_jwk,sk_wrap,wrap_iv")
    .eq("space_owner", ownerId)
    .eq("space", space)
    .eq("recipient_id", uid)
    .maybeSingle();
  if (shareErr) throw shareErr;
  if (!shareRow) throw new Error("No share of that space addressed to you.");
  const share = shareRow as { ephemeral_pub_jwk: JsonWebKey; sk_wrap: string; wrap_iv: string };
  const privJwk = await fetchPrivateKeyJwk();
  if (!privJwk) throw new Error("This account has no vault keypair yet.");
  const skRaw = await unwrapFromShare(privJwk, share.ephemeral_pub_jwk, share.wrap_iv, share.sk_wrap);
  const sk = await importAesKey(skRaw);

  const { data: blob, error: blobErr } = await supabase
    .from("sync_blobs")
    .select("iv,ct,rk_wrap,rk_wrap_iv")
    .eq("user_id", ownerId)
    .eq("space", space)
    .eq("record_id", recordId)
    .maybeSingle();
  if (blobErr) throw blobErr;
  if (!blob) return null;
  const row = blob as BlobRow;
  const rkRaw = await open(sk, { iv: row.rk_wrap_iv ?? row.iv, ct: row.rk_wrap });
  const plaintext = await open(await importAesKey(rkRaw), { iv: row.iv, ct: row.ct });
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export { fromBase64, toBase64, unwrapFromShare };
