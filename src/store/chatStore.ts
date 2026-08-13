/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Chat, Message, MessageAttachment } from '../types';
import { apiService } from '../services/apiService';
import { chatCache } from '../services/chatCache';
import { useAuthStore } from './authStore';

// In-memory idempotency tracking to prevent duplicate sends from rapid taps
const activeSendPayloads = new Set<string>();

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
  retryMessage: (messageId: string) => Promise<void>;
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
  chats: chatCache.getChats(),
  activeChatId: null,
  messages: chatCache.getMessages(),
  activeTyping: {},
  replyingToMessage: null,
  forwardingMessage: null,
  searchQuery: '',
  isLoading: false,
  error: null,

  fetchChats: async () => {
    try {
      const { chats } = await apiService.getChats();
      if (chats) {
        set((state) => {
          // Merge with existing cached chats
          const merged = chats.map((c) => {
            const existing = state.chats.find((sc) => sc.id === c.id);
            if (existing) {
              return {
                ...existing,
                ...c,
                name: c.name && c.name !== 'Chat' ? c.name : existing.name,
                avatarUrl: c.avatarUrl || existing.avatarUrl
              };
            }
            return c;
          });
          chatCache.setChats(merged);
          return { chats: merged };
        });
      }
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
      const { messages: serverMsgs } = await apiService.getMessages(chatId);
      set((state) => {
        const existing = state.messages[chatId] || [];
        const inFlightOrFailed = existing.filter((m) => m.deliveryState === 'sending' || m.deliveryState === 'failed' || m.id.startsWith('temp_'));
        
        const combined = [...serverMsgs];
        for (const localMsg of inFlightOrFailed) {
          if (!combined.some((m) => m.id === localMsg.id || (m.content === localMsg.content && m.timestamp === localMsg.timestamp))) {
            combined.push(localMsg);
          }
        }

        const newMap = { ...state.messages, [chatId]: combined };
        chatCache.setMessages(newMap);
        return { messages: newMap };
      });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  sendMessage: async ({ content, type = 'text', attachments, isForwarded, replyToId }) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    // Idempotency key based on chat, content and type to prevent rapid double-clicks
    const payloadKey = `${chatId}:${type}:${content || ''}:${attachments?.[0]?.url || ''}`;
    if (activeSendPayloads.has(payloadKey)) {
      console.warn('[chatStore] Duplicate send prevented by idempotency lock:', payloadKey);
      return;
    }
    activeSendPayloads.add(payloadKey);

    const replyingTo = get().replyingToMessage;
    set({ replyingToMessage: null });

    const currentUser = useAuthStore.getState().currentUser;
    const tempId = `temp_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const pendingMsg: Message = {
      id: tempId,
      chatId,
      senderId: currentUser?.id || 'me',
      senderName: currentUser?.name || 'Me',
      senderAvatar: currentUser?.avatarUrl,
      type: type || 'text',
      content: content || '',
      attachments,
      timestamp: new Date().toISOString(),
      deliveryState: 'sending',
      replyToId: replyToId || replyingTo?.id,
      replyToMessage: replyingTo ? {
        id: replyingTo.id,
        senderName: replyingTo.senderName,
        content: replyingTo.content,
        type: replyingTo.type,
        attachments: replyingTo.attachments
      } : undefined,
      isForwarded
    };

    // 1. Immediately insert pending message into UI state
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), pendingMsg]
      }
    }));

    try {
      const { message, chat } = await apiService.sendMessage(chatId, {
        content,
        type,
        attachments,
        replyToId: replyToId || replyingTo?.id,
        isForwarded
      });

      // 2. Replace pending message with server confirmed message
      set((state) => {
        const realChatId = chat.id || message.chatId || chatId;
        const currentMsgs = state.messages[chatId] || state.messages[realChatId] || [];
        const confirmedMsg = { ...message, deliveryState: 'sent' as const };
        const updatedMsgs = currentMsgs.map((m) =>
          m.id === tempId ? confirmedMsg : m
        );
        
        const existingChatIdx = state.chats.findIndex((c) => c.id === chatId || c.id === realChatId);
        let updatedChats: Chat[];
        
        if (existingChatIdx !== -1) {
          updatedChats = state.chats.map((c, i) =>
            i === existingChatIdx
              ? {
                  ...c,
                  id: realChatId,
                  lastMessage: {
                    text: message.content || (message.type === 'image' ? '📷 Photo' : message.type === 'voice' ? '🎤 Voice Note' : 'Attachment'),
                    timestamp: message.timestamp,
                    senderId: message.senderId,
                    deliveryState: 'sent'
                  },
                  updatedAt: message.timestamp
                }
              : c
          );
        } else {
          // New conversation: prepend immediately to Chat List
          const newChat: Chat = {
            id: realChatId,
            name: chat.name || 'Conversation',
            type: chat.type || 'direct',
            avatarUrl: chat.avatarUrl,
            participants: chat.participants || [currentUser?.id || 'me'],
            unreadCount: 0,
            lastMessage: {
              text: message.content || (message.type === 'image' ? '📷 Photo' : message.type === 'voice' ? '🎤 Voice Note' : 'Attachment'),
              timestamp: message.timestamp,
              senderId: message.senderId,
              deliveryState: 'sent'
            },
            updatedAt: message.timestamp
          };
          updatedChats = [newChat, ...state.chats];
        }

        const newMessagesMap = { ...state.messages };
        if (realChatId !== chatId) {
          delete newMessagesMap[chatId];
        }
        newMessagesMap[realChatId] = updatedMsgs;

        return {
          messages: newMessagesMap,
          chats: updatedChats,
          activeChatId: state.activeChatId === chatId ? realChatId : state.activeChatId
        };
      });
    } catch (err: any) {
      console.error('[chatStore] Send message error:', err);
      // 3. Mark message as failed so user can tap to retry
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) =>
            m.id === tempId ? { ...m, deliveryState: 'failed' as const } : m
          )
        },
        error: err.message || 'Failed to send message'
      }));
    } finally {
      activeSendPayloads.delete(payloadKey);
    }
  },

  retryMessage: async (messageId: string) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    const currentMsgs = get().messages[chatId] || [];
    const targetMsg = currentMsgs.find((m) => m.id === messageId);
    if (!targetMsg) return;

    // Set state back to sending
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map((m) =>
          m.id === messageId ? { ...m, deliveryState: 'sending' as const } : m
        )
      }
    }));

    try {
      const { message, chat } = await apiService.sendMessage(chatId, {
        content: targetMsg.content,
        type: targetMsg.type,
        attachments: targetMsg.attachments,
        replyToId: targetMsg.replyToId,
        isForwarded: targetMsg.isForwarded,
        clientMessageId: messageId
      });

      set((state) => {
        const realChatId = chat.id || message.chatId || chatId;
        const msgs = state.messages[chatId] || state.messages[realChatId] || [];
        const confirmedMsg = { ...message, deliveryState: 'sent' as const };
        const updatedMsgs = msgs.map((m) => (m.id === messageId ? confirmedMsg : m));

        const updatedChats = state.chats.map((c) => {
          if (c.id === chatId || c.id === realChatId) {
            return {
              ...c,
              id: realChatId,
              lastMessage: {
                text: message.content || (message.type === 'image' ? '📷 Photo' : message.type === 'voice' ? '🎤 Voice Note' : 'Attachment'),
                timestamp: message.timestamp,
                senderId: message.senderId,
                deliveryState: 'sent' as const
              },
              updatedAt: message.timestamp
            };
          }
          return c;
        });

        const newMessagesMap = { ...state.messages };
        if (realChatId !== chatId) {
          delete newMessagesMap[chatId];
        }
        newMessagesMap[realChatId] = updatedMsgs;

        chatCache.setMessages(newMessagesMap);
        chatCache.setChats(updatedChats);

        return {
          messages: newMessagesMap,
          chats: updatedChats,
          activeChatId: state.activeChatId === chatId ? realChatId : state.activeChatId
        };
      });
    } catch (err: any) {
      console.error('[retryMessage] Resend failed:', err);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) =>
            m.id === messageId ? { ...m, deliveryState: 'failed' as const } : m
          )
        },
        error: err.message || 'Failed to resend message'
      }));
    }
  },

  editMessage: async (messageId, content) => {
    const chatId = get().activeChatId;
    if (!chatId) return;

    try {
      await apiService.editMessage(chatId, messageId, content);
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) =>
            m.id === messageId ? { ...m, content, isEdited: true } : m
          )
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
      if (chats && chats.length > 0) {
        set((state) => {
          // Preserve local lastMessage if remote is empty or older
          const merged = chats.map((c) => {
            const existing = state.chats.find((sc) => sc.id === c.id);
            if (existing && existing.lastMessage && (!c.lastMessage || new Date(existing.lastMessage.timestamp) > new Date(c.lastMessage.timestamp))) {
              return { ...c, lastMessage: existing.lastMessage };
            }
            return c;
          });
          return { chats: merged };
        });
      }

      if (activeChatId) {
        const { messages: serverMsgs } = await apiService.getMessages(activeChatId);
        const { activeTyping } = await apiService.getTypingState(activeChatId);

        if (serverMsgs && serverMsgs.length > 0) {
          set((state) => {
            const existing = state.messages[activeChatId] || [];
            // Keep sending/failed messages that are in flight or retryable
            const inFlightOrFailed = existing.filter((m) => m.deliveryState === 'sending' || m.deliveryState === 'failed' || m.id.startsWith('temp_'));
            
            const combined = [...serverMsgs];
            for (const temp of inFlightOrFailed) {
              if (!combined.some((m) => m.content === temp.content || m.id === temp.id)) {
                combined.push(temp);
              }
            }

            const newMap = {
              ...state.messages,
              [activeChatId]: combined
            };
            chatCache.setMessages(newMap);

            return {
              messages: newMap,
              activeTyping: {
                ...state.activeTyping,
                [activeChatId]: activeTyping
              }
            };
          });
        }
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
      const res = await apiService.createDirectChat(targetUserId);
      const chat = res.chat || (res as any).conversation;
      if (!chat || !chat.id) {
        throw new Error("Invalid conversation object returned from server");
      }
      set((state) => ({
        chats: [chat, ...state.chats.filter((c) => c.id !== chat.id)],
        activeChatId: chat.id,
        isLoading: false,
        error: null,
      }));
      await get().fetchMessages(chat.id);
      return chat.id;
    } catch (err: any) {
      console.error("[chatStore] createDirectChat error:", err);
      set({ error: err.message || "Failed to create direct conversation", isLoading: false });
      throw err;
    }
  },

  createGroupChat: async (name, description, participantIds, isPrivate, avatarUrl) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiService.createGroupChat(name, description, participantIds, isPrivate, avatarUrl);
      const chat = res.chat;

      if (!chat || !chat.id) {
        throw new Error("Failed to create group chat: invalid payload returned");
      }

      set((state) => ({
        chats: [chat, ...state.chats.filter((c) => c.id !== chat.id)],
        activeChatId: chat.id,
        isLoading: false,
        error: null
      }));
      await get().fetchMessages(chat.id);
      return chat.id;
    } catch (err: any) {
      console.error("[chatStore] createGroupChat error:", err);
      set({ error: err.message || "Failed to create group. Please try again.", isLoading: false });
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
