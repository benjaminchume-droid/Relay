/**
 * Phase 1: Explore feed, stories, communities — live supabase1 RPCs/tables.
 */
import { supabase } from "../lib/supabase/client";
import type { Community, CommunityPost } from "../types";

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  content: string;
  mediaUrl?: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type StoryItem = {
  id: string;
  profileId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  type: "image" | "video" | "text";
  caption?: string;
  mediaUrl?: string;
  backgroundColor?: string;
  privacy: string;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
};

function mapCommunity(c: any, isJoined = false): Community {
  return {
    id: c.id,
    name: c.name,
    handle: c.slug || c.handle || c.name,
    description: c.description || "",
    category: c.category || "General",
    bannerUrl: c.banner_url || c.bannerUrl || "",
    avatarUrl: c.avatar_url || c.avatarUrl || "",
    ownerId: c.created_by || c.ownerId || "",
    isPrivate: (c.visibility && String(c.visibility) !== "public") || !!c.isPrivate,
    memberCount: c.member_count || c.memberCount || 1,
    isJoined,
    channels: c.channels || [
      { id: "c_general", name: "general", type: "text", description: "General chat and announcements" },
    ],
  };
}

function mapThreadToPost(t: any): CommunityPost {
  const author = t.author || t.profiles || {};
  return {
    id: t.id,
    communityId: t.community_id,
    channelId: t.channel_id || "c_general",
    authorId: t.author_id,
    authorName: author.display_name || author.full_name || author.username || t.display_name || "Member",
    authorAvatar: author.avatar_url || t.avatar_url || undefined,
    title: t.title || undefined,
    content: t.body || t.content || "",
    imageUrl: t.metadata?.image_url || t.image_url || undefined,
    likes: t.reaction_count || 0,
    comments: [],
    commentCount: t.reply_count || 0,
    createdAt: t.created_at,
    isLiked: false,
  };
}

export async function fetchPublicFeed(limit = 30): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc("get_public_feed", { p_limit: limit });
  if (error) {
    const { data: rows, error: e2 } = await supabase
      .from("posts")
      .select("*, profiles:author_id(username, display_name, avatar_url)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (e2) throw e2;
    return (rows || []).map((p: any) => ({
      id: p.id,
      authorId: p.author_id,
      authorName: p.profiles?.display_name || p.profiles?.username || "User",
      authorUsername: p.profiles?.username,
      authorAvatar: p.profiles?.avatar_url,
      content: p.content || "",
      mediaUrl: p.media_url || undefined,
      likeCount: p.like_count || 0,
      commentCount: p.comment_count || 0,
      likedByMe: false,
      createdAt: p.created_at,
    }));
  }
  const list = Array.isArray(data) ? data : [];
  return list.map((p: any) => ({
    id: p.id,
    authorId: p.author_id,
    authorName: p.display_name || p.username || "User",
    authorUsername: p.username,
    authorAvatar: p.avatar_url || undefined,
    content: p.content || "",
    mediaUrl: p.media_url || undefined,
    likeCount: p.like_count || 0,
    commentCount: p.comment_count || 0,
    likedByMe: !!p.liked_by_me,
    createdAt: p.created_at,
  }));
}

export async function createPublicPost(content: string, mediaUrl?: string): Promise<FeedPost> {
  const { data, error } = await supabase.rpc("create_public_post", {
    p_content: content,
    p_media_url: mediaUrl || null,
    p_visibility: "public",
  });
  if (error) throw error;
  const p = data as any;
  return {
    id: p.id,
    authorId: p.author_id,
    authorName: "You",
    content: p.content || "",
    mediaUrl: p.media_url || undefined,
    likeCount: p.like_count || 0,
    commentCount: p.comment_count || 0,
    likedByMe: false,
    createdAt: p.created_at,
  };
}

export async function togglePostLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  const { data, error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
  if (error) throw error;
  return { liked: !!(data as any).liked, likeCount: (data as any).like_count || 0 };
}

export async function fetchActiveStories(): Promise<StoryItem[]> {
  const { data, error } = await supabase.rpc("get_active_stories");
  if (error) {
    const { data: rows, error: e2 } = await supabase
      .from("stories")
      .select("*, profiles:profile_id(username, display_name, avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (e2) throw e2;
    return (rows || []).map((s: any) => ({
      id: s.id,
      profileId: s.profile_id,
      authorName: s.profiles?.display_name || s.profiles?.username || "User",
      authorUsername: s.profiles?.username,
      authorAvatar: s.profiles?.avatar_url,
      type: s.story_type || "text",
      caption: s.caption || undefined,
      mediaUrl: s.media_url || undefined,
      backgroundColor: s.background_color || undefined,
      privacy: s.privacy || "everyone",
      viewCount: s.view_count || 0,
      expiresAt: s.expires_at,
      createdAt: s.created_at,
    }));
  }
  const list = Array.isArray(data) ? data : [];
  return list.map((s: any) => ({
    id: s.id,
    profileId: s.profile_id,
    authorName: s.display_name || s.username || "User",
    authorUsername: s.username,
    authorAvatar: s.avatar_url || undefined,
    type: s.story_type || "text",
    caption: s.caption || undefined,
    mediaUrl: s.media_url || undefined,
    backgroundColor: s.background_color || undefined,
    privacy: s.privacy || "everyone",
    viewCount: s.view_count || 0,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
  }));
}

export async function createStory(payload: {
  type?: "image" | "video" | "text";
  caption?: string;
  mediaUrl?: string;
  privacy?: string;
  backgroundColor?: string;
  durationHours?: number;
}): Promise<StoryItem> {
  const { data, error } = await supabase.rpc("create_story", {
    p_story_type: payload.type || "text",
    p_caption: payload.caption || null,
    p_media_url: payload.mediaUrl || null,
    p_privacy: payload.privacy || "everyone",
    p_background_color: payload.backgroundColor || null,
    p_duration_hours: payload.durationHours || 24,
  });
  if (error) throw error;
  const s = data as any;
  return {
    id: s.id,
    profileId: s.profile_id,
    authorName: "You",
    type: s.story_type || "text",
    caption: s.caption || undefined,
    mediaUrl: s.media_url || undefined,
    backgroundColor: s.background_color || undefined,
    privacy: s.privacy || "everyone",
    viewCount: 0,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
  };
}

export async function recordStoryView(storyId: string): Promise<void> {
  await supabase.rpc("record_story_view", { p_story_id: storyId });
}

export async function listCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  let joined = new Set<string>();
  if (uid) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .or(`id.eq.${uid},auth_user_id.eq.${uid}`)
      .maybeSingle();
    if (profile?.id) {
      const { data: mem } = await supabase
        .from("community_members")
        .select("community_id")
        .eq("profile_id", profile.id)
        .eq("status", "active");
      joined = new Set((mem || []).map((m: any) => m.community_id));
    }
  }
  return (data || []).map((c: any) => mapCommunity(c, joined.has(c.id)));
}

export async function createCommunity(payload: {
  name: string;
  handle: string;
  description?: string;
  category?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
}): Promise<Community> {
  const { data, error } = await supabase.rpc("create_community", {
    p_name: payload.name,
    p_slug: payload.handle.replace(/^@+/, "").toLowerCase(),
    p_description: payload.description || null,
    p_category: payload.category || "General",
    p_is_private: !!payload.isPrivate,
    p_avatar_url: payload.avatarUrl || null,
    p_banner_url: payload.bannerUrl || null,
  });
  if (error) throw error;
  return mapCommunity(data, true);
}

export async function joinCommunity(id: string): Promise<void> {
  const { error } = await supabase.rpc("join_community", { p_community_id: id });
  if (error) throw error;
}

export async function leaveCommunity(id: string): Promise<void> {
  const { error } = await supabase.rpc("leave_community", { p_community_id: id });
  if (error) throw error;
}

export async function listCommunityThreads(communityId: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from("community_threads")
    .select("*, profiles:author_id(username, display_name, avatar_url)")
    .eq("community_id", communityId)
    .neq("status", "deleted")
    .order("last_activity_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((t: any) => mapThreadToPost({ ...t, author: t.profiles }));
}

export async function createCommunityThread(
  communityId: string,
  payload: { title?: string; content: string; imageUrl?: string }
): Promise<CommunityPost> {
  const { data, error } = await supabase.rpc("create_community_thread", {
    p_community_id: communityId,
    p_title: payload.title || null,
    p_body: payload.content,
    p_thread_type: "discussion",
    p_channel_id: null,
  });
  if (error) throw error;
  const t = data as any;
  if (payload.imageUrl) {
    await supabase
      .from("community_threads")
      .update({ metadata: { image_url: payload.imageUrl } })
      .eq("id", t.id);
  }
  return mapThreadToPost({ ...t, metadata: { image_url: payload.imageUrl } });
}
