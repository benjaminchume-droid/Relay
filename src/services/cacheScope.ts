/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Account-scoped local caches. Messages, read watermarks and the plaintext
 * memos are keyed only by origin — on a SHARED DEVICE, logging out and into
 * another account would surface the previous account's cached conversations
 * (real privacy bug, caught in live QA). Everything gets namespaced by the
 * signed-in profile id; switching accounts wipes the previous scope.
 */
const SCOPE_KEY = "relay_cache_scope_v1";

const SCOPED_KEYS = [
  "relay_chats_cache_v1",
  "relay_messages_cache_v1",
  "relay_read_watermarks_v1",
  "relay_pt_memo_v1",
  "relay_own_plaintext_v1",
  "relay_own_media_v1",
];

/**
 * Aligns the local cache scope with the signed-in profile.
 * Returns cleared=true (and wipes) when the scope changed.
 */
export function ensureCacheScope(profileId: string): { cleared: boolean } {
  if (!profileId) return { cleared: false };
  try {
    const current = localStorage.getItem(SCOPE_KEY);
    if (current === profileId) return { cleared: false };
    for (const k of SCOPED_KEYS) localStorage.removeItem(k);
    localStorage.setItem(SCOPE_KEY, profileId);
    console.info("[cacheScope] account switched — local message caches wiped");
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

/** Call on explicit logout so the next sign-in starts clean. */
export function clearCacheScope(): void {
  try {
    for (const k of SCOPED_KEYS) localStorage.removeItem(k);
    localStorage.removeItem(SCOPE_KEY);
  } catch { /* storage optional */ }
}
