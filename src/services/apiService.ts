/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  UserProfile, Chat, Message, Community, CommunityPost, 
  NotificationItem, UserSettings 
} from "../types";
import { supabase } from "../lib/supabase/client";
import { formatProfileRecord, createDefaultSettings } from "../store/authStore";
import { auditSupabaseCall } from "../lib/supabase/logger";

const TOKEN_STORAGE_KEY = "relay_v2_auth_token";

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const win = window as any;
  const isNative = !!win.Capacitor?.isNativePlatform?.();
  const isCapScheme = win.location?.protocol === "capacitor:" || win.location?.protocol === "file:";
  return isNative || isCapScheme;
};

export function formatMessageRecord(m: any): Message {
  if (!m) return {} as Message;
  const sender = m.sender || m.profiles || {};
  return {
    id: m.id,
    chatId: m.conversation_id || m.chat_id || '',
    senderId: m.sender_id || m.created_by || '',
    senderName: sender.display_name || sender.full_name || sender.username || m.sender_name || 'User',
    senderAvatar: sender.avatar_url || m.sender_avatar || undefined,
    type: m.message_type || m.type || 'text',
    content: m.content || '',
    attachments: m.media_url ? [{
      id: 'att_' + m.id,
      type: m.message_type === 'image' ? 'image' : m.message_type === 'voice' ? 'voice' : 'file',
      url: m.media_url,
      fileName: m.file_name || 'attachment',
      duration: m.duration_seconds
    }] : m.attachments || undefined,
    timestamp: m.created_at || new Date().toISOString(),
    deliveryState: m.send_status === 'sent' ? 'sent' : 'read',
    isEdited: m.is_edited || false,
    isDeleted: m.is_deleted || false,
    replyToId: m.reply_to_message_id || undefined
  };
}

export async function getOrCreateDirectChat(currentUserId: string, targetUserId: string): Promise<string> {
  if (!currentUserId || !targetUserId) {
    throw new Error("Missing user IDs for direct chat lookup/creation");
  }

  // 1. Try 'chats' table
  try {
    const { data: existingChats, error: searchError } = await supabase
      .from('chats')
      .select('id, participant_ids')
      .eq('is_group', false)
      .contains('participant_ids', [currentUserId, targetUserId]);

    if (!searchError && existingChats && existingChats.length > 0) {
      return existingChats[0].id;
    }

    if (!searchError) {
      const { data: newChat, error: createError } = await supabase
        .from('chats')
        .insert({
          is_group: false,
          participant_ids: [currentUserId, targetUserId],
          created_by: currentUserId,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (!createError && newChat) {
        return newChat.id;
      }
    }
  } catch {
    // Fallback to conversations table
  }

  // 2. Fallback to 'conversations' & 'conversation_members'
  try {
    const { data: myMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('profile_id', currentUserId);

    if (myMemberships && myMemberships.length > 0) {
      const convIds = myMemberships.map((m: any) => m.conversation_id);
      const { data: targetMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('profile_id', targetUserId)
        .in('conversation_id', convIds);

      if (targetMemberships && targetMemberships.length > 0) {
        return targetMemberships[0].conversation_id;
      }
    }

    // Insert new conversation
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        conversation_type: 'direct',
        created_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (!convErr && newConv) {
      // Add conversation members
      await supabase.from('conversation_members').insert([
        { conversation_id: newConv.id, profile_id: currentUserId, role: 'owner' },
        { conversation_id: newConv.id, profile_id: targetUserId, role: 'member' }
      ]);
      return newConv.id;
    }
  } catch (err: any) {
    console.warn("[getOrCreateDirectChat] Supabase direct chat insert fallback triggered:", err);
  }

  // 3. Fallback to deterministic client chat ID if RLS or DB prevents remote row creation
  const clientChatId = `dm_${[currentUserId, targetUserId].sort().join('_')}`;
  return clientChatId;
}

export const apiService = {
  // --- Auth ---
  checkUsername: async (username: string) => {
    if (!username) return { valid: false, message: "Username is required" };
    const lower = username.trim().toLowerCase().replace(/^@+/, '');
    if (lower.length < 3 || lower.length > 20) {
      return { valid: false, message: "Username must be between 3 and 20 characters" };
    }
    if (!/^[a-z0-9_]+$/.test(lower)) {
      return { valid: false, message: "Only lowercase letters, numbers, and underscores allowed" };
    }

    try {
      const { data } = await supabase.from("profiles").select("id").ilike("username", lower).limit(1);
      if (data && data.length > 0) {
        return { valid: false, message: "Username is already taken" };
      }
    } catch (e) {
      // ignore
    }

    return { valid: true, message: "Username is available" };
  },

  getCurrentUser: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("No active authenticated session");

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    const user = formatProfileRecord(profile, session.user);
    return { user };
  },

  searchUsers: async (q: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanQuery = (q || "").trim().toLowerCase().replace(/^@+/, '').trim();
    let currentUserId: string | null = null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      currentUserId = sess?.session?.user?.id || null;
    } catch {
      // ignore
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      // First try RPC search_profiles if available, audited
      const rpcResult = await auditSupabaseCall("rpc/search_profiles", { query_text: cleanQuery }, async () =>
        await supabase.rpc("search_profiles", { query_text: cleanQuery })
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!rpcResult.error && rpcResult.data && Array.isArray(rpcResult.data)) {
        const filtered = (rpcResult.data as any[]).filter((p: any) => p.id !== currentUserId);
        return { users: filtered.map((p: any) => formatProfileRecord(p)).slice(0, 25) };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      // Fallback to table query if RPC is missing
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      // Fallback direct table query, audited
      const tableResult = await auditSupabaseCall("table/profiles/search", { query: cleanQuery }, async () =>
        await supabase.from("profiles").select("*").limit(50)
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!tableResult.error && tableResult.data && Array.isArray(tableResult.data)) {
        const filtered = (tableResult.data as any[]).filter((p: any) => {
          if (currentUserId && (p.id === currentUserId || p.auth_user_id === currentUserId || p.user_id === currentUserId)) {
            return false;
          }
          if (!cleanQuery) return true;
          const uname = (p.username || '').toLowerCase();
          const fname = (p.full_name || p.display_name || p.name || '').toLowerCase();
          const email = (p.email || '').toLowerCase();
          const bio = (p.bio || '').toLowerCase();
          return (
            uname.includes(cleanQuery) ||
            fname.includes(cleanQuery) ||
            email.includes(cleanQuery) ||
            bio.includes(cleanQuery)
          );
        });
        return { users: filtered.map((p: any) => formatProfileRecord(p)).slice(0, 25) };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn("[Relay Search Direct Supabase] Query notice:", e);
    }

    return { users: [] };
  },

  searchGroups: async (q: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanQuery = (q || "").trim().toLowerCase();

    try {
      // First try RPC search_groups
      const rpcResult = await auditSupabaseCall("rpc/search_groups", { query_text: cleanQuery }, async () =>
        await supabase.rpc("search_groups", { query_text: cleanQuery })
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!rpcResult.error && rpcResult.data) {
        return { groups: rpcResult.data };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }

    // Direct table fallback
    try {
      const tableResult = await auditSupabaseCall("table/chats/search_groups", { query: cleanQuery }, async () =>
        await supabase.from("chats").select("*").eq("is_group", true).ilike("name", `%${cleanQuery}%`).limit(25)
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!tableResult.error && tableResult.data) {
        return { groups: tableResult.data };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }

    return { groups: [] };
  },

  searchCommunities: async (q: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const cleanQuery = (q || "").trim().toLowerCase().replace(/^@+/, '');

    try {
      const rpcResult = await auditSupabaseCall("rpc/search_communities", { query_text: cleanQuery }, async () =>
        await supabase.rpc("search_communities", { query_text: cleanQuery })
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!rpcResult.error && rpcResult.data) {
        return { communities: rpcResult.data };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }

    try {
      const tableResult = await auditSupabaseCall("table/communities/search", { query: cleanQuery }, async () =>
        await supabase.from("communities").select("*").or(`name.ilike.%${cleanQuery}%,handle.ilike.%${cleanQuery}%,description.ilike.%${cleanQuery}%`).limit(25)
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (!tableResult.error && tableResult.data) {
        return { communities: tableResult.data };
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
    }

    return { communities: [] };
  },

  updateProfile: async (payload: Partial<UserProfile>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const fields: any = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) fields.full_name = payload.name;
    if (payload.username !== undefined) fields.username = payload.username.trim().toLowerCase().replace(/^@+/, '');
    if (payload.avatarUrl !== undefined) fields.avatar_url = payload.avatarUrl;
    if (payload.bannerUrl !== undefined) fields.banner_url = payload.bannerUrl;
    if (payload.bio !== undefined) fields.bio = payload.bio;
    if (payload.statusMessage !== undefined) fields.status_message = payload.statusMessage;
    if (payload.country !== undefined) fields.country = payload.country;

    await supabase.from("profiles").update(fields).eq("id", user.id);
    const { data: updatedProf } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    return { user: formatProfileRecord(updatedProf, user) };
  },

  uploadFile: async (fileData: string, fileName?: string, fileType?: string) => {
    // Basic file upload return data URL or blob
    return { url: fileData };
  },

  updateSettings: async (settings: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: currentProf } = await supabase.from("profiles").select("settings").eq("id", user.id).single();
    const mergedSettings = { ...(currentProf?.settings || createDefaultSettings()), ...settings };

    await supabase.from("profiles").update({ settings: mergedSettings }).eq("id", user.id);
    return { settings: mergedSettings };
  },

  toggleBlockUser: async (targetUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existing } = await supabase.from("blocked_users").select("*").eq("blocker_id", user.id).eq("blocked_id", targetUserId).maybeSingle();
    if (existing) {
      await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", targetUserId);
    } else {
      await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: targetUserId });
    }

    const { data: blocks } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", user.id);
    return { blockedUsers: (blocks || []).map((b: any) => b.blocked_id) };
  },

  submitReport: async (payload: { targetUserId?: string; messageId?: string; communityId?: string; reason: string; details?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("user_reports").insert({
      reporter_id: user?.id || "anonymous",
      target_user_id: payload.targetUserId || null,
      reason: payload.reason,
      details: payload.details || null,
      created_at: new Date().toISOString()
    });
    return { success: true, message: "Report submitted successfully." };
  },

  // --- Messaging & Communities ---
  getChats: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { chats: [] };

    try {
      // 1. Try 'chats' table
      const { data: directChats } = await supabase
        .from('chats')
        .select('*')
        .contains('participant_ids', [user.id])
        .order('updated_at', { ascending: false });

      if (directChats && directChats.length > 0) {
        const chatsList: Chat[] = [];
        for (const c of directChats) {
          let name = c.name || 'Chat';
          let avatarUrl = c.avatar_url || undefined;
          const otherUserId = (c.participant_ids || []).find((id: string) => id !== user.id);

          if (otherUserId) {
            const { data: prof } = await supabase.from('profiles').select('display_name, full_name, username, avatar_url').eq('id', otherUserId).maybeSingle();
            if (prof) {
              name = prof.display_name || prof.full_name || prof.username || name;
              avatarUrl = prof.avatar_url || avatarUrl;
            }
          }

          const { data: lastMsgs } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .or(`chat_id.eq.${c.id},conversation_id.eq.${c.id}`)
            .order('created_at', { ascending: false })
            .limit(1);

          chatsList.push({
            id: c.id,
            name,
            type: c.is_group ? 'group' : 'direct',
            avatarUrl,
            participants: c.participant_ids || [user.id],
            unreadCount: 0,
            lastMessage: lastMsgs?.[0] ? {
              text: lastMsgs[0].content,
              timestamp: lastMsgs[0].created_at,
              senderId: lastMsgs[0].sender_id
            } : undefined
          });
        }
        return { chats: chatsList };
      }

      // 2. Fallback to conversation_members
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id, unread_count, conversations(*)')
        .eq('profile_id', user.id);

      if (memberships && memberships.length > 0) {
        const chatsList: Chat[] = [];
        for (const m of memberships) {
          const conv = (m as any).conversations;
          if (!conv) continue;

          let recipientName = conv.name || "Chat";
          let recipientAvatar = conv.avatar_url || undefined;
          let participantIds: string[] = [user.id];

          const { data: otherMembers } = await supabase
            .from('conversation_members')
            .select('profile_id, profiles(*)')
            .eq('conversation_id', conv.id);

          if (otherMembers) {
            participantIds = otherMembers.map((om: any) => om.profile_id);
            const other: any = otherMembers.find((om: any) => om.profile_id !== user.id);
            const pData = Array.isArray(other?.profiles) ? other.profiles[0] : other?.profiles;
            if (pData) {
              recipientName = pData.display_name || pData.full_name || pData.username || recipientName;
              recipientAvatar = pData.avatar_url || recipientAvatar;
            }
          }

          const { data: lastMsgs } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .or(`conversation_id.eq.${conv.id},chat_id.eq.${conv.id}`)
            .order('created_at', { ascending: false })
            .limit(1);

          chatsList.push({
            id: conv.id,
            name: recipientName,
            type: conv.conversation_type === 'group' ? 'group' : 'direct',
            avatarUrl: recipientAvatar,
            participants: participantIds,
            unreadCount: m.unread_count || 0,
            lastMessage: lastMsgs?.[0] ? {
              text: lastMsgs[0].content,
              timestamp: lastMsgs[0].created_at,
              senderId: lastMsgs[0].sender_id
            } : undefined
          });
        }
        return { chats: chatsList };
      }
    } catch (e) {
      console.warn("[getChats] Error:", e);
    }

    return { chats: [] };
  },

  createDirectChat: async (targetUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const chatId = await getOrCreateDirectChat(user.id, targetUserId);

    const { data: prof } = await supabase.from('profiles').select('display_name, full_name, username, avatar_url').eq('id', targetUserId).maybeSingle();
    const chatName = prof?.display_name || prof?.full_name || prof?.username || "Direct Message";

    const chat: Chat = {
      id: chatId,
      name: chatName,
      type: "direct",
      avatarUrl: prof?.avatar_url || undefined,
      participants: [user.id, targetUserId],
      unreadCount: 0
    };
    return { chat };
  },

  createGroupChat: async (name: string, description?: string, participantIds?: string[], isPrivate?: boolean, avatarUrl?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const allParticipants = Array.from(new Set([user.id, ...(participantIds || [])]));

    // Try creating in 'chats' table
    try {
      const { data: newChat, error: cErr } = await supabase
        .from('chats')
        .insert({
          name,
          is_group: true,
          participant_ids: allParticipants,
          created_by: user.id,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (!cErr && newChat) {
        const chat: Chat = {
          id: newChat.id,
          name: newChat.name || name,
          type: "group",
          description,
          avatarUrl: newChat.avatar_url || avatarUrl,
          participants: allParticipants,
          unreadCount: 0
        };
        return { chat };
      }
    } catch {
      // Fallback
    }

    // Fallback to conversations table
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        name,
        description,
        conversation_type: 'group',
        avatar_url: avatarUrl || null,
        created_by: user.id,
        is_public: !isPrivate,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (newConv) {
      await supabase.from('conversation_members').insert(
        allParticipants.map((pId) => ({
          conversation_id: newConv.id,
          profile_id: pId,
          role: pId === user.id ? 'owner' : 'member'
        }))
      );
    }

    const chat: Chat = {
      id: newConv?.id || `group_${Date.now()}`,
      name,
      type: "group",
      description,
      avatarUrl,
      participants: allParticipants,
      unreadCount: 0
    };
    return { chat };
  },

  deleteChat: async (chatId: string) => {
    try {
      await supabase.from('chats').delete().eq('id', chatId);
      await supabase.from('conversations').delete().eq('id', chatId);
    } catch {
      // ignore
    }
    return { success: true };
  },

  getMessages: async (chatId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles(*)')
        .or(`conversation_id.eq.${chatId},chat_id.eq.${chatId}`)
        .order('created_at', { ascending: true });

      if (error) {
        const { data: d2 } = await supabase
          .from('messages')
          .select('*, sender:profiles(*)')
          .eq('conversation_id', chatId)
          .order('created_at', { ascending: true });

        if (d2) {
          return { messages: d2.map(formatMessageRecord) };
        }
      } else if (data) {
        return { messages: data.map(formatMessageRecord) };
      }
    } catch (e) {
      console.warn("[getMessages] Error:", e);
    }
    return { messages: [] };
  },

  sendMessage: async (chatId: string, payload: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const messageData: any = {
      conversation_id: chatId,
      chat_id: chatId,
      sender_id: user.id,
      content: payload.content || "",
      message_type: payload.type || "text",
      media_url: payload.attachments?.[0]?.url || null,
      file_name: payload.attachments?.[0]?.fileName || null,
      created_at: new Date().toISOString()
    };

    let confirmedMsg: any = null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select('*, sender:profiles(*)')
        .single();

      if (!error && data) {
        confirmedMsg = data;
      } else {
        const { chat_id, ...cleanData } = messageData;
        const { data: d2 } = await supabase
          .from('messages')
          .insert(cleanData)
          .select('*, sender:profiles(*)')
          .single();

        if (d2) confirmedMsg = d2;
      }
    } catch (err) {
      console.error("[sendMessage] Supabase error:", err);
    }

    const msgFormatted = confirmedMsg ? formatMessageRecord(confirmedMsg) : {
      id: `msg_${Date.now()}`,
      chatId,
      senderId: user.id,
      senderName: user.user_metadata?.full_name || "Me",
      type: payload.type || "text",
      content: payload.content || "",
      attachments: payload.attachments,
      timestamp: new Date().toISOString(),
      deliveryState: "sent"
    } as Message;

    const chat: Chat = {
      id: chatId,
      name: "Chat",
      type: "direct",
      participants: [user.id],
      lastMessage: {
        text: payload.content || "",
        timestamp: new Date().toISOString(),
        senderId: user.id,
        deliveryState: "sent"
      }
    };

    return { message: msgFormatted, chat };
  },

  editMessage: async (chatId: string, messageId: string, content: string) => {
    try {
      await supabase.from('messages').update({
        content,
        is_edited: true,
        edited_at: new Date().toISOString()
      }).eq('id', messageId);
    } catch {
      // ignore
    }
    return { success: true };
  },

  deleteMessage: async (chatId: string, messageId: string) => {
    try {
      await supabase.from('messages').update({
        is_deleted: true,
        content: "This message was deleted",
        deleted_at: new Date().toISOString()
      }).eq('id', messageId);
    } catch {
      // ignore
    }
    return { success: true, message: { id: messageId, isDeleted: true, content: "This message was deleted" } as any };
  },

  reactToMessage: async (chatId: string, messageId: string, emoji: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    return { 
      reactions: [{ 
        emoji, 
        userId: user?.id || 'me', 
        userName: user?.user_metadata?.full_name || 'Me' 
      }] 
    };
  },

  togglePinMessage: async (chatId: string, messageId: string) => {
    return { pinnedMessageId: messageId };
  },

  sendTypingSignal: async (chatId: string) => {
    return { activeTyping: [] };
  },

  getTypingState: async (chatId: string) => {
    return { activeTyping: [] };
  },

  markChatAsRead: async (chatId: string) => {
    return { success: true };
  },

  updateChatInfo: async (chatId: string, payload: any) => {
    return { chat: {} as any };
  },

  addGroupMembers: async (chatId: string, memberIds: string[]) => {
    return { chat: {} as any };
  },

  removeGroupMember: async (chatId: string, memberId: string) => {
    return { chat: {} as any };
  },

  getCommunities: async () => {
    const { data } = await supabase.from("communities").select("*").order("created_at", { ascending: false });
    const communities: Community[] = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      description: c.description || "",
      category: c.category || "General",
      bannerUrl: c.banner_url || "",
      avatarUrl: c.avatar_url || "",
      ownerId: c.owner_id,
      isPrivate: c.is_private || false,
      memberCount: c.member_count || 1,
      channels: [
        { id: "c_general", name: "general", type: "text", description: "General chat and announcements" },
        { id: "c_media", name: "media-and-showcase", type: "media", description: "Share images and builds" }
      ]
    }));
    return { communities };
  },

  getStatuses: async () => {
    return { contacts: [], discovery: [] };
  },

  createStatus: async (payload: any) => {
    return { success: true, status: {} };
  },

  recordStatusView: async (statusId: string) => {
    return { success: true };
  },

  likeStatus: async (statusId: string) => {
    return { success: true, likes: [] };
  },

  deleteStatus: async (statusId: string) => {
    return { success: true };
  },

  createCommunity: async (payload: { name: string; handle: string; description?: string; category?: string; bannerUrl?: string; avatarUrl?: string; isPrivate?: boolean }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const ownerId = user?.id || "me";
    const { data: newComm } = await supabase.from("communities").insert({
      name: payload.name,
      handle: payload.handle.startsWith("@") ? payload.handle.toLowerCase() : `@${payload.handle.toLowerCase()}`,
      description: payload.description || null,
      category: payload.category || "General",
      banner_url: payload.bannerUrl || null,
      avatar_url: payload.avatarUrl || null,
      owner_id: ownerId,
      is_private: payload.isPrivate || false,
      member_count: 1
    }).select().single();

    const community: Community = {
      id: newComm?.id || `comm_${Date.now()}`,
      name: newComm?.name || payload.name,
      handle: newComm?.handle || payload.handle,
      description: newComm?.description || payload.description || "",
      category: newComm?.category || payload.category || "General",
      bannerUrl: newComm?.banner_url || payload.bannerUrl || "",
      avatarUrl: newComm?.avatar_url || payload.avatarUrl || "",
      ownerId,
      isPrivate: payload.isPrivate || false,
      memberCount: 1,
      channels: [
        { id: "c_general", name: "general", type: "text", description: "General chat and announcements" },
        { id: "c_media", name: "media-and-showcase", type: "media", description: "Share images and builds" }
      ]
    };
    return { community };
  },

  updateCommunityInfo: async (id: string, payload: any) => {
    return { community: {} as any };
  },

  deleteCommunity: async (id: string) => {
    await supabase.from("communities").delete().eq("id", id);
    return { success: true };
  },

  joinCommunity: async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("community_members").upsert({ community_id: id, user_id: user.id, role: "member" }, { onConflict: "community_id, user_id" });
    }
    return { success: true, community: { id, name: "Community", handle: "@community", memberCount: 1, isJoined: true } as Community };
  },

  leaveCommunity: async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("community_members").delete().eq("community_id", id).eq("user_id", user.id);
    }
    return { success: true, community: { id, name: "Community", handle: "@community", memberCount: 1, isJoined: false } as Community };
  },

  getCommunityPosts: async (id: string) => {
    const { data: posts } = await supabase.from("community_posts").select("*, author:profiles(*)").eq("community_id", id).order("created_at", { ascending: false });
    const formatted: CommunityPost[] = (posts || []).map((p: any) => ({
      id: p.id,
      communityId: p.community_id,
      channelId: p.channel_id || "c_general",
      authorId: p.author_id,
      authorName: p.author?.full_name || p.author?.username || "Member",
      authorAvatar: p.author?.avatar_url || undefined,
      title: p.title || undefined,
      content: p.content,
      imageUrl: p.image_url || undefined,
      likesCount: 0,
      commentsCount: 0,
      timestamp: p.created_at
    }));
    return { posts: formatted };
  },

  createCommunityPost: async (id: string, payload: { channelId?: string; title?: string; content: string; imageUrl?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const authorId = user?.id || "me";
    const { data: newPost } = await supabase.from("community_posts").insert({
      community_id: id,
      author_id: authorId,
      channel_id: payload.channelId || "c_general",
      title: payload.title || null,
      content: payload.content,
      image_url: payload.imageUrl || null,
      created_at: new Date().toISOString()
    }).select().single();

    const post: CommunityPost = {
      id: newPost?.id || `post_${Date.now()}`,
      communityId: id,
      channelId: payload.channelId || "c_general",
      authorId,
      authorName: "Member",
      title: payload.title,
      content: payload.content,
      imageUrl: payload.imageUrl,
      timestamp: new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0
    };
    return { post };
  },

  likeCommunityPost: async (postId: string) => {
    return { likesCount: 1, isLiked: true };
  },

  addPostComment: async (postId: string, content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const comment = {
      id: `comment_${Date.now()}`,
      postId,
      authorId: user?.id || "me",
      authorName: user?.user_metadata?.full_name || "Member",
      authorAvatar: user?.user_metadata?.avatar_url || undefined,
      content,
      timestamp: new Date().toISOString()
    };
    return { comment, commentsCount: 1 };
  },

  getNotifications: async () => {
    return { notifications: [] };
  },

  markNotificationsRead: async () => {
    return { success: true };
  }
};

export const relay = {
  auth: {
    checkUsername: apiService.checkUsername,
    me: apiService.getCurrentUser
  },
  profile: {
    update: apiService.updateProfile,
    settings: apiService.updateSettings,
    block: apiService.toggleBlockUser,
    report: apiService.submitReport
  },
  communities: {
    get: apiService.getCommunities,
    create: apiService.createCommunity,
    join: apiService.joinCommunity,
    leave: apiService.leaveCommunity,
    getPosts: apiService.getCommunityPosts,
    createPost: apiService.createCommunityPost,
    likePost: apiService.likeCommunityPost
  },
  search: {
    users: apiService.searchUsers,
    groups: apiService.searchGroups,
    communities: apiService.searchCommunities
  },
  notifications: {
    get: apiService.getNotifications,
    markRead: apiService.markNotificationsRead
  },
  utils: {
    getAuthToken,
    setAuthToken
  }
};
