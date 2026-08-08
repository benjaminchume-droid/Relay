/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { UserProfile, ReportPayload } from '../types';
import { apiService } from '../services/apiService';

interface ContactsState {
  searchResults: UserProfile[];
  reportModalUser: UserProfile | null;
  reportSuccessMessage: string | null;
  isLoading: boolean;

  searchUsers: (query: string) => Promise<void>;
  openReportModal: (user: UserProfile) => void;
  closeReportModal: () => void;
  submitReport: (payload: ReportPayload) => Promise<void>;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  searchResults: [],
  reportModalUser: null,
  reportSuccessMessage: null,
  isLoading: false,

  searchUsers: async (query) => {
    set({ isLoading: true });
    try {
      const { users } = await apiService.searchUsers(query || '');
      set({ searchResults: users, isLoading: false });
    } catch (err) {
      set({ searchResults: [], isLoading: false });
    }
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
