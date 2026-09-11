/**
 * Message list with sender identity (name + avatar).
 */
import { supabase } from "../lib/supabase/client";
import { formatMessageRecord } from "./messagingCore";
import type { Message } from "../types";

export async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
  if (!conversationId) return [];

  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_conversation_messages", {
    p_conversation_id: conversationId,
    p_limit: 200,
  });

  if (!rpcErr && rpcData) {
    const list = Array.isArray(rpcData) ? rpcData : [];
    return list.map((m: any) => formatMessageRecord(m));
  }

  if (rpcErr) {
    console.warn("[messageFetch] RPC fallback:", rpcErr.message);
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*, profiles:sender_id(id, display_name, full_name, username, avatar_url)")
    .eq("conversation_id", conversationId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;

  return (data || []).map((m: any) =>
    formatMessageRecord({
      ...m,
      sender_name:
        m.profiles?.display_name ||
        m.profiles?.full_name ||
        m.profiles?.username ||
        m.sender_name,
      sender_avatar: m.profiles?.avatar_url || m.sender_avatar,
    })
  );
}
