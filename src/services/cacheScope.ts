/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Account-scoped local caches. Messages, read watermarks and chat caches are
 * keyed only by origin — on a SHARED DEVICE, logging out and into another
 * account would surface the previous account's cached conversations (real
 * privacy bug, caught in live QA). Switching accounts wipes the previous scope.
 *
 * The plaintext memos (relay_pt_memo_v1 / relay_own_plaintext_v1 /
 * relay_own_media_v1) are stored PER ACCOUNT inside a single root object, so
 * the SAME account can re-login without losing the plaintext of its own
 * history — wholesale wipes used to turn every own bubble into "can't be
 * displayed" and made own voice notes unplayable after re-login. On a scope
 * switch the root is pruned down to the new account only.
 */
const SCOPE_KEY = "relay_cache_scope_v1";

const SCOPED_KEYS = [
  "relay_chats_cache_v1",
  "relay_messages_cache_v1",
  "relay_read_watermarks_v1",
];

// per-account memo roots (values look like { [profileId]: {...} })
const MEMO_ROOTS = [
  "relay_pt_memo_v1",
  "relay_own_plaintext_v1",
  "relay_own_media_v1",
];

function pruneMemoRoots(profileId: string): void {
  for (const k of MEMO_ROOTS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") { localStorage.removeItem(k); continue; }
      if (profileId in obj) {
        localStorage.setItem(k, JSON.stringify({ [profileId]: obj[profileId] }));
      } else {
        localStorage.removeItem(k);
      }
    } catch {
      try { localStorage.removeItem(k); } catch { /* optional */ }
    }
  }
}

/**
 * Aligns the local cache scope with the signed-in profile.
 * Returns cleared=true (and wipes) when the scope changed.
 */
export function ensureCacheScope(profileId: string): { cleared: boolean } {
  if (!profileId) return { cleared: false };
  try {
    (window as any).__relayActiveProfileId = profileId;
    const current = localStorage.getItem(SCOPE_KEY);
    if (current === profileId) return { cleared: false };
    for (const k of SCOPED_KEYS) localStorage.removeItem(k);
    pruneMemoRoots(profileId);
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
    const current = localStorage.getItem(SCOPE_KEY);
    for (const k of SCOPED_KEYS) localStorage.removeItem(k);
    // drop ONLY the signing-out account's memo entries — other accounts that
    // may still be stored keep their data (pruned again on their next login)
    if (current) {
      for (const k of MEMO_ROOTS) {
        try {
          const obj = JSON.parse(localStorage.getItem(k) || "{}");
          if (obj && typeof obj === "object" && current in obj) {
            delete obj[current];
            if (Object.keys(obj).length) localStorage.setItem(k, JSON.stringify(obj));
            else localStorage.removeItem(k);
          }
        } catch { /* optional */ }
      }
    }
    localStorage.removeItem(SCOPE_KEY);
    (window as any).__relayActiveProfileId = "";
  } catch { /* storage optional */ }
}
