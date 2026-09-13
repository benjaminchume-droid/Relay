/**
 * Google sign-in via Supabase only (no Firebase).
 * Native: open the public Relay web /login in the system browser (Custom Tabs / Safari)
 * so Google uses the real browser cookie jar — avoids Google 400 in embedded WebViews.
 * Web: standard OAuth redirect to this origin /login.
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

/** Public HTTPS origin used for OAuth + email redirects (must be in Supabase Auth redirect allow-list). */
export function getPublicWebOrigin(): string {
  const fromEnv =
    metaEnv.VITE_RELAY_WEB_URL ||
    metaEnv.VITE_PUBLIC_WEB_URL ||
    metaEnv.NEXT_PUBLIC_SITE_URL ||
    '';
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    // Capacitor may report capacitor:// or https://localhost — prefer env for native.
    const origin = window.location.origin;
    if (!origin.includes('localhost') && origin.startsWith('https://')) return origin;
  }
  // Fallback: relay-web / main Relay Vercel project — update via VITE_RELAY_WEB_URL if different
  return 'https://relay-web.vercel.app';
}

export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return `${getPublicWebOrigin()}/login`;
  const Cap = (window as any).Capacitor;
  const isNative = !!Cap?.isNativePlatform?.();
  // Always prefer HTTPS web login for OAuth (Google rejects malformed / custom-scheme redirect URIs).
  return `${getPublicWebOrigin()}/login${isNative ? '?native=1' : ''}`;
}

export async function initializeGoogleAuth(): Promise<void> {
  // No native Firebase plugin — Supabase OAuth + system browser.
}

async function openSystemBrowser(url: string): Promise<void> {
  const Cap = typeof window !== 'undefined' ? (window as any).Capacitor : null;
  if (Cap?.isNativePlatform?.()) {
    try {
      // Prefer @capacitor/browser when installed
      const mod = await import(/* @vite-ignore */ '@capacitor/browser');
      await mod.Browser.open({ url, presentationStyle: 'popover' });
      return;
    } catch {
      /* fall through */
    }
    try {
      // Capacitor App openUrl if available
      if (Cap.Plugins?.App?.openUrl) {
        await Cap.Plugins.App.openUrl({ url });
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
}

/**
 * Google Sign-In through Supabase Auth.
 * Native opens the public web login (system browser / Custom Tabs) so Google cookies work.
 * Web uses same-origin OAuth redirect.
 */
export async function performNativeGoogleSignIn(): Promise<{
  success: boolean;
  error?: string;
  user?: any;
}> {
  try {
    const Cap = typeof window !== 'undefined' ? (window as any).Capacitor : null;
    const isNative = !!Cap?.isNativePlatform?.();

    // On native: send user to the hosted web login page in the *system* browser.
    // That page runs Google OAuth with a valid HTTPS redirect and posts the session back.
    if (isNative) {
      const webLogin = `${getPublicWebOrigin()}/login?native=1&provider=google`;
      await openSystemBrowser(webLogin);
      return { success: true };
    }

    const redirectTo = getAuthRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.url) {
      await openSystemBrowser(data.url);
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Google Sign-In failed. Please try again.',
    };
  }
}
