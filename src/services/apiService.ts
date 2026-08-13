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

import { profileCache } from "./profileCache";

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

const pendingDirectChatPromises = new Map<string, Promise<string>>();

export async function getCurrentProfile(): Promise<{ sbUser: any; profile: any; profileId: string } | null> {
  const { data: { user: sbUser } } = await supabase.auth.getUser();
  if (!sbUser) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .or(`auth_user_id.eq.${sbUser.id},id.eq.${sbUser.id}`)
    .maybeSingle();

  if (profile) {
    profileCache.set(formatProfileRecord(profile));
  }

  const profileId = profile?.id || sbUser.id;
  return { sbUser, profile, profileId };
}

async function resolveExactProfileId(inputUserId: string): Promise<string> {
  if (!inputUserId) return inputUserId;
  const cached = profileCache.get(inputUserId);
  if (cached && cached.id) return cached.id;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, auth_user_id, display_name, username, avatar_url')
      .or(`id.eq.${inputUserId},auth_user_id.eq.${inputUserId}`)
      .maybeSingle();

    if (data) {
      if (data.id) return data.id;
    }
  } catch (e) {
    console.warn('[resolveExactProfileId] Error querying profile:', e);
  }
  return inputUserId;
}

export async function getOrCreateDirectChat(currentUserId: string, targetUserId: string): Promise<string> {
  if (!currentUserId || !targetUserId) {
    throw new Error("Missing user IDs for direct chat lookup/creation");
  }

  const realCurrentUserId = await resolveExactProfileId(currentUserId);
  const realTargetUserId = await resolveExactProfileId(targetUserId);

  const pairKey = [realCurrentUserId, realTargetUserId].sort().join('_');
  if (pendingDirectChatPromises.has(pairKey)) {
    return pendingDirectChatPromises.get(pairKey)!;
  }

  const promise = (async () => {
    // 1. Check existing direct conversation in 'conversation_members' & 'conversations'
    try {
      const { data: myMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('profile_id', realCurrentUserId);

      if (myMemberships && myMemberships.length > 0) {
        const convIds = myMemberships.map((m: any) => m.conversation_id);
        const { data: targetMemberships } = await supabase
          .from('conversation_members')
          .select('conversation_id, conversations!inner(id, conversation_type)')
          .eq('profile_id', realTargetUserId)
          .in('conversation_id', convIds);

        if (targetMemberships && targetMemberships.length > 0) {
          const directMatch = targetMemberships.find((tm: any) => {
            const conv = tm.conversations;
            return conv && (conv.conversation_type === 'direct' || !conv.conversation_type);
          });
          if (directMatch) {
            return directMatch.conversation_id;
          }
          return targetMemberships[0].conversation_id;
        }
      }
    } catch (e) {
      console.warn("[getOrCreateDirectChat] Error querying conversation_members:", e);
    }

    // 2. Insert new conversation in 'conversations' table
    let newConvId: string | null = null;
    let lastErr: any = null;

    try {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          conversation_type: 'direct',
          created_by: realCurrentUserId,
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle();

      if (!convErr && newConv) {
        newConvId = newConv.id;
      } else {
        lastErr = convErr;
      }
    } catch (e) {
      lastErr = e;
    }

    if (newConvId) {
      // 3. Add members to 'conversation_members'
      const { error: memErr } = await supabase.from('conversation_members').insert([
        { conversation_id: newConvId, profile_id: realCurrentUserId, role: 'owner' },
        { conversation_id: newConvId, profile_id: realTargetUserId, role: 'member' }
      ]);

      if (memErr) {
        console.warn("[getOrCreateDirectChat] conversation_members insert error:", memErr);
      }

      return newConvId;
    }

    const errMsg = lastErr?.message || "Failed to establish direct conversation in database";
    console.error("[getOrCreateDirectChat] Failed DB creation:", lastErr);
    throw new Error(errMsg);
  })();

  pendingDirectChatPromises.set(pairKey, promise);
  try {
    const res = await promise;
    return res;
  } finally {
    pendingDirectChatPromises.delete(pairKey);
  }
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
      const tableResult = await auditSupabaseCall("table/conversations/search_groups", { query: cleanQuery }, async () =>
        await supabase.from("conversations").select("*").eq("conversation_type", "group").ilike("name", `%${cleanQuery}%`).limit(25)
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
    const current = await getCurrentProfile();
    if (!current) return { chats: [] };
    const { profileId } = current;

    try {
      const { data: memberships, error } = await supabase
        .from('conversation_members')
        .select('conversation_id, unread_count, conversations(*)')
        .eq('profile_id', profileId);

      if (error) {
        console.warn("[getChats] Error querying conversation_members:", error);
        return { chats: [] };
      }

      if (!memberships || memberships.length === 0) {
        return { chats: [] };
      }

      const chatsList: Chat[] = [];
      for (const m of memberships) {
        const conv = (m as any).conversations;
        if (!conv) continue;

        let name = conv.name || "Chat";
        let avatarUrl = conv.avatar_url || undefined;
        let participantIds: string[] = [profileId];

        const { data: otherMembers } = await supabase
          .from('conversation_members')
          .select('profile_id, profiles(*)')
          .eq('conversation_id', conv.id);

        if (otherMembers) {
          participantIds = otherMembers.map((om: any) => om.profile_id);
          const other: any = otherMembers.find((om: any) => om.profile_id !== profileId);
          const pData = Array.isArray(other?.profiles) ? other.profiles[0] : other?.profiles;
          if (pData) {
            const formattedProf = formatProfileRecord(pData);
            profileCache.set(formattedProf);
            if (conv.conversation_type !== 'group') {
              name = formattedProf.name || formattedProf.username || name;
              avatarUrl = formattedProf.avatarUrl || avatarUrl;
            }
          }
        }

        const { data: lastMsgs } = await supabase
          .from('messages')
          .select('content, created_at, sender_id')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        chatsList.push({
          id: conv.id,
          name,
          type: conv.conversation_type === 'group' ? 'group' : 'direct',
          avatarUrl,
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
    } catch (e) {
      console.warn("[getChats] Exception:", e);
      return { chats: [] };
    }
  },

  createDirectChat: async (targetUserId: string) => {
    const current = await getCurrentProfile();
    if (!current) throw new Error("Not authenticated");
    const { profileId } = current;

    const chatId = await getOrCreateDirectChat(profileId, targetUserId);

    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name, full_name, username, avatar_url')
      .eq('id', targetUserId)
      .maybeSingle();

    const chatName = prof?.display_name || prof?.full_name || prof?.username || "Direct Message";

    const chat: Chat = {
      id: chatId,
      name: chatName,
      type: "direct",
      avatarUrl: prof?.avatar_url || undefined,
      participants: [profileId, targetUserId],
      unreadCount: 0
    };
    return { chat };
  },

  createGroupChat: async (name: string, description?: string, participantIds?: string[], isPrivate?: boolean, avatarUrl?: string) => {
    const current = await getCurrentProfile();
    if (!current) throw new Error("Not authenticated");
    const { profileId } = current;

    const allParticipants = Array.from(new Set([profileId, ...(participantIds || [])]));

    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        name,
        description,
        conversation_type: 'group',
        avatar_url: avatarUrl || null,
        created_by: profileId,
        is_public: !isPrivate,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (convErr || !newConv) {
      throw new Error(`Failed to create group conversation: ${convErr?.message || 'Unknown error'}`);
    }

    const { error: memErr } = await supabase.from('conversation_members').insert(
      allParticipants.map((pId) => ({
        conversation_id: newConv.id,
        profile_id: pId,
        role: pId === profileId ? 'owner' : 'member'
      }))
    );

    if (memErr) {
      console.warn('[createGroupChat] conversation_members error:', memErr);
    }

    const chat: Chat = {
      id: newConv.id,
      name: newConv.name || name,
      type: "group",
      description,
      avatarUrl: newConv.avatar_url || avatarUrl,
      participants: allParticipants,
      unreadCount: 0
    };
    return { chat };
  },

  deleteChat: async (chatId: string) => {
    try {
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
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn("[getMessages] Error querying messages:", error);
        return { messages: [] };
      }

      return { messages: (data || []).map(formatMessageRecord) };
    } catch (e) {
      console.warn("[getMessages] Exception:", e);
      return { messages: [] };
    }
  },

  sendMessage: async (chatId: string, payload: any) => {
    const current = await getCurrentProfile();
    if (!current) {
      throw new Error("Not authenticated");
    }

    const { sbUser, profile, profileId } = current;

    let targetUserId: string | null = null;
    let targetConvId = chatId;

    if (chatId.startsWith('dm_')) {
      const parts = chatId.replace('dm_', '').split('_');
      targetUserId = parts.find((p) => p !== profileId) || parts[0];
      if (targetUserId) {
        try {
          const resolvedId = await getOrCreateDirectChat(profileId, targetUserId);
          if (resolvedId && !resolvedId.startsWith('dm_')) {
            targetConvId = resolvedId;
          }
        } catch (e: any) {
          console.error('[MESSAGE] failure in getOrCreateDirectChat:', e);
          throw e;
        }
      }
    }

    const clientMsgId = payload.clientMessageId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Required audit logging
    console.log(`[MESSAGE AUDIT]`);
    console.log(`auth_user_id: ${sbUser.id}`);
    console.log(`profile_id: ${profileId}`);
    console.log(`profile.auth_user_id: ${profile?.auth_user_id || 'N/A'}`);
    console.log(`conversation_id: ${targetConvId}`);
    console.log(`recipient_profile_id: ${targetUserId || 'group'}`);
    console.log(`sender_id: ${profileId}`);
    console.log(`client_message_id: ${clientMsgId}`);
    console.log(`message_type: ${payload.type || 'text'}`);
    console.log(`content: ${payload.content || ''}`);
    console.log(`insert_started: ${new Date().toISOString()}`);

    // Idempotency check: recent identical message
    try {
      const { data: existingDup } = await supabase
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('conversation_id', targetConvId)
        .eq('sender_id', profileId)
        .eq('content', payload.content || '')
        .gt('created_at', new Date(Date.now() - 5000).toISOString())
        .maybeSingle();

      if (existingDup) {
        console.log(`database_message_id: ${existingDup.id}`);
        console.log(`delivery_state: sent`);
        const msgFormatted = formatMessageRecord(existingDup);
        msgFormatted.chatId = chatId;
        return { message: msgFormatted, chat: { id: targetConvId, name: "Conversation", type: "direct", participants: [profileId] } as Chat };
      }
    } catch (_) {}

    const messageData: any = {
      conversation_id: targetConvId,
      sender_id: profileId,
      content: payload.content || "",
      message_type: payload.type || "text",
      media_url: payload.attachments?.[0]?.url || null,
      file_name: payload.attachments?.[0]?.fileName || null,
      duration_seconds: payload.attachments?.[0]?.duration || null,
      reply_to_message_id: payload.replyToId || null,
      is_forwarded: payload.isForwarded || false,
      send_status: 'sent',
      created_at: new Date().toISOString()
    };

    let confirmedMsg: any = null;
    let lastErr: any = null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select('*, sender:profiles(*)')
        .maybeSingle();

      console.log(`insert_response:`, data);
      console.log(`insert_error:`, error);

      if (!error && data) {
        confirmedMsg = data;
      } else {
        lastErr = error;
      }
    } catch (err: any) {
      lastErr = err;
      console.error("[MESSAGE] Supabase exception:", err);
    }

    if (!confirmedMsg) {
      const errStr = lastErr ? `Error ${lastErr.code || ''}: ${lastErr.message || JSON.stringify(lastErr)}` : "Database rejected message creation";
      console.error(`delivery_state: failed - ${errStr}`);
      throw new Error(errStr);
    }

    console.log(`database_message_id: ${confirmedMsg.id}`);
    console.log(`delivery_state: sent`);

    // Touch conversation last_message_at and updated_at
    try {
      await supabase
        .from('conversations')
        .update({
          last_message_at: confirmedMsg.created_at,
          last_message_id: confirmedMsg.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetConvId);
    } catch (_) {}

    const msgFormatted = formatMessageRecord(confirmedMsg);
    msgFormatted.chatId = targetConvId;

    const chat: Chat = {
      id: targetConvId,
      name: "Conversation",
      type: "direct",
      participants: [profileId, ...(targetUserId ? [targetUserId] : [])],
      lastMessage: {
        text: payload.content || "",
        timestamp: new Date().toISOString(),
        senderId: profileId,
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
