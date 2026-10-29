/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Discord-style community channels. Every channel maps to a real conversation
 * (`community_channels.conversation_id`), so channel chats ride the exact same
 * E2EE pipeline as DMs and groups: messages, ticks, unread, typing, calls UI.
 */
import { supabase } from "../lib/supabase/client";

export type CommunityChannel = {
  id: string;
  communityId: string;
  name: string;
  slug: string;
  description: string | null;
  channelType: "text" | "voice";
  conversationId: string | null;
  sortOrder: number;
  isDefault: boolean;
  isArchived: boolean;
};

export type CommunityMemberRow = {
  profileId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  isModerator: boolean;
  status: string;
};

function mapChannel(r: any): CommunityChannel {
  return {
    id: r.id,
    communityId: r.community_id,
    name: r.name,
    slug: r.slug?.toString?.() ?? String(r.slug ?? r.name),
    description: r.description ?? null,
    channelType: (r.channel_type === "voice" ? "voice" : "text"),
    conversationId: r.conversation_id ?? null,
    sortOrder: r.sort_order ?? 0,
    isDefault: !!r.is_default,
    isArchived: !!r.is_archived,
  };
}

export async function listChannels(communityId: string): Promise<CommunityChannel[]> {
  const { data, error } = await supabase
    .from("community_channels")
    .select("*")
    .eq("community_id", communityId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).filter((c: any) => !c.is_archived).map(mapChannel);
}

/** Resolve (creating on first use) the conversation a channel chats in. */
export async function ensureChannelConversation(channelId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_channel_conversation", {
    p_channel_id: channelId,
  });
  if (error || !data) throw new Error(error?.message || "Failed to open channel");
  return data as string;
}

export async function createChannel(
  communityId: string,
  name: string,
  channelType: "text" | "voice",
  description?: string
): Promise<CommunityChannel> {
  const { data, error } = await supabase.rpc("create_channel", {
    p_community_id: communityId,
    p_name: name,
    p_channel_type: channelType,
    p_description: description || null,
  });
  if (error) throw new Error(error.message);
  return mapChannel(data);
}

export async function listCommunityMembers(communityId: string): Promise<CommunityMemberRow[]> {
  const { data, error } = await supabase
    .from("community_members")
    .select("profile_id, is_owner, is_moderator, status, profiles:profile_id(id, display_name, full_name, username, avatar_url)")
    .eq("community_id", communityId)
    .eq("status", "active")
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    profileId: r.profile_id,
    displayName: r.profiles?.display_name || r.profiles?.full_name || r.profiles?.username || "Member",
    username: r.profiles?.username ?? null,
    avatarUrl: r.profiles?.avatar_url ?? null,
    isOwner: !!r.is_owner,
    isModerator: !!r.is_moderator,
    status: r.status,
  }));
}

export async function getMyRole(communityId: string, profileId: string): Promise<"owner" | "moderator" | "member" | null> {
  const { data } = await supabase
    .from("community_members")
    .select("is_owner, is_moderator")
    .eq("community_id", communityId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) return null;
  if (data.is_owner) return "owner";
  if (data.is_moderator) return "moderator";
  return "member";
}

/** Live voice-room occupancy: profiles currently parked in a voice channel. */
export async function setVoicePresence(communityId: string, channelId: string | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_presence").upsert({
    profile_id: user.id,
    voice_channel_id: channelId,
    voice_community_id: channelId ? communityId : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id" });
}

export async function fetchVoiceOccupants(communityId: string, channelId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_presence")
    .select("profile_id, heartbeat_at")
    .eq("voice_channel_id", channelId)
    .gte("heartbeat_at", new Date(Date.now() - 120_000).toISOString());
  return (data || []).map((r: any) => r.profile_id);
}

/** Exit every channel conversation of a community (called on leave). */
export async function leaveChannelConversationsSafe(communityId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_channel_conversations_safe", { p_community_id: communityId });
  if (error) throw new Error(error.message);
}
