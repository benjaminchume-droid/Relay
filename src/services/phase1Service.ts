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
  viewCount?: number;
  likedByMe: boolean;
  createdAt: string;
};

export type PostComment = {
  id: string;
  postId: string;
  profileId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
};

export type StoryReply = {
  id: string;
  storyId: string;
  profileId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
};

export type StoryItem = {
  id: string;
  profileId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatar?: string;
  type: "image" | "video" | "text" | "voice";
  caption?: string;
  mediaUrl?: string;
  backgroundColor?: string;
  privacy: string;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
  durationMs?: number;
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
    likesCount: t.reaction_count || 0,
    comments: [],
    commentsCount: t.reply_count || 0,
    timestamp: t.created_at,
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
      viewCount: p.view_count || 0,
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
    viewCount: p.view_count || 0,
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
    viewCount: p.view_count || 0,
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
      durationMs: s.media_duration_ms ?? undefined,
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
    durationMs: s.media_duration_ms ?? undefined,
  }));
}

export async function createStory(payload: {
  type?: "image" | "video" | "text" | "voice";
  caption?: string;
  mediaUrl?: string;
  privacy?: string;
  backgroundColor?: string;
  durationHours?: number;
  durationMs?: number;
  textColor?: string;
  fontName?: string;
}): Promise<StoryItem> {
  const { data, error } = await supabase.rpc("create_story", {
    p_story_type: payload.type || "text",
    p_caption: payload.caption || null,
    p_media_url: payload.mediaUrl || null,
    p_privacy: payload.privacy || "everyone",
    p_background_color: payload.backgroundColor || null,
    p_duration_hours: payload.durationHours || 24,
    p_duration_ms: payload.durationMs ?? null,
    p_text_color: payload.textColor ?? null,
    p_font_name: payload.fontName ?? null,
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

export async function recordPostView(postId: string): Promise<void> {
  try {
    await supabase.rpc("record_post_view", { p_post_id: postId });
  } catch { /* view counting is best-effort */ }
}

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  // NOTE: no embedded join here — post_comments.profile_id had no FK to
  // profiles, so the embed threw (PGRST200), the error was swallowed upstream
  // and the sheet showed "No replies yet" forever. Two plain queries + stitch
  // cannot fail that way. (FK added server-side too — this stays as insurance.)
  const { data, error } = await supabase
    .from("post_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((c: any) => c.profile_id).filter(Boolean)));
  const nameById = new Map<string, { name: string; username?: string; avatarUrl?: string }>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids as string[]);
    for (const p of profs || []) {
      nameById.set((p as any).id, {
        name: (p as any).display_name || (p as any).username || "User",
        username: (p as any).username || undefined,
        avatarUrl: (p as any).avatar_url || undefined,
      });
    }
  }
  return rows.map((c: any) => {
    const prof = nameById.get(c.profile_id);
    return {
      id: c.id,
      postId: c.post_id,
      profileId: c.profile_id,
      authorName: prof?.name || "User",
      authorUsername: prof?.username,
      authorAvatar: prof?.avatarUrl,
      content: c.content || "",
      createdAt: c.created_at,
    };
  });
}

export async function createPostComment(postId: string, content: string): Promise<PostComment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();
  const pid = (profile as any)?.id || user.id;
  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, profile_id: pid, content })
    .select()
    .single();
  if (error) throw error;
  try { await supabase.rpc("increment_post_comment_count", { p_post_id: postId }); } catch { /* count is advisory */ }
  return {
    id: data.id,
    postId: data.post_id,
    profileId: data.profile_id,
    authorName: (profile as any)?.display_name || (profile as any)?.username || "You",
    authorUsername: (profile as any)?.username,
    authorAvatar: (profile as any)?.avatar_url || undefined,
    content: data.content,
    createdAt: data.created_at,
  };
}

export async function fetchStoryReplies(storyId: string): Promise<StoryReply[]> {
  const { data, error } = await supabase.rpc("list_story_replies", { p_story_id: storyId });
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  return list.map((r: any) => ({
    id: r.reply_id,
    storyId,
    profileId: r.profile_id,
    authorName: r.display_name || r.username || "User",
    authorUsername: r.username,
    authorAvatar: r.avatar_url || undefined,
    content: r.reply_content,
    createdAt: r.created_at,
  }));
}

export async function createStoryReply(storyId: string, content: string): Promise<StoryReply> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();
  const { data, error } = await supabase.rpc("create_story_reply", {
    p_story_id: storyId,
    p_content: content,
  });
  if (error) throw error;
  return {
    id: (data as any).id,
    storyId,
    profileId: (data as any).profile_id,
    authorName: (profile as any)?.display_name || (profile as any)?.username || "You",
    authorUsername: (profile as any)?.username,
    authorAvatar: (profile as any)?.avatar_url || undefined,
    content: (data as any).content,
    createdAt: (data as any).created_at,
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

/** People tab: linked contacts (your people), not a search. */
export async function fetchMyContacts(): Promise<Array<{ id: string; name: string; username?: string; avatarUrl?: string }>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase
    .from("profiles")
    .select("id")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!me?.id) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("linked_profile_id, profiles:linked_profile_id(id, username, display_name, avatar_url)")
    .eq("owner_profile_id", me.id)
    .not("linked_profile_id", "is", null)
    .limit(100);
  if (error) return [];
  return (data || [])
    .map((r: any) => r.profiles)
    .filter(Boolean)
    .map((p: any) => ({ id: p.id, name: p.display_name || p.username || "User", username: p.username, avatarUrl: p.avatar_url || undefined }));
}

export type RosterPerson = {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  via: "chat" | "group";
};

/**
 * The ONLY people a search on Explore may return: users I already share a
 * conversation with — either an accepted direct chat ("actively chatting")
 * or any group/community/channel conversation we are both members of.
 */
export async function fetchMessagingRoster(): Promise<RosterPerson[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase
    .from("profiles")
    .select("id")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();
  const myId = (me as any)?.id;
  if (!myId) return [];

  const { data, error } = await supabase
    .from("conversation_members")
    .select("profile_id, conversation_id, request_status, conversations(conversation_type), profiles:profile_id(id, username, display_name, avatar_url)")
    .eq("status", "active")
    .neq("profile_id", myId)
    .limit(500);
  if (error) return [];

  const byId = new Map<string, RosterPerson>();
  for (const row of data || []) {
    const conv: any = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
    const p: any = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!p?.id) continue;
    const convType = String(conv?.conversation_type || "direct").toLowerCase();
    const accepted = String(row.request_status || "accepted").toLowerCase() === "accepted";
    const via: "chat" | "group" = convType === "group" || convType === "community" || convType === "channel" ? "group" : "chat";
    if (via === "chat" && !accepted) continue; // pending requests are NOT searchable
    const existing = byId.get(p.id);
    if (existing) {
      if (existing.via === "chat") continue; // keep the strongest signal
      existing.via = via;
      continue;
    }
    byId.set(p.id, {
      id: p.id,
      name: p.display_name || p.username || "User",
      username: p.username || undefined,
      avatarUrl: p.avatar_url || undefined,
      via,
    });
  }
  return Array.from(byId.values());
}

/** Contact-only story feed: stories authored by me or by my contacts.
 *  "Contacts" = messaging roster (people I actively chat with / share a group
 *  with) ∪ linked contacts — the chat roster is what actually matters. */
export async function fetchContactStories(): Promise<StoryItem[]> {
  const all = await fetchActiveStories();
  try {
    const ids = new Set<string>();
    const [contacts, roster] = await Promise.all([
      fetchMyContacts().catch(() => [] as Array<{ id: string }>),
      fetchMessagingRoster().catch(() => [] as Array<{ id: string }>),
    ]);
    for (const c of [...(contacts || []), ...(roster || [])]) {
      if (c?.id) ids.add(c.id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    let myProfileId: string | null = null;
    if (user) {
      const { data: me } = await supabase
        .from("profiles")
        .select("id")
        .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle();
      myProfileId = (me as any)?.id || null;
    }
    if (myProfileId) ids.add(myProfileId);
    return all.filter((s) => ids.has(s.profileId));
  } catch {
    return all;
  }
}
