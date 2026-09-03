/**
 * Core messaging helpers aligned to live supabase1 Relay schema.
 * Used by apiService for DM create + send.
 */
import { supabase } from "../lib/supabase/client";
import { profileCache } from "./profileCache";
import { formatProfileRecord } from "../store/authStore";
import type { Chat, Message } from "../types";

export function mapUiMessageType(type?: string): string {
  const t = (type || "text").toLowerCase();
  if (t === "voice" || t === "voicenote" || t === "voice-note") return "voice_note";
  if (t === "photo") return "image";
  const allowed = new Set([
    "text", "image", "video", "audio", "voice_note", "document", "file",
    "gif", "sticker", "location", "contact", "system",
  ]);
  return allowed.has(t) ? t : "text";
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pendingDirectChatPromises = new Map<string, Promise<string>>();

export async function getCurrentProfile(): Promise<
  { sbUser: any; profile: any; profileId: string } | null
> {
  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();
  if (!sbUser) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .or(`auth_user_id.eq.${sbUser.id},id.eq.${sbUser.id}`)
    .maybeSingle();

  if (profile) profileCache.set(formatProfileRecord(profile));
  return { sbUser, profile, profileId: profile?.id || sbUser.id };
}

async function resolveExactProfileId(inputUserId: string): Promise<string> {
  if (!inputUserId) return inputUserId;
  const cached = profileCache.get(inputUserId);
  if (cached?.id) return cached.id;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .or(`id.eq.${inputUserId},auth_user_id.eq.${inputUserId}`)
      .maybeSingle();
    if (data?.id) return data.id;
  } catch (e) {
    console.warn("[resolveExactProfileId]", e);
  }
  return inputUserId;
}

export async function getOrCreateDirectChat(
  currentUserId: string,
  targetUserId: string
): Promise<string> {
  if (!currentUserId || !targetUserId) {
    throw new Error("Missing user IDs for direct chat");
  }
  const realCurrentUserId = await resolveExactProfileId(currentUserId);
  const realTargetUserId = await resolveExactProfileId(targetUserId);
  if (realCurrentUserId === realTargetUserId) {
    throw new Error("Cannot start a chat with yourself");
  }
  const pairKey = [realCurrentUserId, realTargetUserId].sort().join("_");
  if (pendingDirectChatPromises.has(pairKey)) {
    return pendingDirectChatPromises.get(pairKey)!;
  }
  const promise = (async () => {
    const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
      p_other_profile_id: realTargetUserId,
    });
    if (error || !data) {
      throw new Error(error?.message || "Failed to open conversation");
    }
    return data as string;
  })();
  pendingDirectChatPromises.set(pairKey, promise);
  try {
    return await promise;
  } finally {
    pendingDirectChatPromises.delete(pairKey);
  }
}

export function formatMessageRecord(m: any): Message {
  if (!m) return {} as Message;
  const sender = m.sender || m.profiles || {};
  return {
    id: m.id,
    chatId: m.conversation_id || m.chat_id || "",
    senderId: m.sender_id || m.created_by || "",
    senderName:
      sender.display_name ||
      sender.full_name ||
      sender.username ||
      m.sender_name ||
      "User",
    senderAvatar: sender.avatar_url || m.sender_avatar || undefined,
    type: m.message_type || m.type || "text",
    content: m.content || "",
    attachments: m.media_url
      ? [
          {
            id: "att_" + m.id,
            type:
              m.message_type === "image"
                ? "image"
                : m.message_type === "voice_note" || m.message_type === "voice"
                  ? "voice"
                  : "file",
            url: m.media_url,
            fileName: m.file_name || "attachment",
            duration: m.duration_seconds,
          },
        ]
      : m.attachments || undefined,
    timestamp: m.created_at || new Date().toISOString(),
    deliveryState: m.send_status === "sent" ? "sent" : "read",
    isEdited: m.is_edited || false,
    isDeleted: m.is_deleted || false,
    replyToId: m.reply_to_message_id || undefined,
  };
}

export async function sendConversationMessage(
  chatId: string,
  payload: any
): Promise<{ message: Message; chat: Chat }> {
  const current = await getCurrentProfile();
  if (!current) throw new Error("Not authenticated");
  const { profileId } = current;

  let targetUserId: string | null = null;
  let targetConvId = chatId;

  if (chatId.startsWith("dm_")) {
    const parts = chatId.replace("dm_", "").split("_");
    targetUserId = parts.find((p) => p !== profileId) || parts[0] || null;
    if (targetUserId) {
      targetConvId = await getOrCreateDirectChat(profileId, targetUserId);
    }
  } else if (!UUID_RE.test(chatId)) {
    targetUserId = chatId;
    targetConvId = await getOrCreateDirectChat(profileId, targetUserId);
  }

  const mappedType = mapUiMessageType(payload.type);
  const mediaUrl = payload.attachments?.[0]?.url || null;
  const fileName = payload.attachments?.[0]?.fileName || null;

  const { data, error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: UUID_RE.test(targetConvId) ? targetConvId : null,
    p_recipient_profile_id: targetUserId,
    p_content: payload.content || null,
    p_message_type: mappedType,
    p_reply_to_message_id: payload.replyToId || null,
    p_media_url: mediaUrl,
    p_file_name: fileName,
    p_is_forwarded: !!payload.isForwarded,
  });

  if (error || !data) {
    throw new Error(error?.message || "Failed to send message");
  }

  const confirmedMsg = data as any;
  const realConvId = confirmedMsg.conversation_id || targetConvId;
  const msgFormatted = formatMessageRecord(confirmedMsg);
  msgFormatted.chatId = realConvId;

  let targetName = "";
  let targetAvatar: string | undefined;
  if (targetUserId) {
    const cached = profileCache.get(targetUserId);
    if (cached) {
      targetName = cached.name || (cached.username ? `@${cached.username}` : "");
      targetAvatar = cached.avatarUrl;
    }
  }
  if (!targetName) {
    targetName = targetUserId
      ? `@${String(targetUserId).substring(0, 8)}`
      : "Conversation";
  }

  const chat: Chat = {
    id: realConvId,
    name: targetName,
    type: targetUserId ? "direct" : "group",
    avatarUrl: targetAvatar,
    participants: [profileId, ...(targetUserId ? [targetUserId] : [])],
    lastMessage: {
      text:
        payload.content ||
        (mappedType === "image"
          ? "Photo"
          : mappedType === "voice_note"
            ? "Voice Note"
            : "Attachment"),
      timestamp: confirmedMsg.created_at || new Date().toISOString(),
      senderId: profileId,
      deliveryState: "sent",
    },
  };

  return { message: msgFormatted, chat };
}
