/**
 * Message list with sender identity (name + avatar) + reply previews.
 * E2EE: decrypts ratchet envelopes in place; text synchronously, media lazily.
 */
import { supabase } from "../lib/supabase/client";
import { formatMessageRecord } from "./messagingCore";
import { decryptFor, isEnvelope, parseEnvelope } from "./crypto/cryptoService";
import { decodePayload, getDecryptedMediaUrl } from "./crypto/mediaDecryptor";
import type { Message } from "../types";

/** Kick off lazy media decryption; resolves to a blob URL when ready. */
export function scheduleMediaDecrypt(msg: Message): void {
  const anyMsg = msg as any;
  const key = anyMsg._mediaKey;
  const url = anyMsg.mediaUrl || anyMsg.attachments?.[0]?.url;
  if (!key || !url || anyMsg._mediaDecrypting) return;
  anyMsg._mediaDecrypting = true;
  getDecryptedMediaUrl(String(msg.id), url, key)
    .then((blobUrl) => {
      anyMsg.mediaUrl = blobUrl;
      if (anyMsg.attachments?.[0]) anyMsg.attachments[0].url = blobUrl;
      anyMsg._mediaReady = true;
      window.dispatchEvent(new CustomEvent("relay:media-ready", { detail: { messageId: msg.id, chatId: msg.chatId } }));
    })
    .catch((e) => {
      console.warn("[media decrypt]", e);
      anyMsg._mediaDecrypting = false;
    });
}

// Decrypted-message memo: the double-ratchet chain only moves forward, so the
// SAME envelope can never be decrypted twice (history refetches, realtime+fetch
// double delivery). Remember plaintext per message id so refetches stay readable.
const PT_MEMO_KEY = 'relay_pt_memo_v1';

function ptMemoLoad(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PT_MEMO_KEY) || '{}'); } catch { return {}; }
}

function ptMemoRemember(messageId: string, text: string): void {
  try {
    if (!messageId || !text) return;
    const all = ptMemoLoad();
    const ids = Object.keys(all);
    if (ids.length > 500) {
      for (const k of ids.slice(0, ids.length - 500)) delete all[k];
    }
    all[messageId] = text;
    localStorage.setItem(PT_MEMO_KEY, JSON.stringify(all));
  } catch { /* storage optional */ }
}

// Sender-side plaintext memory: own outgoing ciphertext can never be decrypted
// locally (no receiving chain for self), and running the ratchet on self-ciphertext
// would corrupt the session. Keep the plaintext keyed by message id instead.
const OWN_PT_KEY = 'relay_own_plaintext_v1';

function ownPlaintextLoad(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OWN_PT_KEY) || '{}'); } catch { return {}; }
}

export function ownPlaintextRemember(messageId: string, text: string): void {
  try {
    const all = ownPlaintextLoad();
    const ids = Object.keys(all);
    if (ids.length > 300) {
      for (const k of ids.slice(0, ids.length - 300)) delete all[k];
    }
    all[messageId] = text;
    localStorage.setItem(OWN_PT_KEY, JSON.stringify(all));
  } catch { /* storage optional */ }
}

function ownPlaintextRecall(messageId: string): string | null {
  try { return ownPlaintextLoad()[messageId] ?? null; } catch { return null; }
}

/** Decrypt every envelope in a page of messages (mutates in place). */
export async function decryptMessages(
  myProfileId: string,
  conversationId: string,
  msgs: Message[]
): Promise<void> {
  for (const msg of msgs) {
    const raw = (msg as any).content;
    if (!isEnvelope(raw)) continue;
    (msg as any)._encrypted = true;
    // Own outgoing messages: NEVER run the ratchet on them (no receiving chain for
    // self — it would corrupt the session state). Recall the stored plaintext.
    if (msg.senderId && msg.senderId === myProfileId) {
      const remembered = ownPlaintextRecall(String(msg.id));
      msg.content = remembered ?? 'Encrypted message';
      continue;
    }
    // Already decrypted before (realtime echo, earlier refetch, earlier session)?
    // The ratchet chain can't be rewound — use the memo instead.
    const memoed = ptMemoLoad()[String(msg.id)];
    if (memoed != null) {
      msg.content = memoed;
      continue;
    }
    try {
      const payload = decodePayload(await decryptFor(myProfileId, conversationId, parseEnvelope(raw)));
      if (!payload) throw new Error("bad payload");
      if (payload.k === "t" || payload.k === "s") {
        msg.content = payload.t;
        ptMemoRemember(String(msg.id), payload.t);
      } else if (payload.k === "m") {
        msg.content = "";
        (msg as any)._mediaKey = payload.key;
        if (payload.mime) (msg as any)._mime = payload.mime;
        if (payload.dur != null) {
          (msg as any)._duration = payload.dur;
          const atts = (msg.attachments || []) as any[];
          if (atts[0] && atts[0].duration == null) atts[0].duration = payload.dur;
        }
        scheduleMediaDecrypt(msg);
      }
    } catch (e) {
      console.warn("[e2ee] decrypt failed for message", msg.id, e);
      msg.content = "🔒 Encrypted message (cannot decrypt on this device)";
    }
  }
}

export async function fetchConversationMessages(conversationId: string, myProfileId?: string): Promise<Message[]> {
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

  const formatted = rows.map((m: any) => {
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
      const parentEncrypted = isEnvelope(parent.content);
      const parentContent = parentEncrypted
        ? "Message"
        : parent.content ||
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

  if (myProfileId) {
    await decryptMessages(myProfileId, conversationId, formatted);
    // fire-and-forget delivery receipt for everything not from me
    void supabase.rpc("mark_messages_status", {
      p_conversation_id: conversationId,
      p_status: "delivered",
    });
  }

  return formatted;
}
