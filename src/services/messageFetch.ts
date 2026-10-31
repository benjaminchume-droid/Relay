/**
 * Message list with sender identity (name + avatar) + reply previews.
 * E2EE: decrypts ratchet envelopes in place; text synchronously, media lazily.
 */
import { supabase } from "../lib/supabase/client";
import { formatMessageRecord } from "./messagingCore";
import {
  decryptFor, deleteSessionFor, ensureSession, encryptFor, isEnvelope, isFanout, parseEnvelope, parseFanout,
} from "./crypto/cryptoService";
import { decodePayload, getDecryptedMediaUrl } from "./crypto/mediaDecryptor";
import type { Message } from "../types";

/**
 * Belt-and-braces guard: does this string LOOK like wire ciphertext?
 * Catches R1 envelopes, R2 fan-outs, the legacy e2ee:v1 scheme, and raw
 * prekey JSON that lost its prefix. Anything matching this must NEVER be
 * rendered — UI layers call this before displaying message content.
 */
export function looksLikeEnvelope(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const t = s.trimStart();
  if (t.startsWith("R1:") || t.startsWith("R2:")) return true;
  if (t.startsWith("e2ee:v1:")) return true;
  // envelope JSON that somehow lost its prefix — check the Signal header shape
  if (t.startsWith("{") && /"(v|dh|ct|iv|pre|ek|spkId|opkId)"\s*:/.test(t.slice(0, 400))) return true;
  return false;
}

/** Sanitized placeholder for content that must never render as ciphertext. */
export const CIPHER_PLACEHOLDER = "This message can't be displayed on this device";

// ---------------------------------------------------------------------------
// Session-reset protocol
//
// Double Ratchet chains only move forward. If a device loses its stored
// session (logout/storage eviction, identity rotation, poisoned responder
// state), a bare (no `pre`) continuation envelope can NEVER be decrypted
// again — the receiver has no shared secret and no header to rebuild from.
// Left alone, every subsequent message from that peer fails forever.
//
// Recovery: when decryption fails on a bare envelope, the receiver deletes
// its local session, initiates a FRESH X3DH against the peer's current
// prekey bundle, and sends a silent {k:'r'} control envelope (which carries
// a `pre` block). The peer's decryptFor sees the prekey header, rebuilds,
// and both sides converge on the new session. The control message is
// filtered from the UI and never renders.
// ---------------------------------------------------------------------------

const sessionResetInflight = new Set<string>();

/** Fire-and-forget re-sync after a RelaySessionDead failure. */
export async function sendSessionReset(
  myProfileId: string,
  conversationId: string,
  peerProfileId: string
): Promise<void> {
  if (!myProfileId || !conversationId || !peerProfileId || peerProfileId === myProfileId) return;
  const key = `${conversationId}:${peerProfileId}`;
  if (sessionResetInflight.has(key)) return;
  sessionResetInflight.add(key);
  try {
    // Drop the stale/poisoned session so ensureSession initiates a fresh X3DH.
    await deleteSessionFor(myProfileId, conversationId, peerProfileId);
    // encryptFor → ensureSession finds nothing stored → x3dhInitiate → the
    // outgoing envelope carries the `pre` block the peer needs to rebuild.
    const wire = await encryptFor(myProfileId, conversationId, peerProfileId, JSON.stringify({ k: "r" }));
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    await supabase.rpc("send_conversation_message", {
      p_conversation_id: uuidRe.test(conversationId) ? conversationId : null,
      p_recipient_profile_id: peerProfileId,
      p_content: wire,
      p_message_type: "text",
      p_reply_to_message_id: null,
      p_media_url: null,
      p_file_name: null,
      p_is_forwarded: false,
    });
  } catch (e) {
    console.warn("[e2ee] session reset failed (will retry on next failure)", e);
  } finally {
    sessionResetInflight.delete(key);
  }
}

/** Kick off lazy media decryption; resolves to a blob URL when ready. */
export function scheduleMediaDecrypt(msg: Message): void {
  const anyMsg = msg as any;
  const key = anyMsg._mediaKey;
  const url = anyMsg.mediaUrl || anyMsg.attachments?.[0]?.url;
  if (!key || !url || anyMsg._mediaDecrypting) return;
  anyMsg._mediaDecrypting = true;
  getDecryptedMediaUrl(String(msg.id), url, key, anyMsg._mime)
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

// Own-media memory: (url, key, mime) needed to decrypt our own voice notes and
// attachments after a history refetch — the ratchet can't self-decrypt.
const OWN_MEDIA_KEY = 'relay_own_media_v1';

export function ownMediaRemember(messageId: string, media: { url: string; key: string; mime: string }): void {
  if (!messageId || !media?.url || !media?.key) return;
  try {
    const all = JSON.parse(localStorage.getItem(OWN_MEDIA_KEY) || '{}');
    all[messageId] = media;
    const ids = Object.keys(all);
    if (ids.length > 300) {
      for (const k of ids.slice(0, ids.length - 300)) delete all[k];
    }
    localStorage.setItem(OWN_MEDIA_KEY, JSON.stringify(all));
  } catch { /* storage optional */ }
}

function ownMediaLookup(messageId: string): { url: string; key: string; mime: string } | null {
  try {
    const all = JSON.parse(localStorage.getItem(OWN_MEDIA_KEY) || '{}');
    return all[messageId] || null;
  } catch { return null; }
}

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
    if (!isEnvelope(raw) && !isFanout(raw)) continue;
    (msg as any)._encrypted = true;
    // Own outgoing messages: NEVER run the ratchet on them (no receiving chain for
    // self — it would corrupt the session state). Recall the stored plaintext.
    if (msg.senderId && msg.senderId === myProfileId) {
      const remembered = ownPlaintextRecall(String(msg.id));
      msg.content = remembered ?? CIPHER_PLACEHOLDER;
      // media we sent (voice notes, photos): decrypt via the local (url,key,mime) memo
      const ownMedia = ownMediaLookup(String(msg.id));
      if (ownMedia) {
        (msg as any)._mediaKey = ownMedia.key;
        (msg as any)._mime = ownMedia.mime;
        scheduleMediaDecrypt(msg);
      }
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
      // R2 fan-out: pick the envelope addressed to ME, decrypt against the SENDER.
      // R1: single envelope (DMs / legacy). Sessions are per conversation+peer.
      const env = isFanout(raw)
        ? (parseFanout(raw).to.find((t) => t.p === myProfileId)?.e ?? null)
        : parseEnvelope(raw);
      if (!env) {
        msg.content = CIPHER_PLACEHOLDER;
        continue;
      }
      const payload = decodePayload(await decryptFor(myProfileId, conversationId, msg.senderId, env));
      if (!payload) throw new Error("bad payload");
      if (payload.k === "r") {
        // Session-reset control message — protocol plumbing, never render it.
        (msg as any)._systemControl = true;
        msg.content = "";
        continue;
      }
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
    } catch (e: any) {
      console.warn("[e2ee] decrypt failed for message", msg.id, e);
      msg.content = CIPHER_PLACEHOLDER;
      // Bare envelope we can't open → the shared session is gone on one side.
      // Kick the reset protocol so BOTH devices converge instead of failing
      // forever. (Prekey-envelope failures re-initiate on the sender side via
      // the rebuild path; a dead one still lands here — same recovery.)
      if ((e as any)?.name === "RelaySessionDead") {
        void sendSessionReset(myProfileId, conversationId, msg.senderId);
      }
    }
  }
  // loop-level guard: a row must never leave this function as ciphertext
  for (const msg of msgs) {
    if (looksLikeEnvelope(msg.content)) {
      msg.content = CIPHER_PLACEHOLDER;
    }
  }
}

export async function fetchConversationMessages(conversationId: string, myProfileId?: string): Promise<Message[]> {
  if (!conversationId) return [];
  // HARD GATE: without MY profile id no envelope can ever be decrypted, so
  // returning rows here would ship raw ciphertext to the UI (this exact race
  // used to render R1/R2 JSON as chat bubbles). Fail loudly instead — callers
  // keep showing the previous decrypted state.
  if (!myProfileId) {
    throw new Error("decryption-gate: profile id unavailable, refusing to serve undecrypted messages");
  }

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

  // Final belt-and-braces: NOTHING leaves this function as ciphertext.
  for (const m of formatted) {
    if (looksLikeEnvelope(m.content)) {
      console.warn("[messageFetch] ciphertext survived the gate — sanitizing", m.id);
      m.content = CIPHER_PLACEHOLDER;
      (m as any)._encrypted = true;
    }
  }

  // Session-reset control messages are protocol plumbing — strip them before
  // the rows reach any store or the UI.
  const visible = formatted.filter((m) => !(m as any)._systemControl);
  return visible;
}
