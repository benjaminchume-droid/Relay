/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { UserProfile, UserPrivacySettings, UserSecuritySettings, UserSettings } from '../types';
import { supabase } from '../lib/supabase/client';
import { performNativeGoogleSignIn } from '../services/googleAuth';
import { App as CapApp } from '@capacitor/app';

export type AuthStatus = 
  | 'BOOTSTRAPPING'       // Initial boot, reading local storage & checking cached session
  | 'AUTH_LOADING'        // Legacy alias for BOOTSTRAPPING
  | 'UNAUTHENTICATED'     // No session -> Create Relay Account screen
  | 'EMAIL_UNVERIFIED'    // Email unverified -> Email Verification screen
  | 'NEEDS_SETUP'         // Authenticated user lacking display name / username -> Setup Wizard
  | 'ONBOARDING_REQUIRED' // Legacy alias for NEEDS_SETUP
  | 'READY'               // Authenticated user with complete setup -> Main Workspace
  | 'AUTHENTICATED';      // Legacy alias for READY

export type OnboardingStep = 
  | 'CREATE_ACCOUNT'    // Email + Password + Confirm Password
  | 'VERIFY_EMAIL'      // "We've sent a verification link to your email"
  | 'DISPLAY_NAME'      // Choose display name
  | 'USERNAME'          // Choose username
  | 'APPEARANCE'        // Choose appearance
  | 'SIGN_IN'           // Sign in screen
  | 'FORGOT_PASSWORD'   // Reset link screen
  | 'NEW_PASSWORD';     // Set new password screen

export interface SignupDraft {
  email: string;
  password: string;
  name: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  statusMessage?: string;
  country?: string;
  appearance?: any;
  isGoogleUser?: boolean;
}

export interface AuthState {
  status: AuthStatus;
  isAuthenticated: boolean;
  currentStep: OnboardingStep;
  currentUser: UserProfile | null;
  profile: UserProfile | null;
  isLoadingProfile: boolean;
  unverifiedEmail: string | null;
  isLoading: boolean;
  error: string | null;
  signupDraft: SignupDraft;
  resendCooldown: number;
  isPasswordResetFlow: boolean;

  // State Machine Operations
  initializeSession: () => Promise<void>;
  setStep: (step: OnboardingStep) => void;
  updateSignupDraft: (updates: Partial<SignupDraft>) => void;
  clearError: () => void;

  // Auth Operations
  signUpWithEmail: (email: string, pass: string, confirmPass: string) => Promise<boolean>;
  verifyOtp: (token: string) => Promise<boolean>;
  resendOtp: (emailOverride?: string) => Promise<boolean>;
  signInWithEmail: (emailOrUser: string, pass: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  resendVerificationEmail: (emailOverride?: string) => Promise<boolean>;
  sendForgotPasswordLink: (email: string) => Promise<boolean>;
  updateNewPassword: (newPassword: string, confirmNewPassword: string) => Promise<boolean>;
  
  // Username Check
  checkUsernameAvailable: (username: string) => Promise<{ valid: boolean; message: string }>;

  // Onboarding Step Completion
  saveDisplayNameStep: (name: string) => Promise<void>;
  saveUsernameStep: (username: string) => Promise<void>;
  completeAppearanceStep: (appearanceConfig: any) => Promise<void>;

  // Profile & Session Management
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateAppearance: (appearanceUpdates: Partial<UserProfile['settings']['appearance']>) => Promise<void>;
  toggleBlockUser: (targetUserId: string) => Promise<void>;
  uploadAvatarOrBanner: (fileData: string, type: 'avatar' | 'banner') => Promise<void>;
  updatePrivacy: (privacyUpdates: Partial<UserProfile['settings']['privacy']>) => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeAllOtherSessions: () => Promise<void>;
}

const DEFAULT_SIGNUP_DRAFT: SignupDraft = {
  email: '',
  password: '',
  name: '',
  username: '',
  avatarUrl: '',
  bio: 'Exploring Relay.',
  statusMessage: 'Available',
  country: 'United States',
  appearance: undefined,
  isGoogleUser: false
};

// Helper: Get Deep Link Auth Redirect URL
export function getAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return 'relay://login';
  const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
  if (isNative) {
    return 'relay://login';
  }
  return 'relay://login';
}

// Helper: Format backend errors into clean, friendly user-facing error messages
export function formatAuthError(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = typeof error === 'string' ? error : error.message || error.error_description || '';
  const lower = msg.toLowerCase();

  if (lower.includes('already registered') || lower.includes('user_already_exists') || lower.includes('email already in use')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials') || lower.includes('invalid email or password')) {
    return 'Invalid email or password. Please double-check your credentials.';
  }
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) {
    return 'Your email address has not been verified yet. Please check your inbox for the 6-digit code.';
  }
  if (lower.includes('token is expired') || lower.includes('otp_expired') || lower.includes('expired')) {
    return 'The 6-digit verification code has expired. Please tap Resend Code to receive a new code.';
  }
  if (lower.includes('invalid token') || lower.includes('token is invalid') || lower.includes('invalid_otp') || lower.includes('invalid code')) {
    return 'The 6-digit verification code is invalid. Please double-check the code in your email.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 8 characters long.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Email rate limit exceeded. Please wait a few minutes before trying again.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  if (lower.includes('provider is disabled') || lower.includes('403') || lower.includes('unauthorized_client') || lower.includes('not enabled') || lower.includes('access_denied')) {
    return 'Google Sign-In is not enabled on this Supabase project. Please sign in with your Email Address and Password.';
  }

  return msg || 'Unable to process your request. Please check your information and try again.';
}

// Helper: Default Settings
export function createDefaultSettings(): UserProfile['settings'] {
  return {
    appearance: {
      themeMode: 'light',
      designLanguage: 'liquid-glass',
      accentColor: 'liquid-azure',
      blurIntensity: 24,
      transparency: 40,
      cornerRadius: 18,
      shadowDepth: 30,
      glassDepth: 40,
      refraction: 30,
      edgeGlow: 25,
      animationSpeed: 'smooth',
      uiDensity: 'comfortable',
      chatWallpaper: 'glass-gradient',
      storiesLayout: 'horizontal',
      bubbleStyle: 'edge-glow',
      bubbleSpacing: 10,
      fontSize: 'sm',
      appIcon: 'liquid-blue',
      soundEnabled: true,
      hapticsEnabled: true,
      reducedMotion: false,
      perChatThemes: {}
    },
    privacy: {
      whoCanMessage: 'everyone',
      whoCanAddGroups: 'everyone',
      hideOnline: false,
      hideLastSeen: false,
      readReceipts: true,
      offlineMode: false,
      profilePhotoVisibility: 'everyone',
      bioVisibility: 'everyone',
      allowTagging: true,
      messageRequests: true,
      communityInvites: true,
      typingIndicator: true,
      linkPreview: true
    },
    security: {
      twoFactorEnabled: false,
      activeSessions: [],
      loginAlerts: true
    },
    notifications: {
      enabled: true,
      directMessages: true,
      groupMentions: true,
      reactions: true,
      sound: 'gentle_chime',
      vibration: true
    }
  };
}

// Helper: Format raw DB profile into UserProfile
export function formatProfileRecord(p: any, sbUser?: any): UserProfile {
  const settings = p.settings || createDefaultSettings();
  const email = p.email || sbUser?.email || '';
  const fallbackUsername = email ? email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') : `user_${(p.id || sbUser?.id)?.substring(0, 6)}`;

  return {
    id: p.id || sbUser?.id,
    username: p.username || fallbackUsername,
    name: p.full_name || p.display_name || sbUser?.user_metadata?.full_name || sbUser?.user_metadata?.name || p.username || fallbackUsername,
    email,
    avatarUrl: p.avatar_url || sbUser?.user_metadata?.avatar_url || undefined,
    bannerUrl: p.banner_url || undefined,
    bio: p.bio || 'Exploring Relay.',
    statusMessage: p.status_message || 'Available',
    onlineStatus: (p.online_status || 'online') as any,
    lastSeen: p.last_seen || 'Just now',
    dob: p.date_of_birth || undefined,
    country: p.country || sbUser?.user_metadata?.country || 'United States',
    socialLinks: p.social_links || {},
    contacts: p.contacts || [],
    blockedUsers: p.blocked_users || [],
    sentRequests: p.sent_requests || [],
    receivedRequests: p.received_requests || [],
    settings,
    createdAt: p.created_at || new Date().toISOString()
  };
}

let isListenerAttached = false;

export const useAuthStore = create<AuthState>((set, get) => ({
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
    const isAlreadyAuthed = (get().status === 'READY' || get().status === 'AUTHENTICATED') && !!(get().profile || get().currentUser);

    // 1. FAST LOCAL STORAGE REHYDRATION (Synchronous check on cold start BEFORE any network calls)
    if (!isAlreadyAuthed) {
      const cachedSetupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';
      let cachedProfile: UserProfile | null = null;
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('relay_cached_user_profile') : null;
        if (raw) cachedProfile = JSON.parse(raw);
      } catch (e) {
        console.warn('[Relay Auth] Local storage cache parse error:', e);
      }

      if (cachedSetupDone && cachedProfile) {
        console.log('[Relay Auth] Hydrated session from local storage cache:', cachedProfile.id);
        set({
          status: 'READY',
          isAuthenticated: true,
          currentUser: cachedProfile,
          profile: cachedProfile,
          isLoadingProfile: false,
          isLoading: false
        });
      }
    }

    // Global listener for Capacitor deep links / app URLs
    if (!isListenerAttached) {
      isListenerAttached = true;

      // Capacitor App Link listener
      CapApp.addListener('appUrlOpen', async (event) => {
        console.log('[Relay Auth DeepLink] Deep link URL opened:', event.url);
        if (event.url) {
          await handleUrlCallback(event.url, set, get);
        }
      });

      // Check cold-start launch URL
      CapApp.getLaunchUrl().then(async (launchUrl) => {
        if (launchUrl?.url) {
          console.log('[Relay Auth DeepLink] Cold start launch URL detected:', launchUrl.url);
          await handleUrlCallback(launchUrl.url, set, get);
        }
      }).catch((e) => console.warn('[Relay Auth DeepLink] Launch URL check error:', e));

      // Window location listener for Web / Hash callbacks
      if (typeof window !== 'undefined') {
        const handleLocationHash = async () => {
          if (window.location.hash || window.location.search) {
            console.log('[Relay Auth Hash] Handling location change:', window.location.href);
            await handleUrlCallback(window.location.href, set, get);
          }
        };
        window.addEventListener('hashchange', handleLocationHash);
        // Check current location on start
        if (window.location.hash || window.location.search) {
          await handleUrlCallback(window.location.href, set, get);
        }
      }

      // Supabase Auth State Change Listener
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Relay Auth Listener] Event:', event, 'Session user:', session?.user?.id);

        if (event === 'PASSWORD_RECOVERY') {
          set({
            status: 'NEEDS_SETUP',
            currentStep: 'NEW_PASSWORD',
            isPasswordResetFlow: true,
            isLoading: false,
            isLoadingProfile: false
          });
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            // Token refreshed silently: DO NOT reset profile to null or set isLoadingProfile = true
            await resolveUserAuthState(session.user, set, get, true);
          }
        } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (session?.user) {
            const isAuthed = (get().status === 'READY' || get().status === 'AUTHENTICATED') && !!(get().profile || get().currentUser);
            await resolveUserAuthState(session.user, set, get, isAuthed);
          }
        } else if (event === 'SIGNED_OUT') {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('relay_setup_completed');
            localStorage.removeItem('relay_cached_user_profile');
            localStorage.removeItem('relay_v2_auth_token');
          }
          set({
            status: 'UNAUTHENTICATED',
            currentStep: 'CREATE_ACCOUNT',
            currentUser: null,
            profile: null,
            unverifiedEmail: null,
            isLoading: false,
            isLoadingProfile: false
          });
        }
      });
    }

    // 2. BACKGROUND SUPABASE SESSION VALIDATION (with safety timeout)
    try {
      const getSessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ isTimeout: true }), 3500));
      const res: any = await Promise.race([getSessionPromise, timeoutPromise]);

      if (res?.data?.session?.user) {
        await resolveUserAuthState(res.data.session.user, set, get, true);
      } else if (res?.isTimeout || res?.error) {
        console.warn('[Relay Auth] Session check timeout/error:', res?.error);
        const setupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';
        if (!setupDone && !get().currentUser) {
          set({
            status: 'UNAUTHENTICATED',
            currentStep: 'CREATE_ACCOUNT',
            currentUser: null,
            profile: null,
            isLoading: false,
            isLoadingProfile: false
          });
        } else {
          set({ isLoadingProfile: false, isLoading: false });
        }
      } else {
        // No session returned from Supabase
        const setupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';
        if (!setupDone) {
          set({
            status: 'UNAUTHENTICATED',
            currentStep: 'CREATE_ACCOUNT',
            currentUser: null,
            profile: null,
            isLoading: false,
            isLoadingProfile: false
          });
        } else {
          set({ isLoadingProfile: false, isLoading: false });
        }
      }
    } catch (e) {
      console.warn('[Relay Auth] initializeSession exception:', e);
      const setupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';
      if (!setupDone && !get().currentUser) {
        set({
          status: 'UNAUTHENTICATED',
          currentStep: 'CREATE_ACCOUNT',
          currentUser: null,
          profile: null,
          isLoading: false,
          isLoadingProfile: false
        });
      } else {
        set({ isLoadingProfile: false, isLoading: false });
      }
    }
  },

  signUpWithEmail: async (email, pass, confirmPass) => {
    set({ isLoading: true, error: null });

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      set({ error: 'Please enter a valid email address.', isLoading: false });
      return false;
    }
    if (!pass || pass.length < 8) {
      set({ error: 'Password must be at least 8 characters long.', isLoading: false });
      return false;
    }
    if (pass !== confirmPass) {
      set({ error: 'Passwords do not match. Please verify your password.', isLoading: false });
      return false;
    }

    try {
      console.log('[Relay Auth SignUp] Registering user with email OTP:', cleanEmail);

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
      });

      if (error) {
        console.error('[Relay Auth SignUp Error]', {
          message: error.message,
          status: error.status || (error as any).code,
          details: error
        });
        set({ error: formatAuthError(error), isLoading: false });
        return false;
      }

      const sbUser = data.user;
      const isConfirmed = sbUser?.email_confirmed_at || sbUser?.confirmed_at;

      set((state) => ({
        signupDraft: {
          ...state.signupDraft,
          email: cleanEmail,
          password: pass,
          isGoogleUser: false
        },
        unverifiedEmail: cleanEmail,
        isLoading: false
      }));

      if (isConfirmed) {
        // If email was automatically confirmed (e.g. local dev mode or auto-confirm)
        set({
          status: 'ONBOARDING_REQUIRED',
          currentStep: 'DISPLAY_NAME'
        });
      } else {
        // Transition to EMAIL_UNVERIFIED -> VERIFY_EMAIL OTP Screen
        set({
          status: 'EMAIL_UNVERIFIED',
          currentStep: 'VERIFY_EMAIL'
        });
      }

      return true;
    } catch (err: any) {
      console.error('[Relay Auth SignUp Exception]', {
        message: err?.message || String(err),
        status: err?.status || err?.code || 500,
        details: err
      });
      set({ error: formatAuthError(err), isLoading: false });
      return false;
    }
  },

  verifyOtp: async (token) => {
    const targetEmail = get().unverifiedEmail || get().signupDraft.email;
    const cleanToken = token.trim();

    if (!targetEmail) {
      set({ error: 'No email address found for verification.' });
      return false;
    }
    if (!cleanToken || cleanToken.length !== 6) {
      set({ error: 'Please enter the complete 6-digit verification code.' });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      console.log('[Relay Auth verifyOtp] Verifying 6-digit OTP code for:', targetEmail);

      let { data, error } = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: cleanToken,
        type: 'signup'
      });

      if (error) {
        // Fallback retry with type 'email'
        const fallback = await supabase.auth.verifyOtp({
          email: targetEmail,
          token: cleanToken,
          type: 'email'
        });
        if (!fallback.error) {
          data = fallback.data;
          error = null;
        }
      }

      if (error) {
        console.error('[Relay Auth verifyOtp Error]', error);
        set({ error: error.message || 'Verification code invalid or expired.', isLoading: false });
        return false;
      }

      console.log('[Relay Auth verifyOtp Success] User email verified successfully:', data.user?.email);

      if (data.user) {
        await resolveUserAuthState(data.user, set, get);
      } else {
        set({
          status: 'ONBOARDING_REQUIRED',
          currentStep: 'DISPLAY_NAME',
          isLoading: false
        });
      }

      return true;
    } catch (err: any) {
      console.error('[Relay Auth verifyOtp Exception]', err);
      set({ error: err?.message || String(err), isLoading: false });
      return false;
    }
  },

  resendOtp: async (emailOverride) => {
    const targetEmail = emailOverride || get().unverifiedEmail || get().signupDraft.email;
    if (!targetEmail) {
      set({ error: 'No email address found to send verification code.' });
      return false;
    }

    if (get().resendCooldown > 0) {
      set({ error: `Please wait ${get().resendCooldown} seconds before requesting a new code.` });
      return false;
    }

    set({ isLoading: true, error: null });
    try {
      console.log('[Relay Auth resendOtp] Resending signup OTP code to:', targetEmail);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail
      });

      if (error) {
        set({ error: formatAuthError(error), isLoading: false });
        return false;
      }

      // 30-second cooldown timer
      set({ resendCooldown: 30, isLoading: false });
      const timer = setInterval(() => {
        const current = get().resendCooldown;
        if (current <= 1) {
          clearInterval(timer);
          set({ resendCooldown: 0 });
        } else {
          set({ resendCooldown: current - 1 });
        }
      }, 1000);

      return true;
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
      return false;
    }
  },

  resendVerificationEmail: async (emailOverride) => {
    return get().resendOtp(emailOverride);
  },

  signInWithEmail: async (emailOrUser, pass) => {
    set({ isLoading: true, error: null });

    const input = emailOrUser.trim().toLowerCase();
    if (!input || !pass) {
      set({ error: 'Please enter your email and password.', isLoading: false });
      return false;
    }

    let targetEmail = input;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);

    if (!isEmail) {
      // Look up actual user email by username handle
      const cleanHandle = input.replace(/^@+/, '');
      try {
        const { data: prof } = await supabase.from('profiles').select('email').ilike('username', cleanHandle).maybeSingle();
        if (prof?.email) {
          targetEmail = prof.email;
        } else {
          set({ error: `No account found with username @${cleanHandle}. Please check your handle or sign in with your email.`, isLoading: false });
          return false;
        }
      } catch (e) {
        set({ error: `Unable to verify username @${cleanHandle}. Please sign in with your email.`, isLoading: false });
        return false;
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: pass
      });

      if (error) {
        set({ error: formatAuthError(error), isLoading: false });
        return false;
      }

      const sbUser = data.user;
      if (sbUser) {
        await resolveUserAuthState(sbUser, set, get);
      }

      set({ isLoading: false });
      return true;
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
      return false;
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      console.log('[Relay Auth Google] Initiating native Google Sign-In with ID Token...');
      const result = await performNativeGoogleSignIn();

      if (!result.success) {
        set({ error: result.error || 'Google Sign-In failed.', isLoading: false });
        return;
      }

      if (result.user) {
        await resolveUserAuthState(result.user, set, get);
      }
      set({ isLoading: false });
    } catch (err: any) {
      console.error('[Relay Auth Google Exception]', {
        message: err?.message || String(err),
        status: err?.status || err?.code || 403,
        details: err
      });
      set({ error: formatAuthError(err), isLoading: false });
    }
  },

  sendForgotPasswordLink: async (email) => {
    set({ isLoading: true, error: null });
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      set({ error: 'Please enter a valid email address.', isLoading: false });
      return false;
    }

    try {
      const redirectUrl = getAuthRedirectUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });

      if (error) {
        set({ error: formatAuthError(error), isLoading: false });
        return false;
      }

      set({ isLoading: false });
      return true;
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
      return false;
    }
  },

  updateNewPassword: async (newPassword, confirmNewPassword) => {
    set({ isLoading: true, error: null });
    if (!newPassword || newPassword.length < 8) {
      set({ error: 'New password must be at least 8 characters long.', isLoading: false });
      return false;
    }
    if (newPassword !== confirmNewPassword) {
      set({ error: 'Passwords do not match.', isLoading: false });
      return false;
    }

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        set({ error: formatAuthError(error), isLoading: false });
        return false;
      }

      set({ isPasswordResetFlow: false });
      if (data.user) {
        await resolveUserAuthState(data.user, set, get);
      }
      set({ isLoading: false });
      return true;
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
      return false;
    }
  },

  checkUsernameAvailable: async (username) => {
    if (!username) return { valid: false, message: 'Username is required' };
    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      return { valid: false, message: 'Username must be between 3 and 20 characters' };
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return { valid: false, message: 'Only lowercase letters, numbers, and underscores allowed' };
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (error) {
        console.warn('[checkUsernameAvailable] Query error:', error);
      }

      if (profile) {
        return { valid: false, message: 'Username taken' };
      }

      return { valid: true, message: 'Username is available' };
    } catch (e) {
      console.error('[checkUsernameAvailable] Exception:', e);
      return { valid: false, message: 'Error checking username availability' };
    }
  },

  saveDisplayNameStep: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      set({ error: 'Display name cannot be empty.' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user session');

      get().updateSignupDraft({ name: trimmed });

      // Save display name to Supabase profile
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: trimmed,
        display_name: trimmed,
        email: user.email || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      set({
        status: 'ONBOARDING_REQUIRED',
        currentStep: 'USERNAME',
        isLoading: false
      });
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
    }
  },

  saveUsernameStep: async (username) => {
    const cleanUsername = username.trim().toLowerCase().replace(/^@+/, '');
    
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      set({ error: 'Username must be between 3 and 20 characters.' });
      return;
    }

    const check = await get().checkUsernameAvailable(cleanUsername);
    if (!check.valid) {
      set({ error: check.message });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user session');

      const displayName = get().signupDraft.name || user.user_metadata?.full_name || cleanUsername;

      get().updateSignupDraft({ username: cleanUsername });

      // Update user profile row in public.profiles with verified display_name and username
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        username: cleanUsername,
        full_name: displayName,
        display_name: displayName,
        email: user.email || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (profileErr) {
        console.error('[saveUsernameStep] Error updating profile:', profileErr);
        set({ error: profileErr.message || 'Failed to save username to profile', isLoading: false });
        return;
      }

      set({
        status: 'ONBOARDING_REQUIRED',
        currentStep: 'APPEARANCE',
        isLoading: false
      });
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
    }
  },

  completeAppearanceStep: async (appearanceConfig) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user session');

      const draft = get().signupDraft;
      const settings = createDefaultSettings();
      if (appearanceConfig) {
        settings.appearance = { ...settings.appearance, ...appearanceConfig };
      }

      const profileObj = {
        id: user.id,
        username: draft.username || user.email?.split('@')[0] || `user_${user.id.substring(0, 6)}`,
        full_name: draft.name || user.user_metadata?.full_name || 'Relay User',
        email: user.email || '',
        avatar_url: draft.avatarUrl || user.user_metadata?.avatar_url || null,
        bio: draft.bio || 'Exploring Relay.',
        status_message: draft.statusMessage || 'Available',
        country: draft.country || user.user_metadata?.country || 'United States',
        settings,
        updated_at: new Date().toISOString()
      };

      await supabase.from('profiles').upsert(profileObj, { onConflict: 'id' });

      const finalProfile = formatProfileRecord(profileObj, user);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('relay_setup_completed', 'true');
        localStorage.setItem('relay_cached_user_profile', JSON.stringify(finalProfile));
      }

      set({
        currentUser: finalProfile,
        profile: finalProfile,
        status: 'READY',
        isAuthenticated: true,
        isLoading: false,
        signupDraft: DEFAULT_SIGNUP_DRAFT
      });
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore signout errors
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('relay_setup_completed');
      localStorage.removeItem('relay_cached_user_profile');
      localStorage.removeItem('relay_v2_auth_token');
    }

    set({
      status: 'UNAUTHENTICATED',
      currentStep: 'CREATE_ACCOUNT',
      currentUser: null,
      profile: null,
      unverifiedEmail: null,
      isLoading: false,
      isLoadingProfile: false,
      signupDraft: DEFAULT_SIGNUP_DRAFT
    });
  },

  updateProfile: async (updates) => {
    const user = get().currentUser;
    if (!user) return;
    set({ isLoading: true, error: null });

    try {
      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) dbUpdates.full_name = updates.name;
      if (updates.username !== undefined) dbUpdates.username = updates.username.trim().toLowerCase().replace(/^@+/, '');
      if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;
      if (updates.bannerUrl !== undefined) dbUpdates.banner_url = updates.bannerUrl;
      if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
      if (updates.statusMessage !== undefined) dbUpdates.status_message = updates.statusMessage;

      await supabase.from('profiles').update(dbUpdates).eq('id', user.id);

      const updatedUser = { ...user, ...updates };
      set({ currentUser: updatedUser, isLoading: false });
    } catch (err) {
      set({ error: formatAuthError(err), isLoading: false });
    }
  },

  updateAppearance: async (appearanceUpdates) => {
    const user = get().currentUser;
    if (!user) return;
    try {
      const updatedApp = { ...user.settings.appearance, ...appearanceUpdates };
      const updatedSettings = { ...user.settings, appearance: updatedApp };
      
      await supabase.from('profiles').update({ settings: updatedSettings }).eq('id', user.id);
      
      set({
        currentUser: {
          ...user,
          settings: updatedSettings
        }
      });
    } catch (err) {
      set({ error: formatAuthError(err) });
    }
  },

  toggleBlockUser: async (targetUserId: string) => {
    const user = get().currentUser;
    if (!user) return;
    const isBlocked = user.blockedUsers.includes(targetUserId);
    const updatedBlocked = isBlocked 
      ? user.blockedUsers.filter(id => id !== targetUserId)
      : [...user.blockedUsers, targetUserId];

    set({ currentUser: { ...user, blockedUsers: updatedBlocked } });
    try {
      if (isBlocked) {
        await supabase.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', targetUserId);
      } else {
        await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: targetUserId });
      }
    } catch (e) {
      console.warn('Block user query:', e);
    }
  },

  uploadAvatarOrBanner: async (fileData: string, type: 'avatar' | 'banner') => {
    const user = get().currentUser;
    if (!user) return;
    if (type === 'avatar') {
      await get().updateProfile({ avatarUrl: fileData });
    } else {
      await get().updateProfile({ bannerUrl: fileData });
    }
  },

  updatePrivacy: async (privacyUpdates) => {
    const user = get().currentUser;
    if (!user) return;
    const updatedSettings = {
      ...user.settings,
      privacy: { ...user.settings.privacy, ...privacyUpdates }
    };
    set({ currentUser: { ...user, settings: updatedSettings } });
    try {
      await supabase.from('profiles').update({ settings: updatedSettings }).eq('id', user.id);
    } catch (e) {
      console.warn('Update privacy notice:', e);
    }
  },

  revokeSession: async (sessionId: string) => {
    const user = get().currentUser;
    if (!user) return;
    const activeSessions = user.settings.security.activeSessions.filter(s => s.id !== sessionId);
    const updatedSettings = {
      ...user.settings,
      security: { ...user.settings.security, activeSessions }
    };
    set({ currentUser: { ...user, settings: updatedSettings } });
  },

  revokeAllOtherSessions: async () => {
    const user = get().currentUser;
    if (!user) return;
    const activeSessions = user.settings.security.activeSessions.filter(s => s.isCurrent);
    const updatedSettings = {
      ...user.settings,
      security: { ...user.settings.security, activeSessions }
    };
    set({ currentUser: { ...user, settings: updatedSettings } });
  }
}));

// Helper: Handle URL Callbacks (Deep links, URL hashes, tokens)
async function handleUrlCallback(urlStr: string, set: any, get: any) {
  try {
    console.log('[Relay Auth DeepLink] Processing callback URL:', urlStr);

    let paramStr = '';
    if (urlStr.includes('#')) {
      paramStr = urlStr.substring(urlStr.indexOf('#') + 1);
    } else if (urlStr.includes('?')) {
      paramStr = urlStr.substring(urlStr.indexOf('?') + 1);
    }

    const params = new URLSearchParams(paramStr);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = params.get('code');
    const type = params.get('type');
    const errorCode = params.get('error') || params.get('error_code');

    if (errorCode) {
      const description = params.get('error_description') || 'Authentication link invalid or expired.';
      console.error('[Relay Auth DeepLink Error]', { errorCode, description });
      set({ error: description, isLoading: false });
      return;
    }

    if (accessToken && refreshToken) {
      console.log('[Relay Auth DeepLink] Setting session from deep link token...');
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) {
        console.error('[Relay Auth DeepLink setSession error]', { message: error.message, status: error.status });
        set({ error: formatAuthError(error), isLoading: false });
        return;
      }

      if (type === 'recovery') {
        set({
          status: 'ONBOARDING_REQUIRED',
          currentStep: 'NEW_PASSWORD',
          isPasswordResetFlow: true,
          isLoading: false
        });
        return;
      }

      if (data.user) {
        await resolveUserAuthState(data.user, set, get);
      }
    } else if (code) {
      console.log('[Relay Auth DeepLink] Exchanging auth code for session...');
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[Relay Auth DeepLink exchangeCodeForSession error]', { message: error.message, status: error.status });
        set({ error: formatAuthError(error), isLoading: false });
        return;
      }

      if (data.user) {
        await resolveUserAuthState(data.user, set, get);
      }
    }
  } catch (e: any) {
    console.warn('[Relay Auth DeepLink] Failed to parse URL callback:', e);
  }
}

// Helper: Centralized Auth State Resolver according to Relay Specs
async function resolveUserAuthState(sbUser: any, set: any, get: any, isSilent = false) {
  try {
    const currentState = get();
    const existingProfile = currentState.profile || currentState.currentUser;

    // 1. Is Email Verified?
    const isGoogle = sbUser.app_metadata?.provider === 'google' || sbUser.identities?.some((i: any) => i.provider === 'google');
    const isEmailConfirmed = !!(sbUser.email_confirmed_at || sbUser.confirmed_at || isGoogle);

    if (!isEmailConfirmed) {
      set({
        status: 'EMAIL_UNVERIFIED',
        currentStep: 'VERIFY_EMAIL',
        unverifiedEmail: sbUser.email,
        currentUser: null,
        profile: null,
        isLoadingProfile: false,
        isLoading: false
      });
      return;
    }

    // Check cached setup flag
    const cachedSetupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';

    // 2. If local setup is ALREADY completed OR if running silently during an active session
    if (cachedSetupDone || (isSilent && existingProfile && (currentState.status === 'READY' || currentState.status === 'AUTHENTICATED'))) {
      try {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', sbUser.id).maybeSingle();
        if (profileData) {
          const completeProfile = formatProfileRecord(profileData, sbUser);
          completeProfile.onboardingCompleted = true;
          completeProfile.onboarding_completed = true;

          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('relay_setup_completed', 'true');
            localStorage.setItem('relay_cached_user_profile', JSON.stringify(completeProfile));
          }

          set({
            status: 'READY',
            isAuthenticated: true,
            currentUser: completeProfile,
            profile: completeProfile,
            isLoadingProfile: false,
            isLoading: false
          });
        } else {
          // If profileData returned null/empty but setup was completed, maintain READY state
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('relay_setup_completed', 'true');
          }
          set({
            status: 'READY',
            isAuthenticated: true,
            isLoadingProfile: false,
            isLoading: false
          });
        }
      } catch (e) {
        console.warn('[Relay Auth Resolver] Profile revalidation error:', e);
        set({
          status: 'READY',
          isAuthenticated: true,
          isLoadingProfile: false,
          isLoading: false
        });
      }
      return;
    }

    // 3. No local setup flag yet: Fetch profile from backend to evaluate setup state
    let profileData: any = null;
    try {
      const profPromise = supabase.from('profiles').select('*').eq('id', sbUser.id).maybeSingle();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ isTimeout: true }), 3000));
      const res: any = await Promise.race([profPromise, timeoutPromise]);
      if (!res?.isTimeout && res?.data) {
        profileData = res.data;
      }
    } catch (e) {
      console.warn('[Relay Auth Resolver] Profile query error:', e);
    }

    const draft = get().signupDraft || {};
    const hasName = !!(profileData?.full_name || profileData?.display_name || draft.name || sbUser.user_metadata?.full_name || sbUser.user_metadata?.name);
    const hasCustomUsername = !!(profileData?.username && !profileData.username.startsWith('user_'));

    // Preserve active onboarding step if already customizing
    const existingStep = get().currentStep;
    const isAlreadyOnboarding = get().status === 'NEEDS_SETUP' || get().status === 'ONBOARDING_REQUIRED';

    if (isAlreadyOnboarding && (existingStep === 'USERNAME' || existingStep === 'APPEARANCE')) {
      set({
        status: 'NEEDS_SETUP',
        currentStep: existingStep,
        unverifiedEmail: null,
        isLoadingProfile: false,
        isLoading: false
      });
      return;
    }

    if (!hasName) {
      set({
        status: 'NEEDS_SETUP',
        currentStep: 'DISPLAY_NAME',
        unverifiedEmail: null,
        isLoadingProfile: false,
        isLoading: false,
        signupDraft: {
          ...draft,
          email: sbUser.email || '',
          name: draft.name || sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || '',
          isGoogleUser: isGoogle
        }
      });
      return;
    }

    if (!hasCustomUsername) {
      set({
        status: 'NEEDS_SETUP',
        currentStep: 'USERNAME',
        unverifiedEmail: null,
        isLoadingProfile: false,
        isLoading: false,
        signupDraft: {
          ...draft,
          email: sbUser.email || '',
          name: profileData?.full_name || profileData?.display_name || draft.name || sbUser.user_metadata?.full_name || '',
          isGoogleUser: isGoogle
        }
      });
      return;
    }

    // 4. Both display name and username exist -> Complete setup & transition to READY
    const completeProfile = formatProfileRecord(profileData || {}, sbUser);
    completeProfile.onboardingCompleted = true;
    completeProfile.onboarding_completed = true;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('relay_setup_completed', 'true');
      localStorage.setItem('relay_cached_user_profile', JSON.stringify(completeProfile));
    }

    set({
      status: 'READY',
      isAuthenticated: true,
      currentStep: 'CREATE_ACCOUNT',
      currentUser: completeProfile,
      profile: completeProfile,
      unverifiedEmail: null,
      isLoadingProfile: false,
      isLoading: false
    });
  } catch (err) {
    console.warn('[Relay Auth Resolver] Exception in resolveUserAuthState:', err);
    const current = get();
    const existingProfile = current.profile || current.currentUser;
    const setupDone = typeof localStorage !== 'undefined' && localStorage.getItem('relay_setup_completed') === 'true';

    if (setupDone || (existingProfile && (existingProfile.onboarding_completed || existingProfile.onboardingCompleted))) {
      set({
        status: 'READY',
        isAuthenticated: true,
        isLoadingProfile: false,
        isLoading: false
      });
    } else {
      set({
        status: 'UNAUTHENTICATED',
        currentStep: 'CREATE_ACCOUNT',
        currentUser: null,
        profile: null,
        isLoadingProfile: false,
        isLoading: false
      });
    }
  }
}
