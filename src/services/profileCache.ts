/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile } from '../types';
import { supabase } from '../lib/supabase/client';
import { formatProfileRecord } from '../store/authStore';

const CACHE_KEY = 'relay_profile_cache_v1';
const memoryCache = new Map<string, UserProfile>();

// Helper to load cache from localStorage on startup
function loadProfileCache(): Map<string, UserProfile> {
  if (memoryCache.size > 0) return memoryCache;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed: Record<string, UserProfile> = JSON.parse(stored);
        Object.entries(parsed).forEach(([id, prof]) => {
          if (id && prof) memoryCache.set(id, prof);
        });
      }
    }
  } catch (e) {
    console.warn('[profileCache] Error loading profile cache:', e);
  }
  return memoryCache;
}

function persistProfileCache() {
  try {
    if (typeof localStorage !== 'undefined') {
      const obj: Record<string, UserProfile> = {};
      memoryCache.forEach((prof, id) => {
        obj[id] = prof;
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    }
  } catch (e) {
    console.warn('[profileCache] Error persisting profile cache:', e);
  }
}

export const profileCache = {
  get(profileId: string): UserProfile | null {
    if (!profileId) return null;
    loadProfileCache();
    return memoryCache.get(profileId) || null;
  },

  set(profile: UserProfile) {
    if (!profile || !profile.id) return;
    memoryCache.set(profile.id, profile);
    persistProfileCache();
  },

  setMany(profiles: UserProfile[]) {
    if (!Array.isArray(profiles)) return;
    profiles.forEach((p) => {
      if (p && p.id) memoryCache.set(p.id, p);
    });
    persistProfileCache();
  },

  async fetchAndCache(profileId: string): Promise<UserProfile | null> {
    if (!profileId) return null;

    // 1. Return from memory/local cache immediately if available
    const cached = this.get(profileId);

    // 2. Query fresh profile from database
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`id.eq.${profileId},auth_user_id.eq.${profileId}`)
        .maybeSingle();

      if (!error && data) {
        const formatted = formatProfileRecord(data);
        this.set(formatted);
        return formatted;
      }
    } catch (e) {
      console.warn(`[profileCache] Failed DB fetch for ${profileId}:`, e);
    }

    return cached;
  },

  invalidate(profileId: string) {
    if (!profileId) return;
    memoryCache.delete(profileId);
    persistProfileCache();
  },

  clear() {
    memoryCache.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (_) {}
  }
};
