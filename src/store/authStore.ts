/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth store — session bootstrap, signup/login/OTP/onboarding, password reset.
 * Single source of truth for the whole identity surface (AuthFlow, EmailVerificationPendingScreen,
 * WebLoginPage, OnboardingWizard). All async actions resolve to booleans and surface errors via
 * `error` state instead of throwing, so UI buttons always show their spinner to completion.
 * formatProfileRecord / createDefaultSettings live in src/lib/profileFormat.ts
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { UserProfile } from '../types';
export { createDefaultSettings, formatProfileRecord } from '../lib/profileFormat';
import { formatProfileRecord, createDefaultSettings } from '../lib/profileFormat';
import { getPublicWebOrigin, getAuthRedirectUrl } from '../services/googleAuth';

export type AuthStatus =
  | 'BOOTSTRAPPING'
  | 'AUTH_LOADING'
  | 'UNAUTHENTICATED'
  | 'AUTHENTICATED'
  | 'READY'
  | 'EMAIL_UNVERIFIED'
  | 'NEEDS_SETUP'
  | 'ONBOARDING_REQUIRED'
  | 'ERROR';

export type AuthStep =
  | 'CREATE_ACCOUNT'
  | 'VERIFY_EMAIL'
  | 'SIGN_IN'
  | 'FORGOT_PASSWORD'
  | 'NEW_PASSWORD'
  | 'DISPLAY_NAME'
  | 'USERNAME'
  | 'APPEARANCE'
  | 'DONE';

/** Legacy alias — AuthFlow imports this name. */
export type OnboardingStep = AuthStep;

export interface SignupDraft {
  email: string;
  password: string;
  name: string;
  username: string;
}

const DEFAULT_SIGNUP_DRAFT: SignupDraft = {
  email: '',
  password: '',
  name: '',
  username: '',
};

const RESEND_SECONDS = 60;

export interface UsernameCheckResult {
  valid?: boolean;
  message?: string;
}

export interface AppearancePayload {
  themeMode?: string;
  accentColor?: string;
  chatWallpaper?: string;
  bubbleStyle?: string;
  cornerRadius?: number;
  glassDepth?: number;
  [k: string]: any;
}

interface AuthState {
  status: AuthStatus;
  isAuthenticated: boolean;
  currentStep: AuthStep;
  currentUser: UserProfile | null;
  profile: UserProfile | null;
  isLoadingProfile: boolean;
  unverifiedEmail: string | null;
  isLoading: boolean;
  error: string | null;
  signupDraft: SignupDraft;
  resendCooldown: number;
  isPasswordResetFlow: boolean;

  setStep: (step: AuthStep) => void;
  updateSignupDraft: (updates: Partial<SignupDraft>) => void;
  clearError: () => void;
  initializeSession: () => Promise<void>;

  // Canonical actions used by AuthFlow / EmailVerificationPendingScreen / WebLoginPage
  signUpWithEmail: (email: string, password: string, confirmPassword?: string) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<boolean>;
  resendOtp: () => Promise<boolean>;
  signInWithEmail: (input: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  resendVerificationEmail: (email?: string) => Promise<boolean>;
  sendForgotPasswordLink: (email: string) => Promise<boolean>;
  updateNewPassword: (password: string, confirmPassword?: string) => Promise<boolean>;
  setAccountPassword: (password: string, confirmPassword?: string) => Promise<boolean>;
  saveDisplayNameStep: (name: string) => Promise<boolean>;
  saveUsernameStep: (username: string) => Promise<boolean>;
  checkUsernameAvailable: (username: string) => Promise<UsernameCheckResult>;
  completeAppearanceStep: (appearance: AppearancePayload) => Promise<boolean>;
  toggleBlockUser: (userId: string) => Promise<void>;

  // Legacy / shared actions
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: Partial<UserProfile>) => Promise<void>;
  uploadAvatarOrBanner: (base64: string, kind: 'avatar' | 'banner') => Promise<void>;
  updatePrivacy: (payload: any) => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeAllOtherSessions: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  resendVerification: () => Promise<void>;
}

function friendlyAuthError(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Sign in with your password, use an email code, or tap "Forgot password" to set a new one.';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'Wrong email or password. Please try again.';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Enter the 6-digit code we emailed you.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (m.includes('password should be at least') || m.includes('min')) {
    return 'Password must be at least 8 characters.';
  }
  if (m.includes('token has expired') || m.includes('otp expired')) {
    return 'That code has expired. Tap "Resend Code" for a fresh one.';
  }
  if (m.includes('invalid otp') || m.includes('invalid token') || m.includes('invalid email link')) {
    return 'That code is invalid or was already used. Check the latest email or resend.';
  }
  return msg || 'Something went wrong. Please try again.';
}

async function loadProfileForUser(sbUser: any): Promise<UserProfile | null> {
  if (!sbUser?.id) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .or(`id.eq.${sbUser.id},auth_user_id.eq.${sbUser.id}`)
    .maybeSingle();
  if (!data) {
    // No profile row yet (fresh signup) — DO NOT fabricate an onboarded profile
    // from the email handle, otherwise onboarding is skipped/flashed.
    const fresh = formatProfileRecord({ id: sbUser.id, email: sbUser.email }, sbUser);
    (fresh as any).onboardingCompleted = false;
    (fresh as any).username = '';
    (fresh as any).name = '';
    return fresh;
  }
  return formatProfileRecord(data, sbUser);
}

function profileIsOnboarded(p: UserProfile | null): boolean {
  if (!p) return false;
  // Trust the explicit flag only — username/display_name are auto-seeded by the
  // signup trigger (email local part), so their presence does NOT mean onboarded.
  return (p as any).onboarding_completed === true || (p as any).onboardingCompleted === true;
}

let cooldownTimer: ReturnType<typeof setInterval> | null = null;

function startCooldown(set: (partial: Partial<AuthState>) => void, get: () => AuthState, seconds = RESEND_SECONDS) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  set({ resendCooldown: seconds });
  cooldownTimer = setInterval(() => {
    const cur = get().resendCooldown;
    if (cur <= 1) {
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = null;
      set({ resendCooldown: 0 });
    } else {
      set({ resendCooldown: cur - 1 });
    }
  }, 1000);
}

export const useAuthStore = create<AuthState>((set, get) => {
  const patch = (partial: Partial<AuthState>) => set(partial as any);

  return {
    status: 'BOOTSTRAPPING',
    isAuthenticated: false,
    currentStep: 'CREATE_ACCOUNT',
    currentUser: null,
    profile: null,
    isLoadingProfile: true,
    unverifiedEmail: null,
    isLoading: true,
    error: null,
    signupDraft: DEFAULT_SIGNUP_DRAFT,
    resendCooldown: 0,
    isPasswordResetFlow: false,

    setStep: (step) => set({ currentStep: step, error: null }),
    updateSignupDraft: (updates) => set((s) => ({ signupDraft: { ...s.signupDraft, ...updates } })),
    clearError: () => set({ error: null }),

    initializeSession: async () => {
      set({ isLoading: true, isLoadingProfile: true });
      try {
        // Password-recovery handoff: the emailed link lands back on the site with
        // type=recovery; Supabase client exchanges the code, we route to the new-
        // password screen instead of dumping the user into the app.
        try {
          const url = new URL(window.location.href);
          const qtype = url.searchParams.get('type');
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const htype = hash.get('type');
          if (qtype === 'recovery' || htype === 'recovery') {
            set({ isPasswordResetFlow: true, currentStep: 'NEW_PASSWORD' });
          }
        } catch { /* ignore */ }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          set({
            status: 'UNAUTHENTICATED',
            isAuthenticated: false,
            currentUser: null,
            profile: null,
            isLoading: false,
            isLoadingProfile: false,
          });
          return;
        }
        const profile = await loadProfileForUser(session.user);
        const onboarded = profileIsOnboarded(profile);
        set({
          status: onboarded ? 'READY' : 'AUTHENTICATED',
          isAuthenticated: true,
          currentUser: profile,
          profile,
          currentStep: onboarded ? 'DONE' : 'DISPLAY_NAME',
          isLoading: false,
          isLoadingProfile: false,
          error: null,
        });
      } catch (e: any) {
        set({
          status: 'ERROR',
          error: e?.message || 'Session init failed',
          isLoading: false,
          isLoadingProfile: false,
        });
      }
    },

    // ---------------------------------------------------------------- signup
    signUpWithEmail: async (email, password, confirmPassword) => {
      const cleanEmail = (email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        set({ error: 'Please enter a valid email address.', isLoading: false });
        return false;
      }
      if (!password || password.length < 8) {
        set({ error: 'Password must be at least 8 characters.', isLoading: false });
        return false;
      }
      if (confirmPassword !== undefined && confirmPassword !== null && confirmPassword !== '' && password !== confirmPassword) {
        set({ error: 'Passwords do not match.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (error) throw error;

        if (data.session && data.user) {
          // Auto-confirm enabled or already verified — go straight to onboarding.
          const profile = await loadProfileForUser(data.user);
          set({
            status: 'AUTHENTICATED',
            isAuthenticated: true,
            currentUser: profile,
            profile,
            currentStep: 'DISPLAY_NAME',
            unverifiedEmail: null,
            isLoading: false,
          });
          return true;
        }

        // Standard path: confirmation email with 6-digit code is on its way.
        set((s) => ({
          status: 'EMAIL_UNVERIFIED',
          currentStep: 'VERIFY_EMAIL',
          unverifiedEmail: cleanEmail,
          signupDraft: { ...s.signupDraft, email: cleanEmail, password },
          isLoading: false,
          error: null,
        }));
        startCooldown(patch, get);
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    // ------------------------------------------------------------------- otp
    verifyOtp: async (code) => {
      const email =
        get().unverifiedEmail ||
        get().signupDraft.email ||
        // Email-code sign-in stores the address here too
        (get().currentUser as any)?.pendingEmail ||
        '';
      const clean = (code || '').replace(/\D/g, '');
      if (!email) {
        set({ error: 'Missing email for verification. Please sign up again.', isLoading: false });
        return false;
      }
      if (clean.length !== 6) {
        set({ error: 'Enter the full 6-digit code.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        // 'signup' covers confirmation codes; fall back to 'email' (magic-link
        // style codes) so the same paste-a-code screen handles both.
        let sessionData: any = null;
        let lastError: any = null;
        for (const type of ['signup', 'email'] as const) {
          const { data, error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: clean,
            type,
          });
          if (!error && data?.session) {
            sessionData = data;
            break;
          }
          lastError = error;
        }
        if (!sessionData) throw lastError || new Error('Invalid code');

        const profile = await loadProfileForUser(sessionData.user);
        const onboarded = profileIsOnboarded(profile);
        set({
          status: onboarded ? 'READY' : 'AUTHENTICATED',
          isAuthenticated: true,
          currentUser: profile,
          profile,
          currentStep: onboarded ? 'DONE' : 'DISPLAY_NAME',
          unverifiedEmail: null,
          isLoading: false,
          error: null,
        });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    resendOtp: async () => {
      const email = get().unverifiedEmail || get().signupDraft.email;
      if (!email) return false;
      set({ isLoading: true, error: null });
      try {
        const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
        if (error) throw error;
        startCooldown(patch, get);
        set({ isLoading: false });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    resendVerificationEmail: async (email) => {
      const target = email || get().unverifiedEmail || get().signupDraft.email;
      if (!target) return false;
      if (get().resendCooldown > 0) return false;
      set({ isLoading: true, error: null });
      try {
        const { error } = await supabase.auth.resend({ type: 'signup', email: target.trim() });
        if (error) throw error;
        startCooldown(patch, get);
        set({ isLoading: false });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    // ---------------------------------------------------------------- signin
    signInWithEmail: async (input, password) => {
      const raw = (input || '').trim();
      if (!raw || !password) {
        set({ error: 'Enter your email and password.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        let email = raw;
        if (!raw.includes('@')) {
          // Handle sign-in: resolve @username → account email via public profiles.
          const handle = raw.replace(/^@+/, '').toLowerCase();
          const { data: row, error: lookupErr } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('username', handle)
            .maybeSingle();
          if (lookupErr) throw lookupErr;
          if (!row?.email) {
            set({ error: `No Relay account found for @${handle}.`, isLoading: false });
            return false;
          }
          email = row.email;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session || !data.user) throw new Error('No session returned');

        const profile = await loadProfileForUser(data.user);
        const onboarded = profileIsOnboarded(profile);
        set({
          status: onboarded ? 'READY' : 'AUTHENTICATED',
          isAuthenticated: true,
          currentUser: profile,
          profile,
          currentStep: onboarded ? 'DONE' : 'DISPLAY_NAME',
          isLoading: false,
          error: null,
        });
        return true;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        if (msg.includes('email not confirmed')) {
          set((s) => ({
            status: 'EMAIL_UNVERIFIED',
            currentStep: 'VERIFY_EMAIL',
            unverifiedEmail: raw.includes('@') ? raw : '',
            error: 'Your email is not confirmed yet. Enter the 6-digit code we emailed you.',
            isLoading: false,
          }));
          startCooldown(patch, get);
          return false;
        }
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    signInWithGoogle: async () => {
      set({ isLoading: true, error: null });
      try {
        const Cap = (typeof window !== 'undefined' ? (window as any).Capacitor : null);
        const isNative = !!Cap?.isNativePlatform?.();

        if (isNative) {
          const { performNativeGoogleSignIn } = await import('../services/googleAuth');
          const res = await performNativeGoogleSignIn();
          if (!res.success) {
            set({ error: res.error || 'Google sign-in failed', isLoading: false });
            return false;
          }
          // Browser tab flow takes over; session lands via deep link / redirect.
          return true;
        }

        const origin = typeof window !== 'undefined' ? window.location.origin : getPublicWebOrigin();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${origin}/auth`,
            queryParams: { access_type: 'offline', prompt: 'select_account' },
          },
        });
        if (error) throw error;
        // Browser redirects to Google; leave the spinner running during navigation.
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    // ------------------------------------------------------- password reset
    sendForgotPasswordLink: async (email) => {
      const clean = (email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        set({ error: 'Please enter a valid email address.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(clean, {
          redirectTo: `${getPublicWebOrigin()}/auth?type=recovery`,
        });
        if (error) throw error;
        set({ isLoading: false });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    updateNewPassword: async (password, confirmPassword) => {
      if (!password || password.length < 8) {
        set({ error: 'Password must be at least 8 characters.', isLoading: false });
        return false;
      }
      if (confirmPassword !== undefined && confirmPassword !== null && password !== confirmPassword) {
        set({ error: 'Passwords do not match.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        const profile = await loadProfileForUser(data.user);
        const onboarded = profileIsOnboarded(profile);
        set({
          status: onboarded ? 'READY' : 'AUTHENTICATED',
          isAuthenticated: true,
          currentUser: profile,
          profile,
          currentStep: onboarded ? 'DONE' : 'DISPLAY_NAME',
          isPasswordResetFlow: false,
          isLoading: false,
          error: null,
        });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    /** Set or change the account password from ANY authenticated session
     *  (password, OTP-code or Google). Accounts created via email code or
     *  Google have NO password — this is how they get one, and afterwards
     *  password sign-in works on every device. */
    setAccountPassword: async (password, confirmPassword) => {
      if (!password || password.length < 8) {
        set({ error: 'Password must be at least 8 characters.', isLoading: false });
        return false;
      }
      if (confirmPassword !== undefined && confirmPassword !== null && password !== confirmPassword) {
        set({ error: 'Passwords do not match.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        set({ isLoading: false, error: null });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    // ----------------------------------------------------------- onboarding
    saveDisplayNameStep: async (name) => {
      const clean = (name || '').trim();
      if (!clean) {
        set({ error: 'Please enter a display name.', isLoading: false });
        return false;
      }
      set((s) => ({ signupDraft: { ...s.signupDraft, name: clean }, error: null }));
      set({ currentStep: 'USERNAME', error: null });
      return true;
    },

    checkUsernameAvailable: async (username) => {
      const clean = (username || '').toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '');
      if (!clean) return { valid: false, message: 'Enter a handle' };
      if (clean.length < 3) return { valid: false, message: 'At least 3 characters' };
      if (clean.length > 24) return { valid: false, message: 'Max 24 characters' };
      try {
        const uid = get().profile?.id || get().currentUser?.id;
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', clean)
          .maybeSingle();
        if (error) return { valid: false, message: 'Error checking handle' };
        if (data && data.id !== uid) return { valid: false, message: `@${clean} is taken` };
        return { valid: true, message: `@${clean} is available` };
      } catch {
        return { valid: false, message: 'Error checking handle' };
      }
    },

    saveUsernameStep: async (username) => {
      const clean = (username || '').toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '');
      const check = await get().checkUsernameAvailable(clean);
      if (!check.valid) {
        set({ error: check.message || 'That handle is not available.', isLoading: false });
        return false;
      }
      set({ isLoading: true, error: null });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in');
        const draft = get().signupDraft;
        const { error } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            auth_user_id: user.id,
            username: clean,
            display_name: draft.name || user.email?.split('@')[0] || 'Relay user',
            full_name: draft.name || '',
            email: user.email || '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        if (error) throw error;

        const profile = await loadProfileForUser(user);
        set({
          profile,
          currentUser: profile,
          signupDraft: { ...draft, username: clean },
          currentStep: 'APPEARANCE',
          isLoading: false,
          error: null,
        });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    completeAppearanceStep: async (appearance) => {
      set({ isLoading: true, error: null });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in');

        const { error } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            theme_preference: String(appearance.themeMode || 'light'),
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        if (error) throw error;

        // Apply the picked aesthetic live via the theme store.
        try {
          const { useThemeStore } = await import('./themeStore');
          useThemeStore.getState().updateCustomization({
            themeMode: (appearance.themeMode as any) || 'light',
            accentColor: (appearance.accentColor as any) || 'liquid-azure',
            chatWallpaper: (appearance.chatWallpaper as any) || 'glass-gradient',
            bubbleStyle: (appearance.bubbleStyle as any) || 'edge-glow',
            cornerRadius: typeof appearance.cornerRadius === 'number' ? appearance.cornerRadius : 18,
            glassDepth: typeof appearance.glassDepth === 'number' ? appearance.glassDepth : 40,
          });
        } catch { /* theme store optional */ }

        const profile = await loadProfileForUser(user);
        try {
          localStorage.setItem('relay_setup_completed', 'true');
          if (profile) localStorage.setItem('relay_cached_user_profile', JSON.stringify(profile));
        } catch { /* storage optional */ }

        set({
          status: 'READY',
          isAuthenticated: true,
          currentUser: profile,
          profile,
          currentStep: 'DONE',
          isLoading: false,
          error: null,
        });
        return true;
      } catch (e: any) {
        set({ error: friendlyAuthError(e?.message), isLoading: false });
        return false;
      }
    },

    toggleBlockUser: async (userId) => {
      const cur = get().profile || get().currentUser;
      if (!cur) return;
      const list: string[] = Array.isArray((cur as any).blockedUsers) ? (cur as any).blockedUsers : [];
      const next = list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId];
      const updated = { ...cur, blockedUsers: next } as UserProfile;
      set({ profile: updated, currentUser: updated });
      try {
        localStorage.setItem('relay_blocked_users', JSON.stringify(next));
      } catch { /* storage optional */ }
    },

    // ------------------------------------------------------ legacy wrappers
    login: async (email, password) => {
      const ok = await get().signInWithEmail(email, password);
      if (!ok) throw new Error(get().error || 'Login failed');
    },

    signup: async (email, password, displayName) => {
      set((s) => ({ signupDraft: { ...s.signupDraft, name: displayName || '' } }));
      const ok = await get().signUpWithEmail(email, password);
      if (!ok) throw new Error(get().error || 'Signup failed');
    },

    logout: async () => {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      try {
        localStorage.removeItem('relay_setup_completed');
        localStorage.removeItem('relay_cached_user_profile');
      } catch { /* ignore */ }
      // wipe THIS account's cached conversations — the next sign-in (possibly
      // a different account on a shared device) must start clean
      try {
        const { clearCacheScope } = await import('../services/cacheScope');
        clearCacheScope();
      } catch { /* ignore */ }
      set({
        status: 'UNAUTHENTICATED',
        isAuthenticated: false,
        currentUser: null,
        profile: null,
        currentStep: 'CREATE_ACCOUNT',
        unverifiedEmail: null,
        signupDraft: DEFAULT_SIGNUP_DRAFT,
        isPasswordResetFlow: false,
        error: null,
      });
    },

    updateProfile: async (payload) => {
      const cur = get().profile || get().currentUser;
      if (!cur?.id) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: payload.name,
          full_name: payload.name,
          username: payload.username,
          bio: payload.bio,
          status_message: payload.statusMessage,
          avatar_url: payload.avatarUrl,
        })
        .or(`id.eq.${cur.id},auth_user_id.eq.${cur.id}`)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const formatted = formatProfileRecord(data || { ...cur, ...payload });
      set({ currentUser: formatted, profile: formatted });
    },

    uploadAvatarOrBanner: async (base64, kind) => {
      const cur = get().profile || get().currentUser;
      if (!cur?.id) throw new Error('Not authenticated');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const binary = atob(base64.includes(',') ? base64.split(',')[1] : base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const path = `${user.id}/${kind}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub?.publicUrl;
      if (kind === 'avatar') {
        await get().updateProfile({ avatarUrl: url });
      } else {
        await supabase.from('profiles').update({ banner_url: url }).or(`id.eq.${cur.id},auth_user_id.eq.${cur.id}`);
        const next = { ...cur, bannerUrl: url };
        set({ currentUser: next as UserProfile, profile: next as UserProfile });
      }
    },

    updatePrivacy: async (payload) => {
      const cur = get().profile || get().currentUser;
      if (!cur) return;
      const privacy = { ...(cur.settings?.privacy || {}), ...payload };
      const settings = { ...cur.settings, privacy };
      const next = { ...cur, settings };
      set({ currentUser: next as UserProfile, profile: next as UserProfile });
      try {
        await supabase.from('user_settings').upsert({ profile_id: cur.id, privacy });
      } catch { /* optional table */ }
    },

    revokeSession: async () => {},
    revokeAllOtherSessions: async () => {},
    deleteAccount: async () => {
      await get().logout();
    },
    resendVerification: async () => {
      await get().resendOtp();
    },
  };
});

// Auto-bootstrap once in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try { useAuthStore.getState().initializeSession(); } catch { /* ignore */ }
  }, 0);
}
