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
import { auditSupabaseCall } from "../lib/supabase/logger";
import { profileCache } from "./profileCache";
import {
  formatMessageRecord,
  getCurrentProfile,
  sendConversationMessage as coreSendConversationMessage,
  getOrCreateDirectChat,
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
  const otherProfile = other?.profiles || other?.profile || null;
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
  if (!name) {
    name = isDirect ? "Direct chat" : "Group";
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
  // ---- Phase 1: Stories / Status (live RPCs) ----
  getStatuses: async () => {
    const { fetchActiveStories } = await import("./phase1Service");
    const stories = await fetchActiveStories();
    const mapped = stories.map((s) => ({
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
      privacy: payload.privacy || "everyone",
      backgroundColor: payload.backgroundGradient || payload.backgroundColor,
      durationHours: payload.durationHours || 24,
    });
    return {
      success: true,
      status: {
        id: story.id,
        userId: story.profileId,
        userName: story.authorName,
        userAvatar: story.authorAvatar,
        type: story.type,
        content: story.caption || "",
        mediaUrl: story.mediaUrl,
        backgroundGradient: story.backgroundColor,
        privacy: story.privacy,
        expiresAt: story.expiresAt,
        createdAt: story.createdAt,
        viewers: [],
        likes: [],
      },
    };
  },

  recordStatusView: async (statusId: string) => {
    const { recordStoryView } = await import("./phase1Service");
    await recordStoryView(statusId);
    return { success: true };
  },

  likeStatus: async (_statusId: string) => ({ success: true, likes: [] as string[] }),

  deleteStatus: async (statusId: string) => {
    const { error } = await supabase.from("stories").update({ expires_at: new Date().toISOString() }).eq("id", statusId);
    if (error) throw error;
    return { success: true };
  },

  // ---- Phase 1: Communities ----
  createCommunity: async (payload: {
    name: string; handle: string; description?: string; category?: string;
    bannerUrl?: string; avatarUrl?: string; isPrivate?: boolean;
  }) => {
    const { createCommunity: createViaRpc } = await import("./phase1Service");
    return await createViaRpc(payload);
  },

  getCommunities: async () => {
    const { listCommunities } = await import("./phase1Service");
    return listCommunities();
  },

  joinCommunity: async (id: string) => {
    const { joinCommunity } = await import("./phase1Service");
    await joinCommunity(id);
    return { success: true };
  },

  leaveCommunity: async (id: string) => {
    const { leaveCommunity } = await import("./phase1Service");
    await leaveCommunity(id);
    return { success: true };
  },

  searchCommunities: async (q: string) => {
    const { listCommunities } = await import("./phase1Service");
    const all = await listCommunities();
    const qq = (q || "").toLowerCase();
    return all.filter((c) => !qq || c.name.toLowerCase().includes(qq) || (c.handle || "").toLowerCase().includes(qq));
  },

  getCommunityPosts: async (communityId: string) => {
    const { listCommunityThreads } = await import("./phase1Service");
    return listCommunityThreads(communityId);
  },

  createCommunityPost: async (communityId: string, payload: { title?: string; content: string; imageUrl?: string }) => {
    const { createCommunityThread } = await import("./phase1Service");
    return createCommunityThread(communityId, payload);
  },

  likeCommunityPost: async (_communityId: string, _postId: string) => ({ success: true }),

  // ---- Messaging (profile-id aware + shapes expected by chatStore) ----
  getChats: async (): Promise<{ chats: Chat[] }> => {
    const myProfileId = await resolveMyProfileId();
    if (!myProfileId) return { chats: [] };

    // Prefer membership-filtered query with nested profiles for DM names
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
          updated_at,
          created_at,
          created_by
        )
      `)
      .eq("profile_id", myProfileId)
      .eq("status", "active")
      .is("left_at", null)
      .order("conversation_id");

    if (error) {
      console.error("[apiService.getChats]", error);
      // Fallback: list conversations via inner join
      const { data: fallback, error: fbErr } = await supabase
        .from("conversations")
        .select("*, conversation_members!inner(profile_id, unread_count, status, left_at)")
        .eq("conversation_members.profile_id", myProfileId)
        .order("updated_at", { ascending: false });
      if (fbErr) throw fbErr;
      const chats = (fallback || []).map((row: any) => mapConversationRow(row, myProfileId));
      return { chats };
    }

    const rows = data || [];
    // Enrich each conversation with all member profile ids + peer profile for DMs
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

      const mapped = mapConversationRow(
        {
          ...conv,
          conversation_members: members || [],
          unread_count: row.unread_count,
        },
        myProfileId
      );
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
    if (!conversationId) return { messages: [] };

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[apiService.getMessages]", error);
      throw error;
    }

    const messages = (data || []).map((m: any) => formatMessageRecord(m));
    return { messages };
  },

  sendMessage: async (
    conversationId: string,
    content: string,
    opts?: { type?: string; mediaUrl?: string; replyToId?: string; attachments?: any[] }
  ) => {
    // Align with messagingCore signature used by chatStore
    return coreSendConversationMessage(conversationId, {
      content,
      type: opts?.type || "text",
      attachments: opts?.attachments || (opts?.mediaUrl ? [{ url: opts.mediaUrl }] : undefined),
      replyToId: opts?.replyToId,
    });
  },

  createGroupChat: async (name: string, memberIds: string[]) => {
    const { data, error } = await supabase.rpc("create_group_conversation", {
      p_name: name,
      p_member_ids: memberIds,
    });
    if (!error && data) return { chat: data };
    throw error || new Error("create_group_conversation not available");
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
    // Soft-leave rather than hard-delete so peer keeps history
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

  reactToMessage: async (_messageId: string, emoji: string) => {
    return { success: true, emoji };
  },

  togglePinMessage: async (_messageId: string) => ({ success: true }),

  sendTypingSignal: async (_conversationId: string, _isTyping?: boolean) => ({ success: true }),

  updateChatInfo: async (conversationId: string, payload: any) => {
    const dbPayload: any = {};
    if (payload.name !== undefined) dbPayload.name = payload.name;
    if (payload.description !== undefined) dbPayload.description = payload.description;
    if (payload.avatarUrl !== undefined) dbPayload.avatar_url = payload.avatarUrl;
    if (Object.keys(dbPayload).length) {
      await supabase.from("conversations").update(dbPayload).eq("id", conversationId);
    }
    return { success: true };
  },

  addGroupMembers: async (conversationId: string, memberIds: string[]) => {
    const rows = memberIds.map((profile_id) => ({
      conversation_id: conversationId,
      profile_id,
      role: "member",
      status: "active",
    }));
    await supabase.from("conversation_members").upsert(rows);
    return { success: true };
  },

  removeGroupMember: async (conversationId: string, profileId: string) => {
    await supabase
      .from("conversation_members")
      .update({ status: "left", left_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", profileId);
    return { success: true };
  },

  // ---- Profile / users ----
  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("*").eq("auth_user_id", user.id).maybeSingle();
    return data ? formatProfileRecord(data) : null;
  },

  updateProfile: async (payload: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase.from("profiles").update(payload).eq("auth_user_id", user.id).select().single();
    if (error) throw error;
    return formatProfileRecord(data);
  },

  searchUsers: async (q: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20);
    if (error) throw error;
    return (data || []).map((p: any) => ({
      id: p.id,
      username: p.username,
      name: p.display_name || p.username,
      avatarUrl: p.avatar_url,
    }));
  },

  checkUsername: async (username: string) => {
    const { data } = await supabase.from("profiles").select("id").eq("username", username.toLowerCase()).maybeSingle();
    return { available: !data };
  },

  toggleBlockUser: async (_userId: string) => ({ success: true }),

  updateSettings: async (payload: Partial<UserSettings>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
    if (!profile) throw new Error("No profile");
    await supabase.from("user_settings").upsert({ profile_id: profile.id, ...payload });
    return { success: true };
  },

  // ---- Media ----
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

  // ---- Notifications / misc ----
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
};

export default apiService;
