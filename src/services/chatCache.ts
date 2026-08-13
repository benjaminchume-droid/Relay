/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chat, Message } from '../types';

const CHATS_CACHE_KEY = 'relay_chats_cache_v1';
const MESSAGES_CACHE_KEY = 'relay_messages_cache_v1';

export const chatCache = {
  getChats(): Chat[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(CHATS_CACHE_KEY);
        if (stored) return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[chatCache] Error reading chats cache:', e);
    }
    return [];
  },

  setChats(chats: Chat[]) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CHATS_CACHE_KEY, JSON.stringify(chats));
      }
    } catch (e) {
      console.warn('[chatCache] Error writing chats cache:', e);
    }
  },

  getMessages(): Record<string, Message[]> {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(MESSAGES_CACHE_KEY);
        if (stored) return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[chatCache] Error reading messages cache:', e);
    }
    return {};
  },

  setMessages(messagesMap: Record<string, Message[]>) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MESSAGES_CACHE_KEY, JSON.stringify(messagesMap));
      }
    } catch (e) {
      console.warn('[chatCache] Error writing messages cache:', e);
    }
  },

  clear() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CHATS_CACHE_KEY);
        localStorage.removeItem(MESSAGES_CACHE_KEY);
      }
    } catch (_) {}
  }
};
