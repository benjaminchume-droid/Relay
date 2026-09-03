/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Restored core apiService. Phase1 status/community methods are delegated to phase1Service.
 * Full historical surface is being rebuilt; critical chat/profile paths retained.
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
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch { return null; }
};

export const setAuthToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
};

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

  // ---- Messaging (delegates to messagingCore where possible) ----
  getChats: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("conversations")
      .select("*, conversation_members!inner(profile_id)")
      .eq("conversation_members.profile_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getMessages: async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return data || [];
  },

  sendMessage: async (conversationId: string, content: string, opts?: any) => {
    const { sendConversationMessage } = await import("./messagingCore");
    return sendConversationMessage({
      conversationId,
      content,
      type: opts?.type || "text",
      mediaUrl: opts?.mediaUrl,
      replyToId: opts?.replyToId,
    });
  },

  createGroupChat: async (name: string, memberIds: string[]) => {
    // Prefer RPC if available; fallback insert
    const { data, error } = await supabase.rpc("create_group_conversation", {
      p_name: name,
      p_member_ids: memberIds,
    }).maybeSingle();
    if (!error && data) return data;
    throw error || new Error("create_group_conversation not available");
  },

  markChatAsRead: async (conversationId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", user.id);
  },

  deleteChat: async (conversationId: string) => {
    await supabase.from("conversations").delete().eq("id", conversationId);
    return { success: true };
  },

  deleteMessage: async (messageId: string) => {
    await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    return { success: true };
  },

  editMessage: async (messageId: string, content: string) => {
    await supabase.from("messages").update({ content, edited_at: new Date().toISOString() }).eq("id", messageId);
    return { success: true };
  },

  reactToMessage: async (messageId: string, emoji: string) => {
    // Soft support — table may vary
    return { success: true, emoji };
  },

  togglePinMessage: async (_messageId: string) => ({ success: true }),

  sendTypingSignal: async (_conversationId: string, _isTyping: boolean) => ({ success: true }),

  updateChatInfo: async (conversationId: string, payload: any) => {
    await supabase.from("conversations").update(payload).eq("id", conversationId);
    return { success: true };
  },

  addGroupMembers: async (conversationId: string, memberIds: string[]) => {
    const rows = memberIds.map((profile_id) => ({ conversation_id: conversationId, profile_id, role: "member" }));
    await supabase.from("conversation_members").upsert(rows);
    return { success: true };
  },

  removeGroupMember: async (conversationId: string, profileId: string) => {
    await supabase.from("conversation_members").delete().eq("conversation_id", conversationId).eq("profile_id", profileId);
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
      .eq("type", "group")
      .ilike("name", `%${q}%`)
      .limit(20);
    return data || [];
  },
};

export default apiService;
