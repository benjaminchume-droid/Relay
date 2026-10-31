/**
 * Core messaging helpers aligned to live supabase1 Relay schema.
 * Used by apiService for DM create + send.
 */
import { supabase } from "../lib/supabase/client";
import { profileCache } from "./profileCache";
import { formatProfileRecord } from "../lib/profileFormat";
import type { Chat, Message } from "../types";
import { encryptFor, encryptFanout, isEnvelope } from "./crypto/cryptoService";
import { ownPlaintextRemember, ownMediaRemember } from "./messageFetch";
import { encodePayload, type MsgPayload } from "./crypto/mediaDecryptor";

const peerIdCache = new Map<string, string>();

/** Resolve the other participant of a conversation (direct chats). */
export async function resolveConversationPeer(
  conversationId: string,
  myProfileId: string
): Promise<string | null> {
  const peers = await resolveConversationPeers(conversationId, myProfileId, 1);
  return peers[0] || null;
}

/** Resolve ALL other active members of a conversation (groups / channels). */
export async function resolveConversationPeers(
  conversationId: string,
  myProfileId: string,
  limit = 500
): Promise<string[]> {
  const cacheKey = `${conversationId}:${myProfileId}`;
  if (limit === 1) {
    const hit = peerIdCache.get(cacheKey);
    if (hit) return [hit];
  }
  try {
    const { data } = await supabase
      .from("conversation_members")
      .select("profile_id")
      .eq("conversation_id", conversationId)
      .neq("profile_id", myProfileId)
      .eq("status", "active")
      .limit(limit);
    const peers = (data || []).map((r: any) => r.profile_id).filter(Boolean);
    if (peers.length === 1) peerIdCache.set(cacheKey, peers[0]);
    return peers;
  } catch {
    return [];
  }
}

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
  const rawStatus = (m.send_status || m.delivery_state || m.status || "").toString().toLowerCase();
  let deliveryState: Message["deliveryState"] = "sent";
  if (rawStatus === "read" || rawStatus === "seen") deliveryState = "read";
  else if (rawStatus === "delivered") deliveryState = "delivered";
  else if (rawStatus === "sending" || rawStatus === "pending") deliveryState = "sending";
  else if (rawStatus === "failed" || rawStatus === "error") deliveryState = "failed";
  else deliveryState = "sent";

  const rawType = (m.message_type || m.type || "text").toString().toLowerCase();
  const normalizedType =
    rawType === "voice_note" || rawType === "audio" ? "voice"
    : rawType === "photo" ? "image"
    : rawType || "text";

  const mediaUrl = m.media_url || m.attachments?.[0]?.url || null;
  const attDuration = m.duration_seconds ?? m.attachments?.[0]?.duration ?? m.attachments?.[0]?.duration_seconds;

  let replyToMessage = m.replyToMessage || m.reply_to_message || undefined;
  if (!replyToMessage && m.reply_to_message_id) {
    const preview = m.reply_preview || m.reply_to_preview || m.replyToContent || "";
    const replyName = m.reply_to_sender_name || m.replyToSenderName || "Reply";
    replyToMessage = {
      id: m.reply_to_message_id,
      senderName: replyName,
      content: preview || "Original message",
    };
  }

  return {
    id: m.id,
    chatId: m.conversation_id || m.chat_id || "",
    senderId: m.sender_id || m.created_by || "",
    senderName:
      m.sender_name ||
      sender.display_name ||
      sender.full_name ||
      sender.username ||
      "User",
    senderAvatar: m.sender_avatar || sender.avatar_url || undefined,
    type: normalizedType as any,
    content: m.content || "",
    mediaUrl: mediaUrl || undefined,
    attachments: mediaUrl
      ? [
          {
            id: "att_" + m.id,
            type:
              normalizedType === "image"
                ? "image"
                : normalizedType === "voice"
                  ? "voice"
                  : "file",
            url: mediaUrl,
            fileName: m.file_name || m.attachments?.[0]?.fileName || "attachment",
            duration: attDuration,
          },
        ]
      : m.attachments || undefined,
    timestamp: m.created_at || new Date().toISOString(),
    deliveryState,
    isEdited: m.is_edited || false,
    isDeleted: m.is_deleted || false,
    replyToId: m.reply_to_message_id || undefined,
    replyToMessage,
    replyPreview: m.reply_preview || m.reply_to_preview || undefined,
  } as Message;
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

  // ---- Signal-level E2EE: build plaintext payload, ship ciphertext ----
  // Recipients: an explicitly targeted user (dm_ ids / user id chat ids) or every
  // other active member of the conversation (groups, communities, channels).
  let peerIds: string[] = [];
  if (targetUserId && UUID_RE.test(targetUserId)) {
    peerIds = [await resolveExactProfileId(targetUserId)];
  } else if (!targetUserId) {
    peerIds = await resolveConversationPeers(targetConvId, profileId);
  }
  const peerId = peerIds[0] || null;

  let wireContent: string | null = payload.content || null;
  let envelopePayload: MsgPayload | null = null;
  let plaintextPreview = payload.content || "";

  if (peerId && mediaUrl) {
    const att: any = payload.attachments?.[0] || {};
    envelopePayload = {
      k: "m",
      u: mediaUrl,
      key: att.mediaKey || "",
      mime: att.mimeType || "application/octet-stream",
      name: fileName || att.name || "attachment",
      dur: att.duration ?? undefined,
    };
    plaintextPreview = mappedType === "image" ? "Photo" : mappedType === "voice_note" ? "Voice note" : "Attachment";
  } else if (peerId && payload.content != null) {
    envelopePayload = { k: "t", t: payload.content };
  }

  if (peerId && envelopePayload) {
    try {
      if (peerIds.length <= 1) {
        // DM — single envelope, R1 (compact, unchanged wire format)
        wireContent = await encryptFor(profileId, targetConvId, peerId, encodePayload(envelopePayload));
      } else {
        // Group / community / channel — R2 fan-out: one envelope per recipient so
        // EVERY member can decrypt (not just one .limit(1) pick).
        wireContent = await encryptFanout(profileId, targetConvId, peerIds, encodePayload(envelopePayload));
      }
    } catch (e) {
      console.error("[e2ee] encrypt failed — message NOT sent (refusing plaintext fallback)", e);
      throw new Error("Encryption failed — message was not sent. Try again.");
    }
  }

  const { data, error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: UUID_RE.test(targetConvId) ? targetConvId : null,
    p_recipient_profile_id: targetUserId,
    p_content: wireContent,
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
  msgFormatted.deliveryState = "sent";
  // sender sees their own plaintext/preview immediately (ciphertext stays in DB)
  if (isEnvelope(msgFormatted.content as any)) {
    (msgFormatted as any)._encrypted = true;
    msgFormatted.content = plaintextPreview;
  }
  // remember our own plaintext so history refetches stay readable on this device
  if (msgFormatted.id) ownPlaintextRemember(String(msgFormatted.id), plaintextPreview || '');
  if (envelopePayload?.k === "m") {
    (msgFormatted as any)._mediaKey = envelopePayload.key;
    const atts = (msgFormatted.attachments || []) as any[];
    for (const a of atts) a.mediaKey = envelopePayload.key;
    // own voice notes: the ratchet can't decrypt our own ciphertext after a
    // refetch — remember (url, key, mime) locally so WE can still play them
    ownMediaRemember(String(msgFormatted.id), {
      url: envelopePayload.u,
      key: envelopePayload.key,
      mime: envelopePayload.mime,
    });
    (msgFormatted as any)._mime = envelopePayload.mime;
    // Decrypt our own media NOW — without this the just-sent voice note /
    // photo points at the raw ciphertext blob and playback is broken until
    // the next full refetch.
    void import("./messageFetch").then(({ scheduleMediaDecrypt }) => scheduleMediaDecrypt(msgFormatted));
  }

  let targetName = "";
  let targetAvatar: string | undefined;
  if (targetUserId) {
    const cached = profileCache.get(targetUserId);
    if (cached) {
      targetName = cached.name || (cached.username ? `@${cached.username}` : "");
      targetAvatar = cached.avatarUrl;
    }
    if (!targetName) {
      try {
        const { data: p } = await supabase
          .from("profiles")
          .select("display_name, full_name, username, avatar_url")
          .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`)
          .maybeSingle();
        if (p) {
          targetName = p.display_name || p.full_name || (p.username ? `@${p.username}` : "");
          targetAvatar = p.avatar_url || undefined;
          if (p.username || p.display_name) {
            profileCache.set({
              id: targetUserId,
              name: targetName,
              username: p.username,
              avatarUrl: targetAvatar,
            } as any);
          }
        }
      } catch {}
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

/**
 * Edit a text message, end-to-end encrypted.
 *
 * The row content on the wire is always ciphertext — the new text is
 * re-encrypted with the SAME Signal session used for sends (R1 envelope for a
 * DM, R2 fan-out for groups/channels), so no plaintext ever reaches the
 * backend. Receivers decrypt the edited content through the normal
 * decryptMessages pipeline (the UPDATE realtime event or the next refetch).
 */
export async function editMessageEncrypted(
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const current = await getCurrentProfile();
  if (!current) throw new Error("Not authenticated");
  const { profileId } = current;

  let targetUserId: string | null = null;
  let targetConvId = chatId;
  if (chatId.startsWith("dm_")) {
    const parts = chatId.replace("dm_", "").split("_");
    targetUserId = parts.find((p) => p !== profileId) || parts[0] || null;
    if (targetUserId) targetConvId = await getOrCreateDirectChat(profileId, targetUserId);
  } else if (!UUID_RE.test(chatId)) {
    targetUserId = chatId;
    targetConvId = await getOrCreateDirectChat(profileId, targetUserId);
  }

  let peerIds: string[] = [];
  if (targetUserId && UUID_RE.test(targetUserId)) {
    peerIds = [await resolveExactProfileId(targetUserId)];
  } else {
    peerIds = await resolveConversationPeers(targetConvId, profileId);
  }
  if (!peerIds.length) throw new Error("No recipient to encrypt the edit for");

  const wireContent =
    peerIds.length <= 1
      ? await encryptFor(profileId, targetConvId, peerIds[0], encodePayload({ k: "t", t: newText } as MsgPayload))
      : await encryptFanout(profileId, targetConvId, peerIds, encodePayload({ k: "t", t: newText } as MsgPayload));

  // remember our own plaintext for this row so refetches stay readable
  ownPlaintextRemember(String(messageId), newText);

  const { error } = await supabase
    .from("messages")
    .update({ content: wireContent, is_edited: true, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", profileId);
  if (error) throw error;
}
