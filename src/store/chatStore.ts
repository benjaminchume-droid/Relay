/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Chat, Message, MessageAttachment } from '../types';
import { apiService } from '../services/apiService';
import { sendConversationMessage, getOrCreateDirectChat, getCurrentProfile, editMessageEncrypted } from '../services/messagingCore';
import { chatCache } from '../services/chatCache';
import { profileCache } from '../services/profileCache';
import { useAuthStore } from './authStore';
import { supabase } from '../lib/supabase/client';
import { decryptMessages, scheduleMediaDecrypt, looksLikeEnvelope, CIPHER_PLACEHOLDER } from '../services/messageFetch';
import { isEnvelope } from '../services/crypto/cryptoService';
import { relayRealtimeService } from '../services/realtime/RelayRealtimeService';

function previewOf(msg: Message): string {
  if ((msg as any).isDeleted) return 'Message deleted';
  if (msg.type === 'image') return 'Photo';
  if (msg.type === 'voice') return 'Voice note';
  if (msg.type === 'video') return 'Video';
  if (msg.attachments?.length) return 'Attachment';
  return msg.content || 'Message';
}

const activeSendPayloads = new Set<string>();
const activeGroupCreates = new Set<string>();
let globalStreamStarted = false;

/** Boot-time cache hygiene: a message cached by an older build may hold raw
 *  wire ciphertext — it must never re-enter the store, let alone the UI. */
function sanitizeCachedMessages(map: Record<string, Message[]>): Record<string, Message[]> {
  let dirty = false;
  const out: Record<string, Message[]> = {};
  for (const [chatId, msgs] of Object.entries(map || {})) {
    out[chatId] = (msgs || []).map((m) => {
      if (!looksLikeEnvelope(m.content)) return m;
      dirty = true;
      return { ...m, content: CIPHER_PLACEHOLDER, _encrypted: true } as Message;
    });
  }
  if (dirty) console.warn('[chatCache] sanitized ciphertext found in cached messages');
  return out;
}

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
  /** Latest pinned message per chat (banner at the top of the chat screen). */
  pinnedByChat: Record<string, { messageId: string; content: string; senderName: string } | null>;

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
  fetchChatExtras: (chatId: string) => Promise<void>;
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
  startGlobalMessageStream: () => void;
  receiveIncomingMessage: (row: any) => Promise<void>;
  applyMessageDeliveryUpdate: (row: any) => void;
  removeMessageLocally: (messageId: string) => void;
  redecryptChat: (chatId: string) => Promise<void>;
}

// per-chat "read up to" watermark (epoch ms) — cleared badges can't be
// resurrected by stale server unread counts racing markChatAsRead
const WM_KEY = 'relay_read_watermarks_v1';
function readWatermarks(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(WM_KEY) || '{}'); } catch { return {}; }
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: (function () {
    const chats = chatCache.getChats();
    // cached previews from older builds can carry raw wire ciphertext
    return chats.map((c) => {
      const t = (c as any).lastMessage?.text;
      if (typeof t === 'string' && looksLikeEnvelope(t)) {
        return { ...c, lastMessage: { ...(c as any).lastMessage, text: CIPHER_PLACEHOLDER } };
      }
      return c;
    });
  })(),
  activeChatId: null,
  messages: sanitizeCachedMessages(chatCache.getMessages()),
  activeTyping: {},
  replyingToMessage: null,
  forwardingMessage: null,
  searchQuery: '',
  isLoading: false,
  error: null,
  pinnedByChat: {} as Record<string, { messageId: string; content: string; senderName: string } | null>,

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
          // the open conversation can never be unread — server races can't resurrect the badge.
          // read watermark: chats whose latest message is at/below our last read
          // moment can never show a stale badge after markChatAsRead races.
          const active = state.activeChatId;
          const wm = readWatermarks();
          const final = merged.map((c) => {
            if (c.id === active) return { ...c, unreadCount: 0 };
            const mark = wm[c.id];
            if (mark && (c.unreadCount || 0) > 0) {
              const updated = (c as any).updatedAt || (c as any).lastMessage?.timestamp;
              if (updated && new Date(updated).getTime() <= mark) return { ...c, unreadCount: 0 };
            }
            return c;
          });
          chatCache.setChats(final);
          return { chats: final };
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  setActiveChat: async (chatId) => {
    set({ activeChatId: chatId, replyingToMessage: null });
    if (chatId) {
      // optimistic clear — badge must vanish the instant the chat opens
      readWatermarks()[chatId] = Date.now();
      try { localStorage.setItem(WM_KEY, JSON.stringify(readWatermarks())); } catch { /* optional */ }
      set((state) => {
        if (!state.chats.some((c) => c.id === chatId && (c.unreadCount || 0) > 0)) return {};
        const chats = state.chats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c));
        chatCache.setChats(chats);
        return { chats };
      });
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
        // chronological order is the chat's contract — locally-queued/failed
        // messages must slot in by timestamp, not after the server page
        combined.sort((a, b) => {
          const ta = new Date((a as any).timestamp || (a as any).createdAt || 0).getTime() || 0;
          const tb = new Date((b as any).timestamp || (b as any).createdAt || 0).getTime() || 0;
          return ta - tb;
        });
        const newMap = { ...state.messages, [chatId]: combined };
        chatCache.setMessages(newMap);
        return { messages: newMap };
      });
      // Anything the fetch pipeline could not decrypt gets a silent background
      // retry — sessions/prekeys often arrive a beat after the rows do.
      const stillCiphered = (get().messages[chatId] || []).some((m) => looksLikeEnvelope(m.content));
      if (stillCiphered) void get().redecryptChat(chatId);
      // reactions + pinned banner ride along with every fetch
      void get().fetchChatExtras(chatId);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  /** Reactions + pinned banner for one conversation. */
  fetchChatExtras: async (chatId) => {
    try {
      const msgs = get().messages[chatId] || [];
      const ids = msgs.map((m) => String(m.id)).filter((id) => id && !id.startsWith('temp_'));
      const [reactions, pinned] = await Promise.all([
        apiService.fetchMessageReactions(ids),
        apiService.fetchPinnedMessage(chatId),
      ]);
      if (reactions.length) {
        set((state) => {
          const byMsg = new Map<string, Array<{ userId: string; userName: string; emoji: string }>>();
          for (const r of reactions) {
            const list = byMsg.get(r.messageId) || [];
            list.push({ userId: r.profileId, userName: r.name, emoji: r.reaction });
            byMsg.set(r.messageId, list);
          }
          const next = (state.messages[chatId] || []).map((m) => {
            const rx = byMsg.get(String(m.id));
            if (!rx) return m;
            const same = JSON.stringify(m.reactions || []) === JSON.stringify(rx);
            return same ? m : { ...m, reactions: rx };
          });
          const messages = { ...state.messages, [chatId]: next };
          chatCache.setMessages(messages);
          return { messages };
        });
      }
      set((state) => ({ pinnedByChat: { ...state.pinnedByChat, [chatId]: pinned ? { messageId: pinned.messageId, content: pinned.content, senderName: pinned.senderName } : null } }));
    } catch { /* non-fatal */ }
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
      // re-encrypt the new text with the conversation session — the wire stays
      // ciphertext-only, receivers decrypt it from the UPDATE/refetch pipeline
      await editMessageEncrypted(chatId, messageId, content);
      set((state) => ({ messages: { ...state.messages, [chatId]: (state.messages[chatId] || []).map((m) => m.id === messageId ? { ...m, content, isEdited: true } : m) } }));
      chatCache.setMessages({ ...get().messages });
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
    const chatId = get().activeChatId;
    const myId = useAuthStore.getState().profile?.id || 'me';
    // optimistic toggle — the chip appears/disappears instantly
    let optimisticRemoved = false;
    if (chatId) {
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: (state.messages[chatId] || []).map((m) => {
            if (String(m.id) !== String(messageId)) return m;
            const rx = [...(m.reactions || [])];
            const ownIdx = rx.findIndex((r) => r.userId === myId);
            if (ownIdx !== -1) { optimisticRemoved = true; rx.splice(ownIdx, 1); }
            else rx.push({ userId: myId, userName: 'You', emoji });
            return { ...m, reactions: rx };
          }),
        },
      }));
      const messages = get().messages;
      chatCache.setMessages(messages);
    }
    try {
      const res = await apiService.reactToMessage(messageId, emoji);
      if (res?.removed !== optimisticRemoved && chatId) void get().fetchChatExtras(chatId);
    } catch (err: any) {
      if (chatId) void get().fetchChatExtras(chatId);
      set({ error: err.message });
    }
  },

  togglePinMessage: async (messageId) => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    try {
      await apiService.togglePinMessage(chatId, messageId);
      void get().fetchChatExtras(chatId);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  sendTypingSignal: async (chatId) => {
    try {
      // Throttle: one broadcast per 2s window per chat (was firing every keystroke)
      const now = Date.now();
      const last = (get() as any)._lastTypingSent?.[chatId] || 0;
      if (now - last < 2000) return;
      (set as any)({ _lastTypingSent: { ...((get() as any)._lastTypingSent || {}), [chatId]: now } });
      relayRealtimeService.broadcastManager.sendTypingSignal(chatId, true);
      setTimeout(() => relayRealtimeService.broadcastManager.sendTypingSignal(chatId, false), 2500);
      void (async () => {
        const myId = useAuthStore.getState().profile?.id;
        if (!myId) return;
        await supabase.from('typing_indicators').upsert({
          conversation_id: chatId,
          user_id: myId,
          is_typing: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id,user_id' });
        setTimeout(() => {
          void supabase.from('typing_indicators').update({ is_typing: false, updated_at: new Date().toISOString() })
            .eq('conversation_id', chatId).eq('user_id', myId);
        }, 3000);
      })();
    } catch {}
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

  /** Realtime: global INSERT stream on messages (RLS-filtered per user). */
  startGlobalMessageStream: () => {
    if (globalStreamStarted) return;
    globalStreamStarted = true;
    supabase
      .channel('messages:global-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as any;
        if (!row?.id || !row?.conversation_id) return;
        void useChatStore.getState().receiveIncomingMessage(row);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as any;
        if (!row?.id || !row?.conversation_id) return;
        const convId = row.conversation_id as string;

        // deleted for everyone — soft-deleted rows render as a tombstone
        if (row.is_deleted) {
          set((state) => {
            const msgs = state.messages[convId];
            if (!msgs) return {};
            const idx = msgs.findIndex((m) => String(m.id) === String(row.id));
            if (idx === -1 || msgs[idx].isDeleted) return {};
            const next = msgs.map((m) => (String(m.id) === String(row.id) ? { ...m, isDeleted: true, content: 'This message was deleted' } : m));
            const messages = { ...state.messages, [convId]: next };
            chatCache.setMessages(messages);
            return { messages };
          });
          return;
        }

        // edited — decrypt the new content before it can touch the UI
        if (row.is_edited) {
          void (async () => {
            const myProfileId = useAuthStore.getState().profile?.id;
            if (!myProfileId) return;
            let newText: string | null = null;
            const { formatMessageRecord } = await import('../services/messagingCore');
            const fake = formatMessageRecord(row);
            try {
              await decryptMessages(myProfileId, convId, [fake]);
              if (!looksLikeEnvelope(fake.content)) newText = fake.content;
            } catch { /* keep old text */ }
            set((state) => {
              const msgs = state.messages[convId];
              if (!msgs) return {};
              const idx = msgs.findIndex((m) => String(m.id) === String(row.id));
              if (idx === -1) return {};
              const next = msgs.map((m) => {
                if (String(m.id) !== String(row.id)) return m;
                const mine = m.senderId === myProfileId;
                const content = mine ? m.content : (newText ?? m.content);
                return { ...m, content, isEdited: true };
              });
              const messages = { ...state.messages, [convId]: next };
              chatCache.setMessages(messages);
              return { messages };
            });
          })();
          return;
        }

        // live tick updates for my outgoing messages (delivered / read)
        if (!row.send_status) return;
        set((state) => {
          const msgs = state.messages[convId];
          if (!msgs) return {};
          const idx = msgs.findIndex((m) => m.id === row.id);
          if (idx === -1 || !msgs[idx] || msgs[idx].deliveryState === row.send_status) return {};
          const next = msgs.map((m) => (m.id === row.id ? { ...m, deliveryState: row.send_status as any } : m));
          const messages = { ...state.messages, [convId]: next };
          chatCache.setMessages(messages);
          return { messages };
        });
      })
      // reactions + pins stream in live so chips and the pinned banner pop instantly
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        const active = useChatStore.getState().activeChatId;
        if (active) void useChatStore.getState().fetchChatExtras(active);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_pins' }, () => {
        const active = useChatStore.getState().activeChatId;
        if (active) void useChatStore.getState().fetchChatExtras(active);
      })
      .subscribe();
  },

  receiveIncomingMessage: async (row: any) => {
    const myProfileId = useAuthStore.getState().profile?.id;
    if (!myProfileId) {
      // No profile id = no decryption possible. Retry once the profile resolves
      // instead of appending ciphertext.
      setTimeout(() => {
        if (useAuthStore.getState().profile?.id) void useChatStore.getState().receiveIncomingMessage(row);
      }, 1500);
      return;
    }
    const convId = row.conversation_id as string;
    const isMine = row.sender_id === myProfileId;

    const msg = await (async () => {
      const { formatMessageRecord } = await import('../services/messagingCore');
      const m = formatMessageRecord(row);
      if (!isMine) {
        try {
          await decryptMessages(myProfileId, convId, [m]);
        } catch (e) {
          console.warn('[realtime] decrypt failed, will retry in background', (m as any).id, e);
          m.content = CIPHER_PLACEHOLDER;
          (m as any)._encrypted = true;
        }
        void supabase.rpc('mark_messages_status', { p_conversation_id: convId, p_status: 'delivered' });
      } else if (isEnvelope(m.content as any) || looksLikeEnvelope(m.content)) {
        // echo of my own send — show my plaintext preview (fetch flow already handles open chats)
        const existing = (useChatStore.getState().messages[convId] || []).find((x) => x.id === m.id);
        if (existing && !looksLikeEnvelope(existing.content)) m.content = existing.content;
        else m.content = m.type === 'image' ? 'Photo' : m.type === 'voice' ? 'Voice note' : 'Attachment';
      }
      // ABSOLUTE gate — ciphertext never enters the store through this path.
      if (looksLikeEnvelope(m.content)) {
        m.content = CIPHER_PLACEHOLDER;
        (m as any)._encrypted = true;
      }
      return m;
    })();

    set((state) => {
      const existingMsgs = state.messages[convId] || [];
      if (existingMsgs.some((m) => m.id === msg.id)) return {};
      const messages = { ...state.messages, [convId]: [...existingMsgs, msg] };
      chatCache.setMessages(messages);

      let chats = state.chats;
      const idx = chats.findIndex((c) => c.id === convId);
      if (idx !== -1) {
        chats = chats.map((c, i) =>
          i === idx
            ? {
                ...c,
                lastMessage: { text: previewOf(msg), timestamp: (msg as any).timestamp, senderId: (msg as any).senderId, deliveryState: (msg as any).deliveryState || 'sent' },
                updatedAt: (msg as any).timestamp,
                unreadCount: isMine || state.activeChatId === convId ? c.unreadCount : (c.unreadCount || 0) + 1,
              }
            : c
        );
      } else {
        void get().fetchChats();
      }
      chatCache.setChats(chats);
      return { messages, chats };
    });
  },

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

  /** Realtime UPDATE on messages (delivered / read receipts). Merge ONLY the
   *  delivery fields — the wire row carries raw ciphertext in `content` and
   *  overwriting with it used to re-encrypt already-decrypted bubbles. */
  applyMessageDeliveryUpdate: (row) => {
    if (!row?.id || !row?.conversation_id) return;
    const status = (row.send_status || '').toString().toLowerCase();
    if (!status) return;
    set((state) => {
      const msgs = state.messages[row.conversation_id];
      if (!msgs) return {};
      const idx = msgs.findIndex((m) => m.id === row.id);
      if (idx === -1 || !msgs[idx] || msgs[idx].deliveryState === status) return {};
      const next = msgs.map((m) => (m.id === row.id ? { ...m, deliveryState: status as any } : m));
      const messages = { ...state.messages, [row.conversation_id]: next };
      chatCache.setMessages(messages);
      return { messages };
    });
  },

  removeMessageLocally: (messageId) => {
    set((state) => {
      const messages: Record<string, Message[]> = {};
      let touched = false;
      for (const [chatId, msgs] of Object.entries(state.messages)) {
        const filtered = msgs.filter((m) => m.id !== messageId);
        if (filtered.length !== msgs.length) { touched = true; messages[chatId] = filtered; }
      }
      if (!touched) return {};
      const merged = { ...state.messages, ...messages };
      chatCache.setMessages(merged);
      return { messages: merged };
    });
  },

  /** Background re-decrypt sweep: find rows whose content still looks like wire
   *  ciphertext (failed earlier when the session/prekey wasn't ready yet) and
   *  run them through the ratchet again. Patches the store + memo on success;
   *  leaves a clean placeholder on rows that are genuinely undecryptable. */
  redecryptChat: async (chatId) => {
    const myProfileId = useAuthStore.getState().profile?.id;
    if (!myProfileId || !chatId) return;
    const targets = (get().messages[chatId] || []).filter(
      (m) => looksLikeEnvelope(m.content) || (typeof m.content === 'string' && m.content.startsWith('🔒'))
    );
    if (!targets.length) return;
    // decryptMessages mutates rows in place; operate on COPIES so React sees changes
    const working = targets.map((m) => ({ ...m })) as Message[];
    try {
      await decryptMessages(myProfileId, chatId, working);
    } catch (e) {
      console.warn('[redecryptChat] sweep error (non-fatal)', e);
    }
    const byId = new Map<string, Message>();
    for (const w of working) {
      if (w.id && !looksLikeEnvelope(w.content)) byId.set(String(w.id), w);
    }
    if (!byId.size) return;
    set((state) => {
      const existing = state.messages[chatId] || [];
      let changed = false;
      const next = existing.map((m) => {
        const w = byId.get(String(m.id));
        if (!w) return m;
        changed = true;
        return {
          ...m,
          content: w.content,
          mediaUrl: (w as any).mediaUrl,
          attachments: w.attachments,
          _encrypted: (w as any)._encrypted,
          _mediaKey: (w as any)._mediaKey,
          _mime: (w as any)._mime,
          _duration: (w as any)._duration,
        } as Message;
      });
      if (!changed) return {};
      const messages = { ...state.messages, [chatId]: next };
      chatCache.setMessages(messages);
      return { messages };
    });
  },
}));
