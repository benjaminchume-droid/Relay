/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core apiService aligned to live supabase1 Relay schema (conversations/messages RPCs).
 */

import {
  UserProfile, Chat, Message, Community, CommunityPost,
  NotificationItem, UserSettings
} from "../types";
import { supabase } from "../lib/supabase/client";
import { formatProfileRecord, createDefaultSettings } from "../store/authStore";
import { profileCache } from "./profileCache";
import {
  getCurrentProfile,
  sendConversationMessage as coreSendConversationMessage,
} from "./messagingCore";

const TOKEN_STORAGE_KEY = "relay_v2_auth_token";

export const getAuthToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch { return null; }
};

export const setAuthToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
};

async function resolveMyProfileId(): Promise<string | null> {
  const current = await getCurrentProfile();
  return current?.profileId || null;
}

function mapConversationRow(row: any, myProfileId: string): Chat {
  const members: any[] = row.conversation_members || row.members || [];
  const participantIds = members
    .map((m: any) => m.profile_id || m.profileId)
    .filter(Boolean);
  const other = members.find(
    (m: any) => (m.profile_id || m.profileId) && (m.profile_id || m.profileId) !== myProfileId
  );
  let otherProfile = other?.profiles || other?.profile || null;
  if (Array.isArray(otherProfile)) otherProfile = otherProfile[0] || null;
  const isDirect =
    (row.conversation_type || row.type || "").toLowerCase() === "direct";

  let name = row.name || "";
  let avatarUrl = row.avatar_url || row.avatarUrl || undefined;
  if (isDirect && otherProfile) {
    name =
      otherProfile.display_name ||
      otherProfile.full_name ||
      (otherProfile.username ? `@${otherProfile.username}` : "") ||
      name;
    avatarUrl = otherProfile.avatar_url || avatarUrl;
  }
  if (isDirect && !name && other) {
    const oid = other.profile_id || other.profileId;
    const cached = oid ? profileCache.get(oid) : null;
    if (cached) {
      name = cached.name || (cached.username ? `@${cached.username}` : "");
      avatarUrl = avatarUrl || cached.avatarUrl;
    }
  }
  if (!name) {
    name = isDirect ? "Chat" : (row.name || "Group");
    if (name === "Direct chat" || name === "Conversation") name = isDirect ? "Chat" : "Group";
  }
  if (name === "Direct chat" || name === "Conversation") {
    name = isDirect ? "Chat" : "Group";
  }

  const lastAt = row.last_message_at || row.updated_at || row.created_at;
  return {
    id: row.id,
    name,
    type: isDirect ? "direct" : "group",
    avatarUrl,
    participants: participantIds.length ? participantIds : [myProfileId],
    unreadCount: other?.unread_count || row.unread_count || 0,
    lastMessage: row.last_message_preview
      ? {
          text: row.last_message_preview,
          timestamp: lastAt,
          senderId: row.last_message_sender_id || "",
          deliveryState: "sent",
        }
      : undefined,
    updatedAt: lastAt,
  } as Chat;
}

export const apiService = {
  getStatuses: async () => {
    const { fetchActiveStories } = await import("./phase1Service");
    const stories = await fetchActiveStories();
    const mapped = stories.map((s: any) => ({
      id: s.id,
      userId: s.profileId,
      userName: s.authorName,
      userAvatar: s.authorAvatar,
      type: (s.type === "video" ? "video" : s.type === "image" ? "image" : "text") as "text" | "image" | "video",
      content: s.caption || "",
      mediaUrl: s.mediaUrl,
      backgroundGradient: s.backgroundColor,
      privacy: (s.privacy as any) || "everyone",
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      viewers: [] as any[],
      likes: [] as string[],
    }));
    return { contacts: mapped, discovery: mapped };
  },

  createStatus: async (payload: any) => {
    const { createStory } = await import("./phase1Service");
    const story = await createStory({
      type: payload.type === "image" ? "image" : payload.type === "video" ? "video" : "text",
      caption: payload.content || payload.caption,
      mediaUrl: payload.mediaUrl,
      backgroundColor: payload.backgroundGradient,
      privacy: payload.privacy || "everyone",
    });
    return { status: story };
  },

  getChats: async (): Promise<{ chats: Chat[] }> => {
    const myProfileId = await resolveMyProfileId();
    if (!myProfileId) return { chats: [] };

    const { data, error } = await supabase
      .from("conversation_members")
      .select(`
        conversation_id,
        unread_count,
        role,
        status,
        conversations (
          id,
          conversation_type,
          name,
          avatar_url,
          last_message_at,
          last_message_id,
          last_message_preview,
          last_message_sender_id,
          updated_at,
          created_at,
          created_by
        )
      `)
      .eq("profile_id", myProfileId)
      .eq("status", "active")
      .is("left_at", null);

    if (error) {
      console.error("[apiService.getChats]", error);
      throw error;
    }

    const rows = data || [];
    const chats: Chat[] = [];
    for (const row of rows) {
      const conv = (row as any).conversations;
      if (!conv?.id) continue;
      const { data: members } = await supabase
        .from("conversation_members")
        .select("profile_id, unread_count, profiles:profile_id(id, display_name, full_name, username, avatar_url)")
        .eq("conversation_id", conv.id)
        .eq("status", "active")
        .is("left_at", null);

      let mapped = mapConversationRow(
        {
          ...conv,
          conversation_members: members || [],
          unread_count: row.unread_count,
        },
        myProfileId
      );
      if (mapped.type === "direct" && (mapped.name === "Chat" || mapped.name === "Direct chat" || mapped.name === "Conversation" || !mapped.name)) {
        const peerId = mapped.participants.find((p) => p !== myProfileId);
        if (peerId) {
          try {
            const { data: p } = await supabase
              .from("profiles")
              .select("id, display_name, full_name, username, avatar_url")
              .or(`id.eq.${peerId},auth_user_id.eq.${peerId}`)
              .maybeSingle();
            if (p) {
              const nm = p.display_name || p.full_name || (p.username ? `@${p.username}` : "Chat");
              mapped = { ...mapped, name: nm, avatarUrl: p.avatar_url || mapped.avatarUrl };
              try {
                profileCache.set({
                  id: p.id,
                  username: p.username || "",
                  name: p.display_name || p.full_name || p.username || "Chat",
                  email: "",
                  avatarUrl: p.avatar_url || undefined,
                  onlineStatus: "offline",
                  contacts: [],
                  blockedUsers: [],
                  sentRequests: [],
                  receivedRequests: [],
                  settings: createDefaultSettings(),
                  createdAt: new Date().toISOString(),
                } as any);
              } catch {}
            }
          } catch {}
        }
      }
      chats.push(mapped);
    }

    chats.sort((a, b) => {
      const ta = new Date(a.updatedAt || 0).getTime();
      const tb = new Date(b.updatedAt || 0).getTime();
      return tb - ta;
    });

    return { chats };
  },

  getMessages: async (conversationId: string): Promise<{ messages: Message[] }> => {
    const { fetchConversationMessages } = await import("./messageFetch");
    try {
      const messages = await fetchConversationMessages(conversationId);
      return { messages };
    } catch (error: any) {
      console.error("[apiService.getMessages]", error);
      throw error;
    }
  },

  sendMessage: async (
    conversationId: string,
    content: string,
    opts?: { type?: string; mediaUrl?: string; replyToId?: string; attachments?: any[] }
  ) => {
    return coreSendConversationMessage(conversationId, {
      content,
      type: opts?.type || "text",
      mediaUrl: opts?.mediaUrl,
      attachments: opts?.attachments || (opts?.mediaUrl ? [{ url: opts.mediaUrl }] : undefined),
      replyToId: opts?.replyToId,
    });
  },

  createGroupChat: async (name: string, memberIds: string[]) => {
    const { data, error } = await supabase.rpc("create_group_conversation", {
      p_name: name,
      p_member_ids: memberIds,
    });
    if (error) {
      console.error("[apiService.createGroupChat]", error);
      throw new Error(error.message || "Failed to create group. Please check your network connection.");
    }
    let chatId: string | null = null;
    let chatName = name;
    if (typeof data === "string" && data.length > 0) {
      chatId = data;
    } else if (data && typeof data === "object") {
      chatId = (data as any).id || (data as any).conversation_id || null;
      chatName = (data as any).name || name;
    }
    if (!chatId) {
      throw new Error("Group was created but no id was returned. Pull to refresh.");
    }
    return {
      chat: {
        id: chatId,
        name: chatName,
        type: "group" as const,
        participants: memberIds || [],
        unreadCount: 0,
        avatarUrl: undefined,
      },
    };
  },

  markChatAsRead: async (conversationId: string) => {
    const myProfileId = await resolveMyProfileId();
    if (!myProfileId || !conversationId) return;
    await supabase
      .from("conversation_members")
      .update({
        last_read_at: new Date().toISOString(),
        unread_count: 0,
      })
      .eq("conversation_id", conversationId)
      .eq("profile_id", myProfileId);
  },

  deleteChat: async (conversationId: string) => {
    const myProfileId = await resolveMyProfileId();
    if (!myProfileId) return { success: false };
    await supabase
      .from("conversation_members")
      .update({ status: "left", left_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", myProfileId);
    return { success: true };
  },

  deleteMessage: async (messageId: string) => {
    await supabase
      .from("messages")
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), content: null })
      .eq("id", messageId);
    return { success: true };
  },

  editMessage: async (messageId: string, content: string) => {
    await supabase
      .from("messages")
      .update({ content, is_edited: true, edited_at: new Date().toISOString() })
      .eq("id", messageId);
    return { success: true };
  },

  uploadFile: async (base64: string, fileName: string, mimeType: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const binary = atob(base64.includes(",") ? base64.split(",")[1] : base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const path = `${user.id}/${Date.now()}_${fileName}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, bytes, { contentType: mimeType, upsert: false });
    if (error) throw error;
    const { data: signed } = await supabase.storage.from("chat-media").createSignedUrl(path, 60 * 60 * 24 * 7);
    return { path, url: signed?.signedUrl || path };
  },

  getNotifications: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
    return data || [];
  },

  markNotificationsRead: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  },

  submitReport: async (payload: any) => {
    await supabase.from("audit_logs").insert({
      action: "user_report",
      metadata: payload,
    });
    return { success: true };
  },

  searchGroups: async (q: string) => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("conversation_type", "group")
      .ilike("name", `%${q}%`)
      .limit(20);
    return data || [];
  },

  updateChatInfo: async (chatId: string, payload: any) => {
    const updates: any = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (Object.keys(updates).length) {
      await supabase.from("conversations").update(updates).eq("id", chatId);
    }
    return { success: true };
  },

  addGroupMembers: async (chatId: string, memberIds: string[]) => {
    const rows = memberIds.map((pid) => ({
      conversation_id: chatId,
      profile_id: pid,
      role: "member",
      status: "active",
    }));
    await supabase.from("conversation_members").upsert(rows);
    return { success: true };
  },

  removeGroupMember: async (chatId: string, memberId: string) => {
    await supabase
      .from("conversation_members")
      .update({ status: "left", left_at: new Date().toISOString() })
      .eq("conversation_id", chatId)
      .eq("profile_id", memberId);
    return { success: true };
  },

  searchUsers: async (q: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, full_name, username, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(20);
    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.display_name || p.full_name || p.username || "User",
      username: p.username || "",
      avatarUrl: p.avatar_url,
    }));
  },

  getProfile: async (userId?: string) => {
    if (!userId) {
      const cur = await getCurrentProfile();
      return cur?.profile ? formatProfileRecord(cur.profile) : null;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
      .maybeSingle();
    return data ? formatProfileRecord(data) : null;
  },

  updateProfile: async (payload: any) => {
    const cur = await getCurrentProfile();
    if (!cur?.profileId) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("profiles")
      .update({
        display_name: payload.name || payload.display_name,
        username: payload.username,
        bio: payload.bio,
        avatar_url: payload.avatarUrl || payload.avatar_url,
      })
      .eq("id", cur.profileId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? formatProfileRecord(data) : null;
  },

  updateSettings: async (payload: any) => {
    const cur = await getCurrentProfile();
    if (!cur?.profileId) return { success: false };
    await supabase.from("user_settings").upsert({ profile_id: cur.profileId, ...payload });
    return { success: true };
  },
};

export default apiService;
