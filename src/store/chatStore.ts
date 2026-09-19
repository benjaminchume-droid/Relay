/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Chat, Message, MessageAttachment } from '../types';
import { apiService } from '../services/apiService';
import { sendConversationMessage, getOrCreateDirectChat, getCurrentProfile } from '../services/messagingCore';
import { chatCache } from '../services/chatCache';
import { profileCache } from '../services/profileCache';
import { useAuthStore } from './authStore';
import { supabase } from '../lib/supabase/client';

const activeSendPayloads = new Set<string>();
const activeGroupCreates = new Set<string>();

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>;
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
  updateGroupInfo: (chatId: string, payload: { name?: string; description?: string; disappearingMessages?: 'off' | '24h' | '7d' | '30d' | '90d'; permissions?: any; inviteLink?: string }) => Promise<void>;
  addGroupMembers: (chatId: string, memberIds: string[]) => Promise<void>;
  removeGroupMember: (chatId: string, memberId: string) => Promise<void>;
  updateMemberRole: (chatId: string, memberId: string, role: 'admin' | 'member') => Promise<void>;
  setSearchQuery: (q: string) => void;
  clearError: () => void;
  acceptChatRequest: (chatId: string) => Promise<void>;
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
          const merged = chats.map((c) => {
            const existing = state.chats.find((sc) => sc.id === c.id);
            if (existing) {
              return { ...existing, ...c, name: c.name || existing.name, avatarUrl: c.avatarUrl || existing.avatarUrl, requestStatus: c.requestStatus || existing.requestStatus };
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
    const payloadKey = `${chatId}:${type}:${content || ''}:${attachments?.[0]?.url || ''}`;
    if (activeSendPayloads.has(payloadKey)) return;
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
    set((state) => ({ messages: { ...state.messages, [chatId]: [...(state.messages[chatId] || []), pendingMsg] } }));
    try {
      const { message, chat } = await sendConversationMessage(chatId, { content, type, attachments, replyToId: replyToId || replyingTo?.id, isForwarded });
      set((state) => {
        const realChatId = chat.id || message.chatId || chatId;
        const currentMsgs = state.messages[chatId] || state.messages[realChatId] || [];
        const confirmedMsg = { ...message, deliveryState: 'sent' as const };
        const updatedMsgs = currentMsgs.map((m) => m.id === tempId ? confirmedMsg : m);
        const existingChatIdx = state.chats.findIndex((c) => c.id === chatId || c.id === realChatId);
        let updatedChats: Chat[];
        if (existingChatIdx !== -1) {
          updatedChats = state.chats.map((c, i) => i === existingChatIdx ? {
            ...c, id: realChatId,
            name: chat.name && chat.name !== 'Conversation' ? chat.name : c.name,
            avatarUrl: chat.avatarUrl || c.avatarUrl,
            lastMessage: { text: message.content || 'Attachment', timestamp: message.timestamp, senderId: message.senderId, deliveryState: 'sent' },
            updatedAt: message.timestamp
          } : c);
        } else {
          updatedChats = [{
            id: realChatId,
            name: chat.name || 'Conversation',
            type: chat.type || 'direct',
            avatarUrl: chat.avatarUrl,
            participants: chat.participants || [currentUser?.id || 'me'],
            unreadCount: 0,
            lastMessage: { text: message.content || 'Attachment', timestamp: message.timestamp, senderId: message.senderId, deliveryState: 'sent' },
            updatedAt: message.timestamp
          }, ...state.chats];
        }
        const newMessagesMap = { ...state.messages };
        if (realChatId !== chatId) delete newMessagesMap[chatId];
        newMessagesMap[realChatId] = updatedMsgs;
        chatCache.setMessages(newMessagesMap);
        chatCache.setChats(updatedChats);
        return { messages: newMessagesMap, chats: updatedChats, activeChatId: state.activeChatId === chatId ? realChatId : state.activeChatId };
      });
    } catch (err: any) {
      set((state) => ({
        messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === tempId ? { ...m, deliveryState: 'failed' as const } : m) },
        error: err.message || 'Failed to send message'
      }));
    } finally {
      activeSendPayloads.delete(payloadKey);
    }
  },

  retryMessage: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    const targetMsg = (get().messages[chatId] || []).find((m) => m.id === messageId);
    if (!targetMsg) return;
    set((state) => ({ messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === messageId ? { ...m, deliveryState: 'sending' as const } : m) } }));
    try {
      const { message, chat } = await sendConversationMessage(chatId, {
        content: targetMsg.content, type: targetMsg.type, attachments: targetMsg.attachments,
        replyToId: targetMsg.replyToId, isForwarded: targetMsg.isForwarded, clientMessageId: messageId
      });
      set((state) => {
        const realChatId = chat.id || message.chatId || chatId;
        const msgs = state.messages[chatId] || state.messages[realChatId] || [];
        const updatedMsgs = msgs.map((m) => m.id === messageId ? { ...message, deliveryState: 'sent' as const } : m);
        const updatedChats = state.chats.map((c) => (c.id === chatId || c.id === realChatId) ? {
          ...c, id: realChatId,
          lastMessage: { text: message.content || 'Attachment', timestamp: message.timestamp, senderId: message.senderId, deliveryState: 'sent' as const },
          updatedAt: message.timestamp
        } : c);
        const newMessagesMap = { ...state.messages };
        if (realChatId !== chatId) delete newMessagesMap[chatId];
        newMessagesMap[realChatId] = updatedMsgs;
        chatCache.setMessages(newMessagesMap);
        chatCache.setChats(updatedChats);
        return { messages: newMessagesMap, chats: updatedChats, activeChatId: state.activeChatId === chatId ? realChatId : state.activeChatId };
      });
    } catch (err: any) {
      set((state) => ({
        messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === messageId ? { ...m, deliveryState: 'failed' as const } : m) },
        error: err.message || 'Retry failed'
      }));
    }
  },

  editMessage: async (messageId, content) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    try {
      await apiService.editMessage(messageId, content);
      set((state) => ({ messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === messageId ? { ...m, content, isEdited: true } : m) } }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteMessage: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    try {
      await apiService.deleteMessage(messageId);
      set((state) => ({ messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m) } }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  reactToMessage: async (messageId, emoji) => {
    try { await (apiService as any).reactToMessage?.(messageId, emoji); } catch (err: any) { set({ error: err.message }); }
  },

  togglePinMessage: async (messageId) => {
    try { await (apiService as any).togglePinMessage?.(messageId); } catch (err: any) { set({ error: err.message }); }
  },

  sendTypingSignal: async (chatId) => {
    try { await (apiService as any).sendTypingSignal?.(chatId); } catch {}
  },

  pollUpdates: async () => {
    await get().fetchChats();
    const active = get().activeChatId;
    if (active) await get().fetchMessages(active);
  },

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),
  setForwardingMessage: (msg) => set({ forwardingMessage: msg }),

  forwardMessageToChats: async (targetChatIds) => {
    const msg = get().forwardingMessage;
    if (!msg) return;
    for (const chatId of targetChatIds) {
      try {
        await sendConversationMessage(chatId, { content: msg.content, type: msg.type, attachments: msg.attachments, isForwarded: true });
      } catch (e) {
        console.warn('[forward] failed for', chatId, e);
      }
    }
    set({ forwardingMessage: null });
  },

  createDirectChat: async (targetUserId) => {
    set({ isLoading: true, error: null });
    try {
      const current = await getCurrentProfile();
      if (!current) throw new Error('Not authenticated');
      const chatId = await getOrCreateDirectChat(current.profileId, targetUserId);

      let peerName = '';
      let peerAvatar: string | undefined;
      const cached = profileCache.get(targetUserId);
      if (cached) {
        peerName = cached.name || (cached.username ? `@${cached.username}` : '');
        peerAvatar = cached.avatarUrl;
      }
      if (!peerName) {
        try {
          const { data: p } = await supabase
            .from('profiles')
            .select('display_name, full_name, username, avatar_url')
            .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`)
            .maybeSingle();
          if (p) {
            peerName = p.display_name || p.full_name || (p.username ? `@${p.username}` : '');
            peerAvatar = p.avatar_url || undefined;
          }
        } catch {}
      }
      if (!peerName) peerName = 'Chat';

      const me = useAuthStore.getState().currentUser;
      const isContact = !!me?.contacts?.includes(targetUserId);
      const chat: Chat = {
        id: chatId,
        name: peerName,
        type: 'direct',
        requestStatus: isContact ? 'accepted' : 'pending_outgoing',
        avatarUrl: peerAvatar,
        participants: [current.profileId, targetUserId],
        unreadCount: 0,
      };
      set((state) => ({
        chats: [chat, ...state.chats.filter((c) => c.id !== chat.id)],
        activeChatId: chat.id,
        isLoading: false,
        error: null,
      }));
      await get().fetchMessages(chat.id);
      get().fetchChats();
      return chat.id;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create direct conversation', isLoading: false });
      throw err;
    }
  },

  createGroupChat: async (name, description, participantIds) => {
    const lockKey = `group:${(name || '').trim().toLowerCase()}:${(participantIds || []).slice().sort().join(',')}`;
    if (activeGroupCreates.has(lockKey)) {
      throw new Error('Group creation already in progress');
    }
    activeGroupCreates.add(lockKey);
    set({ isLoading: true, error: null });
    try {
      const res = await apiService.createGroupChat(name, participantIds || []);
      const chat = res.chat;
      if (!chat?.id) throw new Error('Group created but no id returned');
      set((state) => ({
        chats: [{ ...chat, name: chat.name || name, description }, ...state.chats.filter((c) => c.id !== chat.id)],
        activeChatId: chat.id,
        isLoading: false,
        error: null,
      }));
      get().fetchChats();
      return chat.id;
    } catch (err: any) {
      set({ error: err?.message || 'Failed to create group', isLoading: false });
      throw err;
    } finally {
      setTimeout(() => activeGroupCreates.delete(lockKey), 1500);
    }
  },

  deleteChat: async (chatId) => {
    try {
      await apiService.deleteChat(chatId);
      set((state) => ({ chats: state.chats.filter((c) => c.id !== chatId), activeChatId: state.activeChatId === chatId ? null : state.activeChatId }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateGroupInfo: async (chatId, payload) => {
    try {
      await apiService.updateChatInfo(chatId, payload);
      set((state) => ({
        chats: state.chats.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            ...(payload.name !== undefined ? { name: payload.name } : {}),
            ...(payload.description !== undefined ? { description: payload.description } : {}),
            ...(payload.disappearingMessages !== undefined ? { disappearingMessages: payload.disappearingMessages } : {}),
            ...(payload.permissions !== undefined ? { permissions: payload.permissions } : {}),
            ...(payload.inviteLink !== undefined ? { inviteLink: payload.inviteLink } : {}),
          };
        }),
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  addGroupMembers: async (chatId, memberIds) => {
    try { await apiService.addGroupMembers(chatId, memberIds); } catch (err: any) { set({ error: err.message }); }
  },

  removeGroupMember: async (chatId, memberId) => {
    try { await apiService.removeGroupMember(chatId, memberId); } catch (err: any) { set({ error: err.message }); }
  },

  updateMemberRole: async () => {},
  setSearchQuery: (q) => set({ searchQuery: q }),
  clearError: () => set({ error: null }),

  acceptChatRequest: async (chatId) => {
    try {
      const { error } = await supabase.rpc('accept_chat_request', { p_conversation_id: chatId });
      if (error) throw error;
    } catch (e) {
      console.warn('[acceptChatRequest]', e);
      try {
        await (apiService as any).updateChatInfo?.(chatId, { request_status: 'accepted' });
      } catch {}
    }
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, requestStatus: 'accepted' as const } : c
      ),
    }));
  },
}));
