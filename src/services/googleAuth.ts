/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from '../lib/supabase/client';

/**
 * GOOGLE OAUTH CLIENT ID CONFIGURATION & INSTRUCTIONS:
 * 
 * 1. WEB CLIENT ID (WEB_CLIENT_ID / VITE_GOOGLE_WEB_CLIENT_ID):
 *    - Created in Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> "Web application".
 *    - Example format: "1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com"
 *    - MUST be supplied as the 'clientId' / 'serverClientId' when initializing GoogleAuth or Google Identity Services SDK.
 *    - Supabase Auth uses this Web Client ID to verify the signed JWT ID token.
 * 
 * 2. ANDROID CLIENT ID:
 *    - Created in Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> "Android".
 *    - Package Name: com.glassline.relay
 *    - SHA-1 Fingerprint: 70:67:FD:A4:65:32:79:FA:00:79:03:56:0E:27:06:2D:72:48:75:36
 *    - Note: You do NOT pass the Android Client ID directly into the JavaScript initializer. Google Play Services
 *      on the Android device automatically matches the running APK's package name and SHA-1 fingerprint against 
 *      your Google Cloud Console Android Client credentials.
 */

const metaEnv = (import.meta as any).env || {};
export const GOOGLE_WEB_CLIENT_ID = 
  metaEnv.VITE_GOOGLE_WEB_CLIENT_ID || 
  metaEnv.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || 
  (typeof process !== 'undefined' ? process.env.WEB_CLIENT_ID || process.env.VITE_GOOGLE_WEB_CLIENT_ID : '') ||
  '1051531258551-relay-web-client.apps.googleusercontent.com'; // Fallback Web Client ID placeholder

let isGoogleAuthInitialized = false;

export async function initializeGoogleAuth(): Promise<void> {
  if (isGoogleAuthInitialized) return;

  try {
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      console.log('[Relay GoogleAuth] Initializing native GoogleAuth with Web Client ID:', GOOGLE_WEB_CLIENT_ID);
      await GoogleAuth.initialize({
        clientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
      isGoogleAuthInitialized = true;
    }
  } catch (err) {
    console.warn('[Relay GoogleAuth] Initializing native plugin warning:', err);
  }
}

/**
 * Performs Native Google Sign-In and exchanges the Google ID Token with Supabase using signInWithIdToken
 */
export async function performNativeGoogleSignIn(): Promise<{ success: boolean; error?: string; user?: any }> {
  try {
    await initializeGoogleAuth();

    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    let idToken: string | null = null;

    if (isNative) {
      console.log('[Relay GoogleAuth] Triggering native GoogleAuth.signIn()...');
      const googleUser = await GoogleAuth.signIn();
      console.log('[Relay GoogleAuth] Native sign-in response received:', googleUser ? 'Success' : 'Empty');

      idToken = googleUser.authentication?.idToken || (googleUser as any).idToken || null;
      if (!idToken) {
        throw new Error('Google Sign-In failed: No ID Token returned from Google Auth SDK.');
      }
    } else {
      // Web / Browser environment fallback using Google GIS JS or prompt
      idToken = await requestWebGoogleIdToken();
    }

    if (!idToken) {
      throw new Error('Could not obtain Google ID Token. Please check your Google Web Client ID setup.');
    }

    console.log('[Relay GoogleAuth] Authenticating with Supabase via signInWithIdToken...');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      console.error('[Relay GoogleAuth] Supabase signInWithIdToken Error:', {
        message: error.message,
        status: error.status || (error as any).code,
        details: error,
      });
      return { success: false, error: error.message || 'Supabase authentication failed with Google ID token.' };
    }

    console.log('[Relay GoogleAuth] Supabase Native Google Sign-In successful:', data.user?.email);
    return { success: true, user: data.user };

  } catch (err: any) {
    console.error('[Relay GoogleAuth] Google Sign-In Error:', {
      message: err.message || String(err),
      status: err.status || err.code || 403,
      details: err,
    });
    return { success: false, error: err.message || 'Google Sign-In failed. Please try again.' };
  }
}

/**
 * Helper to request ID token in web/preview browser mode
 */
async function requestWebGoogleIdToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Window context unavailable for web Google Auth'));
    }

    const win = window as any;

    // Check if google GIS script loaded
    if (win.google?.accounts?.id) {
      win.google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: (response: any) => {
          if (response.credential) {
            resolve(response.credential);
          } else {
            reject(new Error('No credential returned from Google Identity Services'));
          }
        },
      });
      win.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback prompt
          const promptMsg = prompt('Enter Google ID Token for preview or press OK to continue:');
          if (promptMsg) resolve(promptMsg);
          else reject(new Error('Google One-Tap dismissed.'));
        }
      });
    } else {
      // Prompt for testing if GIS script is unavailable in local web preview
      const simulatedToken = prompt('Google GIS SDK not loaded in preview. Enter Google ID Token (or test token):');
      if (simulatedToken) {
        resolve(simulatedToken);
      } else {
        reject(new Error('Google Sign-In is unavailable in preview mode. Please test on native Android build.'));
      }
    }
  });
}
