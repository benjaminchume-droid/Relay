/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google sign-in via Supabase only (no Firebase).
 * Native: supabase.auth.signInWithOAuth → system browser / Custom Tabs.
 * Web: GIS ID token exchange when available, else OAuth redirect.
 */

import { supabase } from '../lib/supabase/client';

const metaEnv = (import.meta as any).env || {};
export const GOOGLE_WEB_CLIENT_ID =
  metaEnv.VITE_GOOGLE_WEB_CLIENT_ID ||
  metaEnv.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  (typeof process !== 'undefined'
    ? process.env.WEB_CLIENT_ID || process.env.VITE_GOOGLE_WEB_CLIENT_ID
    : '') ||
  '';

export async function initializeGoogleAuth(): Promise<void> {
  // No native Firebase plugin — Supabase OAuth handles both web and Capacitor.
}

/**
 * Google Sign-In through Supabase Auth (OAuth or ID token).
 */
export async function performNativeGoogleSignIn(): Promise<{
  success: boolean;
  error?: string;
  user?: any;
}> {
  try {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/login`
        : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: false,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // OAuth redirects away; if URL returned, open it (Capacitor Browser optional).
    if (data?.url && typeof window !== 'undefined') {
      window.location.assign(data.url);
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Google Sign-In failed. Please try again.',
    };
  }
}
