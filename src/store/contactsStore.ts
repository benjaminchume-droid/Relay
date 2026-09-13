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
let activeSearchController: AbortController | null = null;

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
      if (activeSearchController) {
        activeSearchController.abort();
        activeSearchController = null;
      }
      set({ searchResults: [], searchStatus: 'idle', searchError: null, lastSearchQuery: '', isLoading: false });
      return;
    }

    if (activeSearchController) {
      activeSearchController.abort();
    }
    const controller = new AbortController();
    activeSearchController = controller;

    const seq = ++currentSearchSeq;
    set({ isLoading: true, searchStatus: 'loading', searchError: null, lastSearchQuery: cleanQuery });

    try {
      // searchUsers returns UserProfile[] (signal not supported by API)
      const res = await apiService.searchUsers(cleanQuery);
      const users = Array.isArray(res) ? res : (res as any)?.users || [];

      if (seq === currentSearchSeq && !controller.signal.aborted) {
        if (users.length > 0) {
          set({ searchResults: users, searchStatus: 'success', searchError: null, isLoading: false });
        } else {
          set({ searchResults: [], searchStatus: 'empty', searchError: null, isLoading: false });
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (seq === currentSearchSeq) {
        set({
          searchResults: [],
          searchStatus: 'error',
          searchError: err.message || "We couldn't complete the search. Try again.",
          isLoading: false
        });
      }
    } finally {
      if (activeSearchController === controller) {
        activeSearchController = null;
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
      await apiService.submitReport(payload);
      set({ reportSuccessMessage: 'Report submitted. Thank you.' });
      setTimeout(() => {
        get().closeReportModal();
      }, 1800);
    } catch (err: any) {
      set({ reportSuccessMessage: err.message || 'Failed to submit report' });
    }
  }
}));
