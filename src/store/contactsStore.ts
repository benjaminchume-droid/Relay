/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { UserProfile, ReportPayload } from '../types';
import { apiService } from '../services/apiService';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface ContactsState {
  searchResults: UserProfile[];
  searchStatus: SearchStatus;
  searchError: string | null;
  lastSearchQuery: string;
  reportModalUser: UserProfile | null;
  reportSuccessMessage: string | null;
  isLoading: boolean;

  searchUsers: (query: string) => Promise<void>;
  resetSearch: () => void;
  openReportModal: (user: UserProfile) => void;
  closeReportModal: () => void;
  submitReport: (payload: ReportPayload) => Promise<void>;
}

let currentSearchSeq = 0;

export const useContactsStore = create<ContactsState>((set, get) => ({
  searchResults: [],
  searchStatus: 'idle',
  searchError: null,
  lastSearchQuery: '',
  reportModalUser: null,
  reportSuccessMessage: null,
  isLoading: false,

  searchUsers: async (rawQuery: string) => {
    const cleanQuery = rawQuery.trim().replace(/^@+/, '').trim();
    if (!cleanQuery) {
      set({ searchResults: [], searchStatus: 'idle', searchError: null, lastSearchQuery: '', isLoading: false });
      return;
    }

    const seq = ++currentSearchSeq;
    set({ isLoading: true, searchStatus: 'loading', searchError: null, lastSearchQuery: cleanQuery });
    console.log("[Relay Search UI] Triggering user search for:", cleanQuery);

    try {
      const res = await apiService.searchUsers(cleanQuery);
      const users = res?.users || [];
      if (seq === currentSearchSeq) {
        if (users.length > 0) {
          console.log("[Relay Search UI] Search success, found:", users.length);
          set({ searchResults: users, searchStatus: 'success', searchError: null, isLoading: false });
        } else {
          console.log("[Relay Search UI] Search returned 0 users");
          set({ searchResults: [], searchStatus: 'empty', searchError: null, isLoading: false });
        }
      }
    } catch (err: any) {
      if (seq === currentSearchSeq) {
        console.error("[Relay Search UI] Search API error:", err);
        set({
          searchResults: [],
          searchStatus: 'error',
          searchError: err.message || "We couldn't complete the search. Try again.",
          isLoading: false
        });
      }
    }
  },

  resetSearch: () => {
    currentSearchSeq++;
    set({
      searchResults: [],
      searchStatus: 'idle',
      searchError: null,
      lastSearchQuery: '',
      isLoading: false
    });
  },

  openReportModal: (user) => set({ reportModalUser: user, reportSuccessMessage: null }),
  closeReportModal: () => set({ reportModalUser: null, reportSuccessMessage: null }),

  submitReport: async (payload) => {
    try {
      const { message } = await apiService.submitReport(payload);
      set({ reportSuccessMessage: message });
      setTimeout(() => {
        get().closeReportModal();
      }, 1800);
    } catch (err: any) {
      set({ reportSuccessMessage: err.message || 'Failed to submit report' });
    }
  }
}));
