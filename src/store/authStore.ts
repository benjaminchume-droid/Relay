/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth store — session bootstrap, profile load, signup/login helpers.
 * formatProfileRecord / createDefaultSettings live in src/lib/profileFormat.ts
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { UserProfile } from '../types';
export { createDefaultSettings, formatProfileRecord } from '../lib/profileFormat';
import { formatProfileRecord, createDefaultSettings } from '../lib/profileFormat';

export type AuthStatus = 'BOOTSTRAPPING' | 'UNAUTHENTICATED' | 'AUTHENTICATED' | 'READY' | 'ERROR';
export type AuthStep =
  | 'CREATE_ACCOUNT'
  | 'VERIFY_EMAIL'
  | 'LOGIN'
  | 'APPEARANCE'
  | 'PROFILE_SETUP'
  | 'DONE';

interface SignupDraft {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

const DEFAULT_SIGNUP_DRAFT: SignupDraft = {
  email: '',
  password: '',
  displayName: '',
  username: '',
};

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

async function loadProfileForUser(sbUser: any): Promise<UserProfile | null> {
  if (!sbUser?.id) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .or(`id.eq.${sbUser.id},auth_user_id.eq.${sbUser.id}`)
    .maybeSingle();
  if (!data) return formatProfileRecord({ id: sbUser.id, email: sbUser.email }, sbUser);
  return formatProfileRecord(data, sbUser);
}

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
    set({ isLoading: true, isLoadingProfile: true });
    try {
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
      const onboarded = !!(profile as any)?.username && profile?.name;
      set({
        status: onboarded ? 'READY' : 'AUTHENTICATED',
        isAuthenticated: true,
        currentUser: profile,
        profile,
        currentStep: onboarded ? 'DONE' : 'PROFILE_SETUP',
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

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await loadProfileForUser(data.user);
      set({
        status: 'READY',
        isAuthenticated: true,
        currentUser: profile,
        profile,
        isLoading: false,
        currentStep: 'DONE',
      });
    } catch (e: any) {
      set({ error: e?.message || 'Login failed', isLoading: false });
      throw e;
    }
  },

  signup: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: displayName || '' } },
      });
      if (error) throw error;
      if (data.user && !data.session) {
        set({
          status: 'AUTHENTICATED',
          unverifiedEmail: email,
          currentStep: 'VERIFY_EMAIL',
          isLoading: false,
        });
        return;
      }
      const profile = await loadProfileForUser(data.user);
      set({
        status: 'AUTHENTICATED',
        isAuthenticated: true,
        currentUser: profile,
        profile,
        currentStep: 'PROFILE_SETUP',
        isLoading: false,
      });
    } catch (e: any) {
      set({ error: e?.message || 'Signup failed', isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try { await supabase.auth.signOut(); } catch {}
    set({
      status: 'UNAUTHENTICATED',
      isAuthenticated: false,
      currentUser: null,
      profile: null,
      currentStep: 'LOGIN',
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
    } catch {}
  },

  revokeSession: async () => {},
  revokeAllOtherSessions: async () => {},
  deleteAccount: async () => {
    await get().logout();
  },
  resendVerification: async () => {
    const email = get().unverifiedEmail || get().signupDraft.email;
    if (!email) return;
    await supabase.auth.resend({ type: 'signup', email });
  },
}));

// Auto-bootstrap once in browser
if (typeof window !== 'undefined') {
  setTimeout(() => {
    try { useAuthStore.getState().initializeSession(); } catch {}
  }, 0);
}
