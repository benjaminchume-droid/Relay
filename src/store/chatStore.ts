/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Chat, Message, MessageAttachment } from '../types';
import { apiService } from '../services/apiService';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>; // chatId -> messages
  activeTyping: Record<string, { userId: string; name: string }[]>;
  replyingToMessage: Message | null;
  forwardingMessage: Message | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  fetchChats: () => Promise<void>;
  setActiveChat: (chatId: string | null) => Promise<void>;
  fetchMessages: (chatId: string) => Promise<void>;
  sendMessage: (payload: {
    content?: string;
    type?: Message['type'];
    attachments?: MessageAttachment[];
    isForwarded?: boolean;
    replyToId?: string;
  }) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<void>;
  sendTypingSignal: (chatId: string) => Promise<void>;
  pollUpdates: () => Promise<void>;
  setReplyingToMessage: (msg: Message | null) => void;
  setForwardingMessage: (msg: Message | null) => void;
  forwardMessageToChats: (targetChatIds: string[]) => Promise<void>;
  createDirectChat: (targetUserId: string) => Promise<string>;
  createGroupChat: (name: string, description?: string, participantIds?: string[], isPrivate?: boolean, avatarUrl?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  updateGroupInfo: (chatId: string, payload: { name?: string; description?: string; disappearingMessages?: string; permissions?: any; inviteLink?: string }) => Promise<void>;
  addGroupMembers: (chatId: string, memberIds: string[]) => Promise<void>;
  removeGroupMember: (chatId: string, memberId: string) => Promise<void>;
  updateMemberRole: (chatId: string, memberId: string, role: 'admin' | 'member') => Promise<void>;
  setSearchQuery: (q: string) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: {},
  activeTyping: {},
  replyingToMessage: null,
  forwardingMessage: null,
  searchQuery: '',
  isLoading: false,
  error: null,

  fetchChats: async () => {
    try {
      const { chats } = await apiService.getChats();
      set({ chats });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setActiveChat: async (chatId) => {
    set({ activeChatId: chatId, replyingToMessage: null });
    if (chatId) {
      await get().fetchMessages(chatId);
      await apiService.markChatAsRead(chatId);
      get().fetchChats();
    }
  },

  fetchMessages: async (chatId) => {
    try {
      const { messages } = await apiService.getMessages(chatId);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: messages
        }
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  sendMessage: async ({ content, type = 'text', attachments, isForwarded, replyToId }) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    const replyingTo = get().replyingToMessage;
    set({ replyingToMessage: null });

    try {
      const { message, chat } = await apiService.sendMessage(chatId, {
        content,
        type,
        attachments,
        replyToId: replyToId || replyingTo?.id,
        isForwarded
      });

      set((state) => {
        const currentMsgs = state.messages[chatId] || [];
        const updatedChats = state.chats.map((c) => (c.id === chatId ? chat : c));
        return {
          messages: {
            ...state.messages,
            [chatId]: [...currentMsgs, message]
          },
          chats: updatedChats
        };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  editMessage: async (messageId, content) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      const { message } = await apiService.editMessage(chatId, messageId, content);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) => (m.id === messageId ? message : m))
        }
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteMessage: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      const { message } = await apiService.deleteMessage(chatId, messageId);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) => (m.id === messageId ? message : m))
        }
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  reactToMessage: async (messageId, emoji) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      const { reactions } = await apiService.reactToMessage(chatId, messageId, emoji);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          )
        }
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  togglePinMessage: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      const { pinnedMessageId } = await apiService.togglePinMessage(chatId, messageId);
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, pinnedMessageId } : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  sendTypingSignal: async (chatId) => {
    try {
      const { activeTyping } = await apiService.sendTypingSignal(chatId);
      set((state) => ({
        activeTyping: {
          ...state.activeTyping,
          [chatId]: activeTyping
        }
      }));
    } catch (err) {
      // ignore
    }
  },

  pollUpdates: async () => {
    const activeChatId = get().activeChatId;
    try {
      const { chats } = await apiService.getChats();
      set({ chats });

      if (activeChatId) {
        const { messages } = await apiService.getMessages(activeChatId);
        const { activeTyping } = await apiService.getTypingState(activeChatId);
        set((state) => ({
          messages: {
            ...state.messages,
            [activeChatId]: messages
          },
          activeTyping: {
            ...state.activeTyping,
            [activeChatId]: activeTyping
          }
        }));
      }
    } catch (err) {
      // background polling
    }
  },

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),
  setForwardingMessage: (msg) => set({ forwardingMessage: msg }),

  forwardMessageToChats: async (targetChatIds) => {
    const msg = get().forwardingMessage;
    if (!msg) return;

    for (const chatId of targetChatIds) {
      try {
        await apiService.sendMessage(chatId, {
          content: msg.content,
          type: msg.type,
          attachments: msg.attachments,
          isForwarded: true
        });
      } catch (err) {
        // ignore individual chat forward error
      }
    }
    set({ forwardingMessage: null });
  },

  createDirectChat: async (targetUserId) => {
    set({ isLoading: true });
    try {
      const { chat } = await apiService.createDirectChat(targetUserId);
      set((state) => ({
        chats: [chat, ...state.chats.filter((c) => c.id !== chat.id)],
        activeChatId: chat.id,
        isLoading: false
      }));
      await get().fetchMessages(chat.id);
      return chat.id;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return '';
    }
  },

  createGroupChat: async (name, description, participantIds, isPrivate, avatarUrl) => {
    set({ isLoading: true });
    try {
      const { chat } = await apiService.createGroupChat(name, description, participantIds, isPrivate, avatarUrl);
      set((state) => ({
        chats: [chat, ...state.chats],
        activeChatId: chat.id,
        isLoading: false
      }));
      await get().fetchMessages(chat.id);
      return chat.id;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return '';
    }
  },

  deleteChat: async (chatId) => {
    try {
      await apiService.deleteChat(chatId);
      set((state) => ({
        chats: state.chats.filter((c) => c.id !== chatId),
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateGroupInfo: async (chatId, payload) => {
    try {
      const { chat } = await apiService.updateChatInfo(chatId, payload);
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...chat } : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  addGroupMembers: async (chatId, memberIds) => {
    try {
      const { chat } = await apiService.addGroupMembers(chatId, memberIds);
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...chat } : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  removeGroupMember: async (chatId, memberId) => {
    try {
      const { chat } = await apiService.removeGroupMember(chatId, memberId);
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...chat } : c))
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateMemberRole: async (chatId, memberId, role) => {
    set((state) => ({
      chats: state.chats.map((c) => {
        if (c.id === chatId) {
          return {
            ...c,
            roles: {
              ...(c.roles || {}),
              [memberId]: role
            }
          };
        }
        return c;
      })
    }));
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  clearError: () => set({ error: null })
}));
