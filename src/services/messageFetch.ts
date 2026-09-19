/**
 * Message list with sender identity (name + avatar) + reply previews.
 */
import { supabase } from "../lib/supabase/client";
import { formatMessageRecord } from "./messagingCore";
import type { Message } from "../types";

export async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
  if (!conversationId) return [];

  let rows: any[] = [];

  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_conversation_messages", {
    p_conversation_id: conversationId,
    p_limit: 200,
  });

  if (!rpcErr && rpcData) {
    rows = Array.isArray(rpcData) ? rpcData : [];
  } else {
    if (rpcErr) console.warn("[messageFetch] RPC fallback:", rpcErr.message);
    const { data, error } = await supabase
      .from("messages")
      .select("*, profiles:sender_id(id, display_name, full_name, username, avatar_url)")
      .eq("conversation_id", conversationId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    rows = (data || []).map((m: any) => ({
      ...m,
      sender_name:
        m.profiles?.display_name ||
        m.profiles?.full_name ||
        m.profiles?.username ||
        m.sender_name,
      sender_avatar: m.profiles?.avatar_url || m.sender_avatar,
    }));
  }

  // Index for reply hydration
  const byId = new Map<string, any>();
  for (const m of rows) {
    if (m?.id) byId.set(String(m.id), m);
  }

  return rows.map((m: any) => {
    const replyId = m.reply_to_message_id || m.replyToId;
    if (replyId && byId.has(String(replyId))) {
      const parent = byId.get(String(replyId));
      const parentSender =
        parent.sender_name ||
        parent.profiles?.display_name ||
        parent.profiles?.full_name ||
        parent.profiles?.username ||
        parent.senderName ||
        "Reply";
      const parentContent =
        parent.content ||
        (parent.message_type === "voice_note" || parent.message_type === "voice"
          ? "Voice note"
          : parent.message_type === "image"
            ? "Photo"
            : "Message");
      m = {
        ...m,
        reply_to_sender_name: parentSender,
        reply_preview: parentContent,
        replyToMessage: {
          id: parent.id,
          senderName: parentSender,
          content: parentContent,
        },
      };
    }
    return formatMessageRecord(m);
  });
}
