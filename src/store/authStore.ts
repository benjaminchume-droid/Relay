/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { UserProfile, UserPrivacySettings, UserSecuritySettings, UserSettings } from '../types';
import { apiService, setAuthToken, getAuthToken } from '../services/apiService';

interface SignupDraft {
  name: string;
  age?: number;
  dob?: string;
  country: string;
  username: string;
  password: string;
  avatarUrl?: string;
  bio?: string;
  statusMessage?: string;
  appearance?: any;
}

interface AuthState {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signupDraft: SignupDraft;

  initializeSession: () => Promise<void>;
  updateSignupDraft: (updates: Partial<SignupDraft>) => void;
  checkUsernameAvailable: (username: string) => Promise<{ valid: boolean; message: string }>;
  signupComplete: (customAppearance?: any) => Promise<void>;
  loginUser: (username: string, pass: string, rememberDevice?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  uploadAvatarOrBanner: (fileData: string, fileName?: string, isBanner?: boolean) => Promise<string>;
  updatePrivacy: (privacyUpdates: Partial<UserPrivacySettings>) => Promise<void>;
  updateAppearance: (appearanceUpdates: Partial<UserProfile['settings']['appearance']>) => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeAllOtherSessions: () => Promise<void>;
  toggleBlockUser: (targetUserId: string) => Promise<void>;
  clearError: () => void;
}

const DEFAULT_SIGNUP_DRAFT: SignupDraft = {
  name: '',
  age: 21,
  country: 'United States',
  username: '',
  password: '',
  avatarUrl: '',
  bio: 'Exploring Relay.',
  statusMessage: 'Available',
  appearance: undefined
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  signupDraft: DEFAULT_SIGNUP_DRAFT,

  initializeSession: async () => {
    const token = getAuthToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false, currentUser: null });
      return;
    }

    try {
      const { user } = await apiService.getCurrentUser();
      set({ currentUser: user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      console.warn("Session expired or invalid:", err.message);
      setAuthToken(null);
      set({ currentUser: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateSignupDraft: (updates) => {
    set((state) => ({
      signupDraft: { ...state.signupDraft, ...updates }
    }));
  },

  checkUsernameAvailable: async (username) => {
    try {
      return await apiService.checkUsername(username);
    } catch (err: any) {
      return { valid: false, message: err.message || "Username check failed" };
    }
  },

  signupComplete: async (customAppearance) => {
    const draft = get().signupDraft;
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await apiService.signup({
        username: draft.username,
        password: draft.password,
        name: draft.name,
        age: draft.age,
        country: draft.country,
        avatarUrl: draft.avatarUrl,
        bio: draft.bio,
        statusMessage: draft.statusMessage,
        appearance: customAppearance || draft.appearance
      });

      setAuthToken(token);
      set({
        currentUser: user,
        isAuthenticated: true,
        isLoading: false,
        signupDraft: DEFAULT_SIGNUP_DRAFT
      });
    } catch (err: any) {
      set({ error: err.message || "Signup failed", isLoading: false });
    }
  },

  loginUser: async (username, pass, rememberDevice) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await apiService.login(username, pass, rememberDevice);
      setAuthToken(token);
      set({ currentUser: user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || "Login failed. Check your username and password.", isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiService.logout();
    } catch (e) {
      // ignore
    }
    setAuthToken(null);
    set({ currentUser: null, isAuthenticated: false });
  },

  updateProfile: async (updates) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await apiService.updateProfile(updates);
      set({ currentUser: user, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || "Failed to update profile", isLoading: false });
    }
  },

  uploadAvatarOrBanner: async (fileData, fileName, isBanner) => {
    set({ isLoading: true, error: null });
    try {
      const { url } = await apiService.uploadFile(fileData, fileName);
      if (isBanner) {
        await get().updateProfile({ bannerUrl: url });
      } else {
        await get().updateProfile({ avatarUrl: url });
      }
      set({ isLoading: false });
      return url;
    } catch (err: any) {
      set({ error: err.message || "Failed to upload image", isLoading: false });
      return "";
    }
  },

  updatePrivacy: async (privacyUpdates) => {
    const user = get().currentUser;
    if (!user) return;
    try {
      const updatedPrivacy = { ...user.settings.privacy, ...privacyUpdates };
      const { settings } = await apiService.updateSettings({ privacy: updatedPrivacy });
      set({
        currentUser: {
          ...user,
          settings
        }
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateAppearance: async (appearanceUpdates) => {
    const user = get().currentUser;
    if (!user) return;
    try {
      const updatedApp = { ...user.settings.appearance, ...appearanceUpdates };
      const { settings } = await apiService.updateSettings({ appearance: updatedApp });
      set({
        currentUser: {
          ...user,
          settings
        }
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  revokeSession: async (sessionId) => {
    try {
      const { sessions } = await apiService.logoutDevice(sessionId);
      const user = get().currentUser;
      if (user) {
        set({
          currentUser: {
            ...user,
            settings: {
              ...user.settings,
              security: { ...user.settings.security, activeSessions: sessions }
            }
          }
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  revokeAllOtherSessions: async () => {
    try {
      const { sessions } = await apiService.logoutAllDevices();
      const user = get().currentUser;
      if (user) {
        set({
          currentUser: {
            ...user,
            settings: {
              ...user.settings,
              security: { ...user.settings.security, activeSessions: sessions }
            }
          }
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  toggleBlockUser: async (targetUserId) => {
    try {
      const { blockedUsers } = await apiService.toggleBlockUser(targetUserId);
      const user = get().currentUser;
      if (user) {
        set({
          currentUser: {
            ...user,
            blockedUsers
          }
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  clearError: () => set({ error: null })
}));
