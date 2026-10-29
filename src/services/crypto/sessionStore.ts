/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Device-local crypto storage (IndexedDB). Private material never leaves here.
 * Stores: identity key bundle, one ratchet session per conversation+peer.
 * v2 sessions are keyed `${profileId}:${conversationId}:${peerId}`; the legacy
 * `${profileId}:${conversationId}` key is kept readable for DM continuity.
 */
import type { LocalIdentity, RatchetState } from "./signalProtocol";

const DB_NAME = "relay-e2ee";
const DB_VERSION = 1;
const STORE_IDENTITY = "identity";
const STORE_SESSIONS = "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IDENTITY)) db.createObjectStore(STORE_IDENTITY);
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function sessionKey(profileId: string, conversationId: string, peerId?: string): string {
  return peerId ? `${profileId}:${conversationId}:${peerId}` : `${profileId}:${conversationId}`;
}

export const cryptoStore = {
  getIdentity: (profileId: string): Promise<LocalIdentity | undefined> =>
    tx<LocalIdentity | undefined>(STORE_IDENTITY, "readonly", (s) => s.get(profileId) as IDBRequest<LocalIdentity | undefined>),
  setIdentity: (profileId: string, identity: LocalIdentity): Promise<IDBValidKey> =>
    tx(STORE_IDENTITY, "readwrite", (s) => s.put(identity, profileId)),

  /** v2 session — one per conversation+peer (fan-out capable). */
  getSession: (profileId: string, conversationId: string, peerId: string): Promise<RatchetState | undefined> =>
    tx<RatchetState | undefined>(STORE_SESSIONS, "readonly", (s) =>
      s.get(sessionKey(profileId, conversationId, peerId)) as IDBRequest<RatchetState | undefined>),
  setSession: (profileId: string, conversationId: string, peerId: string, state: RatchetState): Promise<IDBValidKey> =>
    tx(STORE_SESSIONS, "readwrite", (s) => s.put(state, sessionKey(profileId, conversationId, peerId))),
  deleteSession: (profileId: string, conversationId: string, peerId?: string): Promise<undefined> =>
    tx(STORE_SESSIONS, "readwrite", (s) =>
      s.delete(sessionKey(profileId, conversationId, peerId)) as unknown as IDBRequest<undefined>),

  /** Pre-upgrade session stored under the bare conversation key. */
  getLegacySession: (profileId: string, conversationId: string): Promise<RatchetState | undefined> =>
    tx<RatchetState | undefined>(STORE_SESSIONS, "readonly", (s) =>
      s.get(sessionKey(profileId, conversationId)) as IDBRequest<RatchetState | undefined>),
};
