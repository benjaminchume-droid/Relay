/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat — FULL REBUILD (old screen deleted).
 *
 * Two chat styles, user-selectable in Profile → Appearance → Chat style:
 *
 *  · CLASSIC — one-to-one WhatsApp replica on our accent/surfaces:
 *    floating glass header (back · avatar+name+presence in one pill · call ·
 *    video · menu), incoming bubbles LEFT / outgoing RIGHT (true flex
 *    alignment), timestamps inside the bubble, delivery ticks, quote block
 *    inside the bubble, group sender names, centered date pills, WhatsApp
 *    voice-note bubble (play, dotted waveform, duration), the WhatsApp
 *    recording bar (timer, pause, red trash, send; slide-left cancel,
 *    slide-up lock), reaction chips, edited/deleted states.
 *
 *  · RETRO — Snapchat layout, our UI: NO bubbles — plain text rows with
 *    sender labels (contacts in accent-tinted caps, "Me" in accent), colored
 *    group bar on the edge, uppercase date dividers, quote cards, "Send a
 *    chat" input pill. Voice notes render on a proper surface (they used to
 *    be white-on-white) and recording shows the same bar as Classic.
 *
 * Both styles share the same E2EE pipeline — UI layer only, wire format
 * untouched. LAYOUT: the screen is one fixed viewport; the message list is a
 * full-height scroller that slides UNDER the floating glass header and
 * composer, so the bars blur/refract the content scrolling beneath them
 * (WhatsApp-style liquid glass). Tap the header pill → contact info screen.
 * LONG-PRESS any message → context menu at the press point: reactions,
 * reply, copy, edit (own text), pin to top, delete (own).
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Send, Paperclip, MoreVertical, Phone, Video, Mic, X,
  MessageSquare, Trash2, Pause, Play, ChevronLeft, ChevronUp, ChevronDown, Lock,
  Pencil, Copy, CornerUpLeft, Pin as PinIcon, PinOff, Check, PhoneOff, Mic as MicIcon,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { Chat } from "../../types";
import { profileCache } from "../../services/profileCache";
import { supabase } from "../../lib/supabase/client";
import { formatChatTimestamp } from "../../lib/utils";
import { getLetterAvatar } from "../../lib/avatar";
import { useCallStore } from "../../store/callStore";
import { AmbientLiquidBackground, LiquidPanel } from "../GlassUI";
import { ChatWallpaperLayer } from "./wallpapers";
import { useRelayRealtime } from "../../services/realtime/useRelayRealtime";
import { fetchPresence, presenceLabel, type PresenceRow } from "../../services/presenceService";
import { ReplyPreviewComposer } from "../ReplyPreviewComposer";
import { ContactProfileScreen } from "../ContactProfileScreen";
import { GroupProfileScreen } from "../GroupProfileScreen";
import { SwipeableMessageItem } from "../SwipeableMessageItem";
import { useVoiceRecorder } from "../../modules/voice/useVoiceRecorder";
import { useVoicePlayer } from "../../modules/voice/useVoicePlayer";
import { apiService } from "../../services/apiService";
import { looksLikeEnvelope } from "../../services/messageFetch";
import type { VoiceNoteData } from "../../modules/voice/types";
import { formatDayDivider, isSameDay, DeliveryTicks, CallSystemPill } from "./chatHelpers";

const ACCENT = "var(--primary-accent, #2563EB)";
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const extForMime = (m: string): string =>
  m.includes("mp4") || m.includes("m4a") || m.includes("aac") ? "m4a"
  : m.includes("ogg") ? "ogg"
  : m.includes("wav") ? "wav"
  : m.includes("mpeg") || m.includes("mp3") ? "mp3"
  : "webm";

// deterministic pseudo-waveform from the message id — stable bars per voice note
function waveformFor(id: string): number[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < 26; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(25 + (h % 70));
  }
  return bars;
}

export const ChatConversationScreen: React.FC<{ chatId: string; onBack: () => void }> = ({ chatId, onBack }) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PresenceRow | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; msg: any } | null>(null);
  const [editingMsg, setEditingMsg] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const firstLoadRef = useRef(true);
  const pressStartRef = useRef<number>(0);
  const pressStartXYRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef(false);
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFiredRef = useRef(false);
  const lpOriginRef = useRef<{ x: number; y: number } | null>(null);

  const { currentUser, profile } = useAuthStore();
  const chatStyle = useThemeStore((s) => s.customization.chatStyle) || "classic";
  const retro = chatStyle === "retro";
  const { phase: callPhase, placeCall, watchConversation, stopWatching, setPeerMeta } = useCallStore();
  const minimizedCall = useCallStore((s) => (s.minimized ? s.activeCall : null));
  const activeCallConv = useCallStore((s) => s.activeCall?.conversationId || null);
  const callMuted = useCallStore((s) => s.muted);
  const toggleCallMute = useCallStore((s) => s.toggleMute);
  const callHangup = useCallStore((s) => s.hangup);
  const callActiveSince = useCallStore((s) => s.activeSince);
  const callLivePhase = useCallStore((s) => s.phase);
  const callSetMinimized = useCallStore((s) => s.setMinimized);
  const [callTicker, setCallTicker] = useState(0);
  useEffect(() => {
    if (callLivePhase !== "active") return;
    const iv = setInterval(() => setCallTicker((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [callLivePhase]);
  const callElapsed = useMemo(() => {
    if (!callActiveSince || callLivePhase !== "active") return "";
    const s = Math.max(0, Math.floor((Date.now() - callActiveSince) / 1000));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }, [callActiveSince, callLivePhase, callTicker]);
  const myProfileId = profile?.id || currentUser?.id || "";
  const {
    chats, messages, activeTyping, replyingToMessage, sendMessage, sendTypingSignal,
    setReplyingToMessage, setActiveChat, pollUpdates, error: chatError, acceptChatRequest, deleteChat,
    editMessage, deleteMessage, reactToMessage, togglePinMessage, fetchChatExtras,
  } = useChatStore();
  const pinned = useChatStore((s) => s.pinnedByChat[chatId]) || null;
  const { subscriptions } = useRelayRealtime();

  const recorder = useVoiceRecorder();
  const {
    status: recStatus, recordingSeconds, liveWaveform, isLocked,
    startRecording, stopRecording, cancelRecording, lockRecording,
    pauseRecording, resumeRecording, clearPreview, permissionDenied, errorMessage: recError,
  } = recorder;

  const chat = chats.find((c) => c.id === chatId) || ({ id: chatId, name: "Conversation", type: "direct", participants: [myProfileId || "me"] } as Chat);
  const chatMsgs = useMemo(() => messages[chatId] || [], [messages, chatId]);
  const activeTypingUsers = activeTyping[chatId] || [];
  const isPendingIncoming = chat.requestStatus === "pending_incoming";
  const isPendingOutgoing = chat.requestStatus === "pending_outgoing";
  const isGroup = chat.type === "group";

  useEffect(() => {
    if (!chatId || !myProfileId) return;
    watchConversation(chatId, myProfileId);
    return () => stopWatching();
  }, [chatId, myProfileId]);

  useEffect(() => {
    setActiveChat(chatId);
    subscriptions.subscribeToConversation(chatId);
    return () => subscriptions.unsubscribeFromConversation(chatId);
  }, [chatId]);

  useEffect(() => {
    const interval = setInterval(() => pollUpdates(), 30000);
    return () => clearInterval(interval);
  }, [chatId]);

  useEffect(() => () => { try { cancelRecording(); } catch { /* noop */ } }, []);

  useEffect(() => {
    const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId;
    if (!targetUserId || isGroup) return;
    void fetchPresence([targetUserId]).then((m) => setPeerPresence(m[targetUserId] || null));
    const ch = supabase
      .channel(`presence:watch:${targetUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence", filter: `profile_id=eq.${targetUserId}` }, (payload) => {
        if (payload.new) setPeerPresence(payload.new as PresenceRow);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, chat.participants, chat.type, myProfileId, currentUser?.id]);

  useEffect(() => {
    const onReady = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.chatId === chatId) forceTick((t) => t + 1);
    };
    window.addEventListener("relay:media-ready", onReady);
    return () => window.removeEventListener("relay:media-ready", onReady);
  }, [chatId]);

  // Autoscroll — WhatsApp rule: only snap to the newest message when the user
  // is ALREADY at (or near) the bottom, or on the first load. The old code
  // scrollIntoView'd on EVERY store mutation (decrypt sweeps, typing signals,
  // presence pings), which yanked the scroll position back down mid-read —
  // the "scroll is buggy / doesn't work" report, worst with Retro rows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (firstLoadRef.current || atBottom || isAtBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        isAtBottomRef.current = true;
        setShowJumpToBottom(false);
      });
    }
    firstLoadRef.current = false;
  }, [chatMsgs, activeTypingUsers]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    isAtBottomRef.current = atBottom;
    setShowJumpToBottom(!atBottom);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    isAtBottomRef.current = true;
    setShowJumpToBottom(false);
  }, []);

  // Session catch-up sweep: messages that failed to decrypt earlier (prekey /
  // session wasn't ready yet) get a silent second pass when the chat opens,
  // when the tab regains focus, and shortly after identity bootstrap.
  const redecryptRef = useRef<() => void>(() => {});
  redecryptRef.current = () => { void useChatStore.getState().redecryptChat(chatId); };
  useEffect(() => {
    const kick = () => redecryptRef.current();
    kick();
    const t1 = setTimeout(kick, 2500);
    const t2 = setTimeout(kick, 8000);
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener("focus", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [chatId]);

  useEffect(() => {
    const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId;
    if (targetUserId && !isGroup) {
      const cached = profileCache.get(targetUserId);
      if (cached) setRecipientProfile({ display_name: cached.name, username: cached.username, avatar_url: cached.avatarUrl });
      supabase.from("profiles").select("display_name, full_name, username, avatar_url")
        .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`).maybeSingle()
        .then(({ data }) => { if (data) setRecipientProfile(data); });
    }
  }, [chatId, chat.participants, currentUser?.id, myProfileId, chat.type]);

  // refresh reactions/pin when the message set changes (new rows → re-check)
  useEffect(() => {
    if (!chatId) return;
    void fetchChatExtras(chatId);
  }, [chatId, chatMsgs.length]);

  const isMineMsg = (msg: { senderId?: string }) => {
    if (!msg.senderId) return false;
    if (msg.senderId === "me") return true;
    if (myProfileId && msg.senderId === myProfileId) return true;
    if (currentUser?.id && msg.senderId === currentUser.id) return true;
    return false;
  };

  // ---- long-press → context menu at the press point ----
  const cancelLongPress = useCallback(() => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
    lpOriginRef.current = null;
  }, []);

  const onPressStart = useCallback((e: React.PointerEvent, msg: any) => {
    if (isPendingIncoming || (msg as any).isDeleted) return;
    // mouse: context menu comes from right-click; long-press is for touch
    if (e.pointerType === "mouse") return;
    lpFiredRef.current = false;
    lpOriginRef.current = { x: e.clientX, y: e.clientY };
    const x = e.clientX, y = e.clientY;
    cancelLongPress();
    lpTimerRef.current = setTimeout(() => {
      lpFiredRef.current = true;
      try { navigator.vibrate?.(12); } catch { /* noop */ }
      setMenu({ x, y, msg });
    }, 420);
  }, [isPendingIncoming, cancelLongPress]);

  const onPressMove = useCallback((e: React.PointerEvent) => {
    if (!lpTimerRef.current || !lpOriginRef.current) return;
    const dist = Math.hypot(e.clientX - lpOriginRef.current.x, e.clientY - lpOriginRef.current.y);
    if (dist > 14) cancelLongPress(); // scrolling/swiping — never open the menu
  }, [cancelLongPress]);

  const onPressEnd = useCallback(() => { cancelLongPress(); }, [cancelLongPress]);

  const onRowContextMenu = useCallback((e: React.MouseEvent, msg: any) => {
    if (isPendingIncoming || (msg as any).isDeleted) return;
    e.preventDefault();
    // our own long-press already opened the menu — Android fires a native
    // contextmenu right after; re-opening here would remount + replay the
    // pop animation (the "flash on and off" bug)
    if (lpFiredRef.current) return;
    setMenu({ x: e.clientX, y: e.clientY, msg });
  }, [isPendingIncoming]);

  const closeMenu = useCallback(() => {
    lpFiredRef.current = false;
    setMenu(null);
  }, []);

  const menuAction = useCallback(async (action: string, arg?: any) => {
    const msg = menu?.msg;
    closeMenu();
    if (!msg) return;
    switch (action) {
      case "react":
        void reactToMessage(String(msg.id), arg);
        break;
      case "reply":
        setReplyingToMessage(msg);
        break;
      case "copy":
        try { await navigator.clipboard.writeText(String(msg.content || "")); } catch { /* clipboard denied */ }
        break;
      case "edit":
        setEditingMsg(msg);
        setText(String(msg.content || ""));
        setReplyingToMessage(null);
        break;
      case "pin":
        void togglePinMessage(String(msg.id));
        break;
      case "delete":
        void deleteMessage(String(msg.id));
        break;
    }
  }, [menu, closeMenu, reactToMessage, setReplyingToMessage, togglePinMessage, deleteMessage]);

  // ---- grouping pass (WhatsApp rhythm): consecutive same-sender messages
  // within 5 minutes form a bubble group — sender avatar/name on the FIRST,
  // tight spacing inside a group.
  const groupedMsgs = useMemo(() => {
    const rows: Array<{
      msg: any; idx: number; mine: boolean; msgTs: string;
      showDay: boolean; firstOfGroup: boolean; lastOfGroup: boolean;
    }> = chatMsgs.map((msg, idx) => {
      const mine = isMineMsg(msg);
      const msgTs = (msg as any).timestamp || (msg as any).createdAt;
      const prev = idx > 0 ? chatMsgs[idx - 1] : null;
      const prevTs = prev ? ((prev as any).timestamp || (prev as any).createdAt) : null;
      const showDay = !prevTs || !isSameDay(msgTs, prevTs);
      const sameSender = !!prev && isMineMsg(prev) === mine;
      const gapSmall = !!(prevTs && msgTs && (new Date(msgTs).getTime() - new Date(prevTs).getTime()) < 5 * 60 * 1000);
      return { msg, idx, mine, msgTs, showDay, firstOfGroup: showDay || !sameSender || !gapSmall, lastOfGroup: true };
    });
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      r.lastOfGroup = !next || next.showDay || next.firstOfGroup;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMsgs, myProfileId, currentUser?.id]);

  // EVERY hook above runs unconditionally — the early return below must sit
  // AFTER all of them (a hook after an early return throws React #300 and
  // unmounts the whole app when the contact screen opens).
  if (showProfile) {
    if (isGroup) return <GroupProfileScreen chatId={chat.id} onBack={() => setShowProfile(false)} />;
    const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId || chat.id;
    return <ContactProfileScreen targetUserId={targetUserId} chatId={chat.id} onBack={() => setShowProfile(false)} onStartChat={() => setShowProfile(false)} />;
  }

  const headerDisplayName = recipientProfile?.display_name || recipientProfile?.full_name || (recipientProfile?.username ? `@${recipientProfile.username}` : (chat.name && chat.name !== "Chat" && chat.name !== "Conversation" ? chat.name : "User"));
  const headerAvatar = recipientProfile?.avatar_url || chat.avatarUrl || getLetterAvatar(headerDisplayName);
  const presenceText = isGroup ? `${chat.participants?.length || 1} members` : presenceLabel(peerPresence);
  const subtitle = activeTypingUsers.length > 0 ? "Typing..." : (isPendingIncoming || isPendingOutgoing) ? "Message request" : presenceText;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending) return;
    setIsSending(true); setSendError(null);
    try {
      if (editingMsg) {
        await editMessage(String(editingMsg.id), text.trim());
        setEditingMsg(null);
      } else {
        await sendMessage({ content: text.trim(), type: "text" });
        setReplyingToMessage(null);
      }
      setText("");
    } catch (err: any) { setSendError(err?.message || "Failed to send"); }
    finally { setIsSending(false); }
  };

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    try { await acceptChatRequest(chatId); }
    catch (err: any) { setSendError(err?.message || "Failed to accept"); }
    finally { setAccepting(false); }
  };

  const handleDecline = async () => {
    try { await deleteChat(chatId); onBack(); }
    catch (err: any) { setSendError(err?.message || "Failed to delete"); }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsSending(true); setSendError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const isImage = (file.type || "").startsWith("image/");
      const isVideo = (file.type || "").startsWith("video/");
      const uploaded = await apiService.uploadEncryptedFile(base64, file.name, file.type || "application/octet-stream");
      await sendMessage({
        content: file.name,
        type: isImage ? "image" : isVideo ? "video" : "file",
        attachments: [{ url: uploaded.url, name: file.name, mimeType: file.type, size: file.size, mediaKey: uploaded.mediaKey } as any],
      });
    } catch (err: any) { setSendError(err?.message || "Upload failed"); }
    finally { setIsSending(false); }
  };

  const handleVoiceSend = async (voiceNote: VoiceNoteData) => {
    setIsSending(true); setSendError(null);
    try {
      let url = voiceNote.audioUrl;
      let mediaKey: string | undefined;
      const mime = voiceNote.mimeType || "audio/webm";
      const fname = `VoiceNote_${Date.now()}.${extForMime(mime)}`;
      if (voiceNote.blob) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(voiceNote.blob!);
        });
        const uploaded = await apiService.uploadEncryptedFile(base64, fname, mime);
        url = uploaded.url;
        mediaKey = uploaded.mediaKey;
      }
      await sendMessage({
        content: "Voice note",
        type: "voice",
        attachments: [{ url, name: fname, mimeType: mime, duration: voiceNote.duration, mediaKey } as any],
      });
    } catch (err: any) { setSendError(err?.message || "Voice send failed"); }
    finally { setIsSending(false); }
  };

  // ---- WhatsApp-style hold-to-record ----
  const onMicPointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isPendingIncoming || isSending) return;
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
    lockedRef.current = false;
    pressStartRef.current = Date.now();
    pressStartXYRef.current = { x: e.clientX, y: e.clientY };
    setMicHint(null);
    await startRecording();
  };

  const onMicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (recStatus !== "recording" || !pressStartXYRef.current || lockedRef.current) return;
    const dy = pressStartXYRef.current.y - e.clientY; // slide UP to lock
    const dx = pressStartXYRef.current.x - e.clientX; // slide LEFT to cancel
    if (dy > 64) {
      lockedRef.current = true;
      lockRecording();
      return;
    }
    if (dx > 110) {
      pressStartXYRef.current = null;
      cancelRecording();
      return;
    }
  };

  const onMicPointerUp = async () => {
    if (lockedRef.current || isLocked) return;
    if (recStatus !== "recording" && recStatus !== "paused") { pressStartXYRef.current = null; return; }
    const heldMs = Date.now() - pressStartRef.current;
    pressStartXYRef.current = null;
    if (heldMs < 700) {
      cancelRecording();
      setMicHint("Hold the mic to record");
      setTimeout(() => setMicHint(null), 2200);
      return;
    }
    const note = await stopRecording();
    clearPreview();
    if (note) void handleVoiceSend(note);
  };

  const onMicPointerCancel = () => {
    if (!lockedRef.current && !isLocked) cancelRecording();
    pressStartXYRef.current = null;
  };

  const isPinnedMsg = !!(pinned && menu && String(pinned.messageId) === String(menu.msg?.id));

  const scrollToMessage = (messageId: string) => {
    try {
      document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch { /* noop */ }
  };

  const recordingActive = recStatus === "recording" || recStatus === "paused" || recStatus === "locked";
  const fmtSecs = (s: number) => `${Math.floor(s / 60) < 10 ? "0" : ""}${Math.floor(s / 60)}:${s % 60 < 10 ? "0" : ""}${s % 60}`;

  const openProfile = () => setShowProfile(true);

  // layout paddings — bars float above the full-height scroller
  const headerPad = `calc(env(safe-area-inset-top, 0px) + ${pinned ? 112 : 68}px)`;
  const bottomExtra = (replyingToMessage ? 56 : 0) + (editingMsg ? 56 : 0);
  const bottomPad = `calc(env(safe-area-inset-bottom, 0px) + ${68 + bottomExtra}px)`;

  const renderRow = ({ msg, idx, mine, msgTs, showDay, firstOfGroup, lastOfGroup }: any) => {
    const mediaUrl = (msg as any).mediaUrl || (msg as any).attachments?.[0]?.url;
    const isVoice = msg.type === "voice" || (msg as any).attachments?.[0]?.mimeType?.startsWith?.("audio");
    const mime = (msg as any)._mime || (msg as any).attachments?.[0]?.mimeType;
    const decryptFailed = (msg as any)._encrypted && !mediaUrl;
    const isDeletedMsg = !!(msg as any).isDeleted;
    // ABSOLUTE UI GATE — raw ciphertext can never be rendered, even if a
    // future code path forgets to decrypt. The store sweep repairs it.
    const bodyText = looksLikeEnvelope(msg.content) ? "This message can't be displayed on this device" : String(msg.content ?? "");
    const bubbleRadius = mine
      ? (lastOfGroup ? "14px 14px 4px 14px" : "14px 14px 14px 14px")
      : (lastOfGroup ? "14px 14px 14px 4px" : "14px 14px 14px 14px");
    return (
      <React.Fragment key={msg.id || idx}>
        {showDay && msgTs && (
          <div className="flex justify-center my-2.5">
            <span className="text-[10.5px] font-semibold px-3 py-1 rounded-lg bg-white/90 dark:bg-white/10 text-slate-500 dark:text-slate-300 shadow-sm">{formatDayDivider(msgTs)}</span>
          </div>
        )}
        {msg.type === "system" ? (
          <CallSystemPill
            label={bodyText}
            onCallBack={!isGroup ? () => {
              setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
              void placeCall(chatId, "voice", myProfileId);
            } : undefined}
          />
        ) : (
        <SwipeableMessageItem messageId={String(msg.id || idx)} onSwipeToReply={() => !isPendingIncoming && setReplyingToMessage(msg)}>
          <div
            className={`flex ${mine ? "justify-end" : "justify-start"} ${isGroup && !mine ? "items-end gap-1.5" : "items-end"}`}
            style={{ marginTop: firstOfGroup ? 6 : 2 }}
          >
            {!mine && isGroup && (
              <span className="w-6 shrink-0">
                {firstOfGroup && <img src={getLetterAvatar(msg.senderName || "U")} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-white/10" />}
              </span>
            )}
            <div
              className={`px-2 py-1.5 text-[13.5px] leading-snug font-medium max-w-[80%] [overflow-wrap:anywhere] text-left ${isDeletedMsg ? "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 italic" : mine ? "wa-bubble-mine" : "wa-bubble-other"} ${isVoice || mediaUrl ? "pb-1.5" : ""}`}
              style={{ borderRadius: bubbleRadius, opacity: isDeletedMsg ? 0.85 : 1, touchAction: "pan-y" }}
              onPointerDown={(e) => onPressStart(e, msg)}
              onPointerMove={onPressMove}
              onPointerUp={onPressEnd}
              onPointerCancel={onPressEnd}
              onContextMenu={(e) => onRowContextMenu(e, msg)}
            >
              {(msg.replyToId || msg.replyToMessage) && !isDeletedMsg && (
                <div className={`mb-1 rounded-lg px-2 py-1.5 ${mine ? "wa-quote-mine" : "wa-quote-other"}`}>
                  <span className={`block text-[11px] font-bold ${mine ? "text-white" : ""}`} style={!mine ? { color: ACCENT } : {}}>
                    {mine ? "You" : (msg.replyToMessage?.senderName || "User")}
                  </span>
                  <span className={`block text-[11.5px] truncate ${mine ? "text-white/85" : "text-slate-500 dark:text-slate-300"}`}>
                    {msg.replyToMessage?.content || (msg as any).replyPreview || "Message"}
                  </span>
                </div>
              )}
              {!mine && isGroup && firstOfGroup && !isDeletedMsg && (
                <span className="block text-[11px] font-bold mb-0.5" style={{ color: ACCENT }}>{msg.senderName || "User"}</span>
              )}
              {isDeletedMsg ? (
                <span className="whitespace-pre-wrap">This message was deleted</span>
              ) : isVoice && (mediaUrl || decryptFailed) ? (
                <VoiceBubble
                  messageId={String(msg.id || idx)}
                  audioUrl={mediaUrl}
                  duration={(msg as any).attachments?.[0]?.duration ?? (msg as any)._duration}
                  isMine={mine}
                  failed={decryptFailed}
                  timestamp={msgTs ? formatChatTimestamp(msgTs) : ""}
                  state={(msg as any).deliveryState}
                />
              ) : mediaUrl && ((msg.type as string) === "image" || (msg.type as string) === "photo") ? (
                <div className="pb-3.5">
                  <img src={mediaUrl} alt="" className="rounded-lg max-w-full max-h-64 object-cover" />
                  <MetaRow isMine={mine} ts={msgTs ? formatChatTimestamp(msgTs) : ""} state={(msg as any).deliveryState} overlay edited={!!(msg as any).isEdited} />
                </div>
              ) : (
                <>
                  <span className="whitespace-pre-wrap">{bodyText}</span>
                  <MetaRow isMine={mine} ts={msgTs ? formatChatTimestamp(msgTs) : ""} state={(msg as any).deliveryState} inline edited={!!(msg as any).isEdited} />
                </>
              )}
            </div>
          </div>
          {!isDeletedMsg && <ReactionChips reactions={(msg as any).reactions} mine={mine} myId={myProfileId} onToggle={(emoji) => reactToMessage(String(msg.id), emoji)} />}
        </SwipeableMessageItem>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 relative overflow-hidden select-none">
      <AmbientLiquidBackground />

      {/* chat viewport wallpaper — the profile picker renders for real now */}
      <ChatWallpaperLayer />

      {/* ---------- full-height scroller — content slides UNDER the glass bars ---------- */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto px-3 max-w-4xl w-full mx-auto"
        style={{ paddingTop: headerPad, paddingBottom: bottomPad, overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
      >
        {chatMsgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center opacity-60 gap-2" style={{ minHeight: `calc(100% - ${headerPad} - ${bottomPad})` }}>
            <MessageSquare size={32} className="text-slate-400" />
            <p className="text-xs text-slate-500">{isPendingIncoming ? "Accept the request to reply." : "Say hello to start."}</p>
          </div>
        ) : retro ? (
          <RetroMessageList
            chatMsgs={chatMsgs as any[]}
            isMineMsg={isMineMsg}
            isGroup={isGroup}
            onSwipeReply={(m) => setReplyingToMessage(m)}
            onPressStart={onPressStart}
            onPressMove={onPressMove}
            onPressEnd={onPressEnd}
            onContextMenu={onRowContextMenu}
            myId={myProfileId}
            onToggleReaction={reactToMessage}
            onCallBack={() => {
              setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
              void placeCall(chatId, "voice", myProfileId);
            }}
          />
        ) : (
          groupedMsgs.map(renderRow)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* readability scrims under the floating bars */}
      <div className="absolute top-0 inset-x-0 z-[15] pointer-events-none" style={{ height: headerPad, background: "linear-gradient(180deg, rgba(248,250,252,0.9) 0%, rgba(248,250,252,0.55) 55%, rgba(248,250,252,0) 100%)" }} />
      <div className="dark:hidden absolute top-0 inset-x-0 z-[15] pointer-events-none hidden" />
      <div className="absolute bottom-0 inset-x-0 z-[15] pointer-events-none" style={{ height: bottomPad, background: "linear-gradient(0deg, rgba(248,250,252,0.92) 0%, rgba(248,250,252,0.6) 55%, rgba(248,250,252,0) 100%)" }} />
      <div className="absolute top-0 inset-x-0 z-[15] pointer-events-none hidden dark:block" style={{ height: headerPad, background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 100%)" }} />
      <div className="absolute bottom-0 inset-x-0 z-[15] pointer-events-none hidden dark:block" style={{ height: bottomPad, background: "linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)" }} />

      {/* ---------- floating glass header — messages refract underneath ---------- */}
      <div
        className="absolute top-0 inset-x-0 z-20 w-full max-w-4xl mx-auto px-2.5 pt-2.5"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <nav className="liquid-glass-nav flex items-center gap-1.5 px-2 py-1.5 rounded-[24px]">
          <button
            onClick={onBack}
            type="button"
            className="p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/10 active:scale-95 transition-all shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={19} />
          </button>

          {/* avatar + name + presence — one pill; tap = contact info screen */}
          <button
            type="button"
            onClick={openProfile}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-full hover:bg-white/40 dark:hover:bg-white/10 pl-1 pr-2 py-1 transition-colors active:scale-[0.99]"
          >
            <img
              src={headerAvatar}
              alt=""
              className="w-[34px] h-[34px] rounded-full object-cover ring-2 ring-white/70 dark:ring-white/15 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold text-slate-900 dark:text-white truncate leading-tight">{headerDisplayName}</span>
              {subtitle ? (
                <span className={`block text-[10.5px] font-semibold truncate leading-tight ${activeTypingUsers.length ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                  {subtitle}
                </span>
              ) : null}
            </span>
          </button>

          <div className="flex items-center shrink-0">
            {!isGroup && !isPendingIncoming && (
              <>
                <button type="button" disabled={callPhase !== "idle"} onClick={() => {
                  setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
                  void placeCall(chatId, "voice", myProfileId);
                }} className="p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40" aria-label="Voice call"><Phone size={17} /></button>
                <button type="button" disabled={callPhase !== "idle"} onClick={() => {
                  setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
                  void placeCall(chatId, "video", myProfileId);
                }} className="p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40" aria-label="Video call"><Video size={17} /></button>
              </>
            )}
            <button type="button" onClick={openProfile} className="p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/10 active:scale-95 transition-all" aria-label="More"><MoreVertical size={17} /></button>
          </div>
        </nav>

        {/* pinned banner — tap to jump to the pinned message. Content comes
            from the DECRYPTED store copy when we have it (the raw row is
            ciphertext on the wire), falling back to the fetched preview. */}
        {pinned && (
          <button
            type="button"
            onClick={() => scrollToMessage(pinned.messageId)}
            className="liquid-glass-nav w-full mt-1.5 flex items-center gap-2.5 px-3 py-1.5 rounded-2xl text-left active:scale-[0.99] transition-transform"
          >
            <PinIcon size={13} className="shrink-0" style={{ color: ACCENT }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-black uppercase tracking-wider truncate" style={{ color: ACCENT }}>Pinned · {pinned.senderName}</span>
              <span className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                {(() => {
                  const dm = (messages[chatId] || []).find((m) => String(m.id) === String(pinned.messageId));
                  const c = dm && !looksLikeEnvelope(dm.content) ? String(dm.content) : pinned.content;
                  return c || "Pinned message";
                })()}
              </span>
            </span>
          </button>
        )}

        {/* WhatsApp-style in-chat call banner — the call continues minimized;
            live timer + mute + end, tap to restore the full-screen call */}
        {minimizedCall && activeCallConv === chatId && callLivePhase !== "incoming_ringing" && (
          <button
            type="button"
            onClick={() => callSetMinimized(false)}
            className="liquid-glass-nav w-full mt-1.5 flex items-center gap-2.5 px-3 py-2 rounded-2xl text-left active:scale-[0.99] transition-transform"
          >
            <span className="relative flex items-center justify-center shrink-0">
              <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: "color-mix(in srgb, var(--primary-accent, #2563EB) 30%, transparent)" }} />
              <Phone size={14} style={{ color: ACCENT }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-black uppercase tracking-wider" style={{ color: ACCENT }}>
                {callLivePhase === "outgoing_ringing" ? "Ringing…" : callLivePhase === "connecting" ? "Connecting…" : "Ongoing call"}
              </span>
              <span className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-200 font-mono tabular-nums">
                {headerDisplayName} {callElapsed ? `· ${callElapsed}` : ""}
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); toggleCallMute(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggleCallMute(); } }}
              className={`p-2 rounded-full shrink-0 ${callMuted ? "bg-white text-slate-900" : "bg-white/10 text-slate-700 dark:text-white"}`}
              aria-label={callMuted ? "Unmute" : "Mute"}
            >
              {callMuted ? <MicIcon size={14} /> : <Mic size={14} />}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); void callHangup(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void callHangup(); } }}
              className="p-2 rounded-full bg-rose-500 text-white shrink-0"
              aria-label="End call"
            >
              <PhoneOff size={14} />
            </span>
          </button>
        )}
      </div>

      {/* jump to the newest message — WhatsApp bottom pill */}
      {showJumpToBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute z-20 right-3 bottom-[86px] w-10 h-10 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-lg border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-200 active:scale-95 transition-transform"
          aria-label="Scroll to latest messages"
        >
          <ChevronDown size={20} />
        </button>
      )}

      {/* ---------- floating composer — content refracts underneath ---------- */}
      <div className="absolute bottom-0 inset-x-0 z-20 max-w-4xl w-full mx-auto" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {(sendError || chatError) && (
          <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/50 border-t border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300 text-center font-medium">{sendError || chatError}</div>
        )}

        {editingMsg && (
          <div className="flex items-center gap-2.5 px-4 py-2 bg-amber-50/95 dark:bg-amber-500/10 border-t border-amber-200/70 dark:border-amber-500/20 backdrop-blur-xl">
            <Pencil size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9.5px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 leading-tight">Editing message</p>
              <p className="text-[12px] text-slate-600 dark:text-slate-300 truncate leading-tight">{String(editingMsg.content || "")}</p>
            </div>
            <button type="button" onClick={() => { setEditingMsg(null); setText(""); }} className="p-1.5 rounded-full hover:bg-amber-100 dark:hover:bg-white/10 text-slate-500" aria-label="Cancel edit"><X size={16} /></button>
          </div>
        )}

        {replyingToMessage && <ReplyPreviewComposer message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />}

        {isPendingIncoming ? (
          <div className="border-t border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-black/80 px-4 py-3 flex flex-col gap-2">
            <p className="text-[12px] text-slate-600 dark:text-slate-300 text-center font-medium">Accept invite and start chatting</p>
            <div className="flex items-center gap-2 justify-center">
              <button type="button" onClick={handleDecline} className="flex-1 max-w-[140px] px-3 py-2.5 rounded-full text-[12px] font-semibold bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200">Delete</button>
              <button type="button" disabled={accepting} onClick={handleAccept} style={{ backgroundColor: ACCENT }} className="flex-1 max-w-[160px] px-3 py-2.5 rounded-full text-[12px] font-bold text-white disabled:opacity-60">{accepting ? "Accepting…" : "Accept"}</button>
            </div>
          </div>
        ) : retro ? (
          <RetroComposer
            text={text}
            setText={(t) => { setText(t); sendTypingSignal(chatId); }}
            onSend={() => handleSend()}
            isSending={isSending}
            editing={!!editingMsg}
            fileInputRef={fileInputRef}
            onFilePick={handleFilePick}
            recorderSlot={
              text.trim() ? null : (
                <button
                  type="button"
                  onPointerDown={onMicPointerDown}
                  onPointerMove={onMicPointerMove}
                  onPointerUp={onMicPointerUp}
                  onPointerCancel={onMicPointerCancel}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ touchAction: "none" }}
                  className="p-2 rounded-full text-slate-500 dark:text-slate-300 hover:bg-white/40 dark:hover:bg-white/10 active:scale-95 transition-transform"
                  aria-label="Hold to record voice note"
                ><Mic size={16} /></button>
              )
            }
            sendSlot={
              <button type="submit" disabled={isSending} style={{ backgroundColor: editingMsg ? "#059669" : ACCENT }} className="p-2 rounded-full text-white disabled:opacity-60" aria-label={editingMsg ? "Save edit" : "Send"}>
                {editingMsg ? <Check size={16} /> : <Send size={16} />}
              </button>
            }
          />
        ) : (
          <LiquidPanel as="form" onSubmit={handleSend} className="px-2.5 py-2 border-t border-slate-200/60 dark:border-white/10 flex items-center gap-1.5 bg-white/70 dark:bg-black/60 backdrop-blur-xl" style={{ borderRadius: 0 }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={handleFilePick} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-full text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Attach"><Paperclip size={19} /></button>
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); sendTypingSignal(chatId); }}
              placeholder={editingMsg ? "Edit your message…" : "Message"}
              className="flex-1 py-2 px-4 rounded-full bg-slate-100 dark:bg-white/10 text-[13.5px] placeholder:text-slate-400 focus:outline-none"
            />
            {text.trim() ? (
              <button type="submit" disabled={isSending} style={{ backgroundColor: editingMsg ? "#059669" : ACCENT }} className="p-2.5 rounded-full text-white disabled:opacity-60" aria-label={editingMsg ? "Save edit" : "Send"}>
                {editingMsg ? <Check size={18} /> : <Send size={18} />}
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={onMicPointerDown}
                onPointerMove={onMicPointerMove}
                onPointerUp={onMicPointerUp}
                onPointerCancel={onMicPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: "none" }}
                className="p-2.5 rounded-full text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
                aria-label="Hold to record voice note"
              ><Mic size={18} /></button>
            )}
          </LiquidPanel>
        )}

        {/* WhatsApp recording bar — timer · waveform · pause · trash · send
            (shared by BOTH chat styles — retro used to record silently) */}
        {recordingActive && (
          <div className={`absolute inset-x-0 bottom-0 z-30 border-t border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-[#1e2a30]/95 backdrop-blur-xl ${isLocked ? "pointer-events-auto" : "pointer-events-none"}`}>
            {isLocked ? (
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 text-white" style={{ backgroundColor: ACCENT }}>
                  <Lock size={10} /> Locked
                </span>
                <div className="relative flex items-center justify-center shrink-0">
                  {recStatus !== "paused" && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />}
                  <span className="w-2 h-2 rounded-full bg-rose-600" />
                </div>
                <span className="font-mono text-[13px] font-bold tabular-nums text-slate-800 dark:text-white">{fmtSecs(recordingSeconds)}</span>
                <div className="flex-1 h-7 flex items-center justify-end gap-[2.5px] overflow-hidden px-1">
                  {(liveWaveform.length ? liveWaveform.slice(-26) : [30, 55, 40, 70, 45, 60]).map((amp, i) => (
                    <div key={i} style={{ height: `${Math.max(18, Math.min(100, amp))}%` }} className="w-[3px] rounded-full bg-slate-400 dark:bg-white/50 transition-all duration-100" />
                  ))}
                </div>
                {recStatus === "paused" ? (
                  <button type="button" onClick={resumeRecording} className="p-2.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white"><Play size={16} className="fill-current" /></button>
                ) : (
                  <button type="button" onClick={pauseRecording} className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"><Pause size={16} /></button>
                )}
                <button type="button" onClick={cancelRecording} className="p-2.5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-500"><Trash2 size={16} /></button>
                <button type="button" onClick={async () => {
                  const note = await stopRecording();
                  clearPreview();
                  if (note) void handleVoiceSend(note);
                }} style={{ backgroundColor: ACCENT }} className="p-3 rounded-full text-white shadow-md"><Send size={16} /></button>
              </div>
            ) : (
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <div className="relative flex items-center justify-center shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                  </div>
                  <span className="font-mono text-[13px] font-bold tabular-nums text-slate-800 dark:text-white">{fmtSecs(recordingSeconds)}</span>
                  <div className="flex-1 flex items-center gap-1 overflow-hidden">
                    <ChevronLeft size={14} className="animate-pulse shrink-0" />
                    <span className="text-[11px] font-semibold whitespace-nowrap">Slide left to cancel</span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1" style={{ color: ACCENT }}>
                      <ChevronUp size={14} className="animate-bounce" />
                      <span className="text-[10px] font-bold whitespace-nowrap">Slide up to lock</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-center gap-[2.5px] h-4 mt-1.5 overflow-hidden">
                  {(liveWaveform.length ? liveWaveform.slice(-40) : [20, 45, 30, 60, 40, 75, 50, 35]).map((amp, i) => (
                    <div key={i} style={{ height: `${Math.max(15, Math.min(100, amp))}%` }} className="w-[3px] rounded-full bg-slate-400 dark:bg-white/45 transition-all duration-100" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* long-press / right-click context menu at the press point */}
      {menu && (
        <MessageContextMenu
          x={menu.x}
          y={menu.y}
          msg={menu.msg}
          isMine={isMineMsg(menu.msg)}
          isPinned={isPinnedMsg}
          isText={typeof menu.msg?.content === "string" && !menu.msg?.attachments?.length && (menu.msg?.type || "text") === "text"}
          onClose={closeMenu}
          onAction={menuAction}
        />
      )}

      {(micHint || (permissionDenied && recError)) && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-full bg-slate-900/90 dark:bg-white/10 text-white text-[11px] font-semibold shadow-lg backdrop-blur-md z-40 pointer-events-none whitespace-nowrap">
          {permissionDenied && recError ? "Microphone permission is required for voice notes" : micHint}
        </div>
      )}
    </div>
  );
};

// ================= meta row (timestamp + ticks inside the bubble) =================

function MetaRow({ isMine, ts, state, inline, overlay, edited }: { isMine: boolean; ts: string; state?: string; inline?: boolean; overlay?: boolean; edited?: boolean }) {
  const editTag = edited ? <span className="italic">edited</span> : null;
  if (overlay) {
    return (
      <span className="absolute bottom-1 right-1.5 flex items-center gap-1 text-[9.5px] text-white/90 bg-black/35 rounded-full px-1.5 py-0.5">
        {ts} {editTag} {isMine && <DeliveryTicks state={state} />}
      </span>
    );
  }
  return (
    <span className={`float-right flex items-center gap-1 translate-y-[3px] ml-1.5 text-[9.5px] ${isMine ? "text-white/75" : "text-slate-400 dark:text-slate-400"}`}>
      {ts} {editTag} {isMine && <DeliveryTicks state={state} />}
    </span>
  );
}

// ================= reaction chips under a bubble =================

function ReactionChips({ reactions, mine, myId, onToggle }: {
  reactions?: Array<{ userId: string; userName: string; emoji: string }>;
  mine: boolean;
  myId: string;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions?.length) return null;
  const counts = new Map<string, { n: number; mine: boolean }>();
  for (const r of reactions) {
    const c = counts.get(r.emoji) || { n: 0, mine: false };
    c.n += 1;
    if (r.userId === myId) c.mine = true;
    counts.set(r.emoji, c);
  }
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} px-1 mt-0.5`}>
      <div className="flex flex-wrap gap-1">
        {Array.from(counts.entries()).map(([emoji, c]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-bold flex items-center gap-0.5 border transition-transform active:scale-95 ${c.mine ? "border-transparent text-white shadow-sm" : "bg-white/90 dark:bg-white/10 text-slate-600 dark:text-slate-200 border-slate-200/70 dark:border-white/10"}`}
            style={c.mine ? { backgroundColor: ACCENT } : {}}
            title={emoji}
          >
            <span className="text-[11px] leading-none">{emoji}</span>
            {c.n > 1 && <span className="leading-none">{c.n}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= long-press context menu (appears AT the press point) =================

function MessageContextMenu({ x, y, msg, isMine, isPinned, isText, onClose, onAction }: {
  x: number; y: number; msg: any; isMine: boolean; isPinned: boolean; isText: boolean;
  onClose: () => void;
  onAction: (action: string, arg?: any) => void;
}) {
  const W = 216;
  const EST_H = 320;
  const left = Math.min(Math.max(8, x - W / 2), (typeof window !== "undefined" ? window.innerWidth : 400) - W - 8);
  const openUp = y > (typeof window !== "undefined" ? window.innerHeight : 700) * 0.55;
  const top = openUp ? Math.max(8, y - EST_H) : Math.min(y + 6, (typeof window !== "undefined" ? window.innerHeight : 700) - EST_H - 8);

  // The menu opens while the long-press finger is still down; the browser's
  // native contextmenu (and any stray pointerdown from that same gesture)
  // must NOT close it — that was the "menu flashes on and off" bug.
  const openedAtRef = React.useRef(Date.now());
  const guardClose = React.useCallback(() => {
    if (Date.now() - openedAtRef.current < 350) return;
    onClose();
  }, [onClose]);

  const items: Array<{ key: string; label: string; icon: React.FC<{ size?: number }>; danger?: boolean; show: boolean }> = [
    { key: "reply", label: "Reply", icon: CornerUpLeft, show: true },
    { key: "copy", label: "Copy", icon: Copy, show: isText },
    { key: "edit", label: "Edit message", icon: Pencil, show: isMine && isText },
    { key: "pin", label: isPinned ? "Unpin message" : "Pin to top", icon: isPinned ? PinOff : PinIcon, show: true },
    { key: "delete", label: "Delete message", icon: Trash2, danger: true, show: isMine },
  ];

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={guardClose}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        className="absolute liquid-popover rounded-2xl overflow-hidden w-[216px] shadow-2xl"
        style={{ left, top, animation: "contextPop 140ms cubic-bezier(0.2, 0.9, 0.3, 1.2)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* quick reactions row */}
        <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1.5">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onAction("react", emoji)}
              className="text-[19px] leading-none p-1 rounded-full transition-transform hover:scale-125 active:scale-95"
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="h-px bg-slate-200/80 dark:bg-white/10" />
        {items.filter((i) => i.show).map(({ key, label, icon: Icon, danger }) => (
          <button
            key={key}
            type="button"
            onClick={() => onAction(key)}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-semibold text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/10 ${danger ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================= WhatsApp-style voice bubble =================

function VoiceBubble({
  messageId, audioUrl, duration, isMine, failed, timestamp, state, plain,
}: {
  messageId: string;
  audioUrl?: string;
  duration?: number;
  isMine: boolean;
  failed?: boolean;
  timestamp: string;
  state?: string;
  /** retro mode: render on a theme surface instead of inside the accent bubble */
  plain?: boolean;
}) {
  const {
    isPlaying, currentTime, duration: playerDuration, isBuffering, togglePlay,
  } = useVoicePlayer({ audioUrl: audioUrl || "", duration: duration || 0 });

  const bars = useMemo(() => waveformFor(messageId), [messageId]);
  const total = playerDuration || duration || 1;
  const frac = Math.min(1, Math.max(0, currentTime / total));
  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60) < 10 ? "0" : ""}${Math.floor(s % 60)}`;

  // palette: inside the accent bubble (classic mine) everything is white-on-
  // accent; retro + received bubbles use slate/accent on the theme surface.
  const onAccent = isMine && !plain;
  const thumbBg = onAccent ? "bg-white/25" : "bg-slate-200 dark:bg-white/10";
  const thumbFg = onAccent ? "text-white/90" : "text-slate-500 dark:text-slate-300";
  const playBtn = onAccent ? "bg-white/20 text-white" : "text-white";
  const played = onAccent ? "bg-white" : "";
  const unplayed = onAccent ? "bg-white/40" : "bg-slate-300 dark:bg-white/25";
  const timeFg = onAccent ? "text-white/85" : "text-slate-500 dark:text-slate-300";
  const metaFg = onAccent ? "text-white/70" : "text-slate-400";

  if (failed) {
    return (
      <div className="flex items-center gap-2 min-w-[150px] py-0.5">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${thumbBg}`}>
          <Mic size={15} className={thumbFg} />
        </span>
        <div className="leading-tight pb-2.5">
          <p className={`text-[12px] font-semibold ${onAccent ? "text-white" : "text-slate-600 dark:text-slate-200"}`}>Voice note</p>
          <p className={`text-[10px] ${onAccent ? "text-white/70" : "text-slate-400"}`}>Can't display on this device</p>
        </div>
        <MetaRow isMine={isMine} ts={timestamp} state={state} inline />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[210px] py-0.5">
      {/* WhatsApp: round art thumb with mic badge on the LEFT for others, right side art for mine */}
      <span className={`relative w-10 h-10 rounded-full shrink-0 overflow-hidden ${thumbBg}`}>
        <span className="absolute inset-0 flex items-center justify-center">
          <Mic size={16} className={thumbFg} />
        </span>
      </span>
      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform ${playBtn}`}
        style={!onAccent ? { backgroundColor: ACCENT } : {}}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isBuffering && !isPlaying ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause size={15} className="fill-current" />
        ) : (
          <Play size={15} className="fill-current translate-x-[1px]" />
        )}
      </button>
      <div className="flex-1 min-w-0 pb-2">
        {/* dotted waveform, played portion solid */}
        <div className="flex items-center gap-[2.5px] h-4">
          {bars.map((h, i) => {
            const on = i / bars.length <= frac;
            return (
              <span
                key={i}
                className={`w-[2.5px] rounded-full transition-colors ${on ? played : unplayed}`}
                style={{ height: `${Math.max(15, Math.min(100, h))}%`, ...(on && !onAccent ? { backgroundColor: ACCENT } : {}) }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-semibold ${timeFg}`}>{isPlaying || currentTime > 0 ? fmt(currentTime) : fmt(total)}</span>
          <span className={`text-[9.5px] flex items-center gap-1 ${metaFg}`}>
            {timestamp} {isMine && <DeliveryTicks state={state} />}
          </span>
        </div>
      </div>
    </div>
  );
}

// ================= RETRO (Snapchat layout, our UI) =================

function RetroMessageList({
  chatMsgs, isMineMsg, isGroup, onSwipeReply,
  onPressStart, onPressMove, onPressEnd, onContextMenu, myId, onToggleReaction, onCallBack,
}: {
  chatMsgs: any[];
  isMineMsg: (m: any) => boolean;
  isGroup: boolean;
  onSwipeReply: (m: any) => void;
  onPressStart: (e: React.PointerEvent, msg: any) => void;
  onPressMove: (e: React.PointerEvent) => void;
  onPressEnd: () => void;
  onContextMenu: (e: React.MouseEvent, msg: any) => void;
  myId: string;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onCallBack: () => void;
}) {
  // grouping — same rhythm as Classic: runs of same-sender messages
  const rows: Array<{ msg: any; idx: number; mine: boolean; msgTs: string; showDay: boolean; firstOfGroup: boolean; lastOfGroup: boolean }> = chatMsgs.map((msg, idx) => {
    const mine = isMineMsg(msg);
    const msgTs = (msg as any).timestamp || (msg as any).createdAt;
    const prev = idx > 0 ? chatMsgs[idx - 1] : null;
    const prevTs = prev ? ((prev as any).timestamp || (prev as any).createdAt) : null;
    const showDay = !prevTs || !isSameDay(msgTs, prevTs);
    const sameSender = !!prev && isMineMsg(prev) === mine;
    const gapSmall = !!(prevTs && msgTs && (new Date(msgTs).getTime() - new Date(prevTs).getTime()) < 5 * 60 * 1000);
    return { msg, idx, mine, msgTs, showDay, firstOfGroup: showDay || !sameSender || !gapSmall, lastOfGroup: true };
  });
  rows.forEach((r, i) => {
    const next = rows[i + 1];
    r.lastOfGroup = !next || next.showDay || next.firstOfGroup;
  });

  return (
    <div className="space-y-0.5">
      {rows.map(({ msg, idx, mine, msgTs, showDay, firstOfGroup }) => {
        const mediaUrl = (msg as any).mediaUrl || (msg as any).attachments?.[0]?.url;
        const isVoice = msg.type === "voice" || (msg as any).attachments?.[0]?.mimeType?.startsWith?.("audio");
        const decryptFailed = (msg as any)._encrypted && !mediaUrl;
        const isDeletedMsg = !!(msg as any).isDeleted;
        const bodyText = looksLikeEnvelope(msg.content) ? "This message can't be displayed on this device" : String(msg.content ?? "");
        return (
          <React.Fragment key={msg.id || idx}>
            {showDay && msgTs && (
              <div className="flex justify-center py-3">
                <span className="text-[10px] font-black tracking-[0.12em] uppercase text-slate-400 dark:text-slate-500">
                  {formatDayDivider(msgTs)}
                </span>
              </div>
            )}
            <SwipeableMessageItem messageId={String(msg.id || idx)} onSwipeToReply={() => onSwipeReply(msg)}>
              {msg.type === "system" ? (
                <div style={{ touchAction: "pan-y" }}>
                  <CallSystemPill
                    label={bodyText}
                    onCallBack={!isGroup ? () => onCallBack() : undefined}
                  />
                </div>
              ) : (
              <div
                className={`relative pl-4 pr-2 py-0.5 ${firstOfGroup ? "mt-1.5" : ""}`}
                style={{ touchAction: "pan-y" }}
                onPointerDown={(e) => onPressStart(e, msg)}
                onPointerMove={onPressMove}
                onPointerUp={onPressEnd}
                onPointerCancel={onPressEnd}
                onContextMenu={(e) => onContextMenu(e, msg)}
              >
                {/* group bar on the edge */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                  style={{ backgroundColor: mine ? ACCENT : "color-mix(in srgb, " + ACCENT + " 45%, transparent)" }}
                />
                {firstOfGroup && (
                  <p className="text-[10.5px] font-black tracking-wider uppercase mb-0.5" style={{ color: mine ? ACCENT : "color-mix(in srgb, " + ACCENT + " 70%, #64748b)" }}>
                    {mine ? "Me" : (msg.senderName || "User")}
                  </p>
                )}
                {(msg.replyToId || msg.replyToMessage) && !isDeletedMsg && (
                  <div className="mb-1 rounded-xl bg-slate-100 dark:bg-white/5 px-3 py-1.5 max-w-[85%]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: ACCENT }}>
                        {mine ? "You" : (msg.replyToMessage?.senderName || "User")}
                      </span>
                      <span className="text-[9.5px] text-slate-400">{msgTs ? formatChatTimestamp(msgTs) : ""}</span>
                    </div>
                    <span className="block text-[12px] text-slate-600 dark:text-slate-300 truncate">
                      {msg.replyToMessage?.content || (msg as any).replyPreview || "Message"}
                    </span>
                  </div>
                )}
                {isDeletedMsg ? (
                  <p className="text-[13px] italic text-slate-400 dark:text-slate-500">This message was deleted</p>
                ) : isVoice && (mediaUrl || decryptFailed) ? (
                  /* retro voice note — proper surface (used to be white-on-white) */
                  <div className="max-w-[320px] rounded-2xl bg-slate-100/90 dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/10 px-2.5 py-1.5">
                    <VoiceBubble
                      messageId={String(msg.id || idx)}
                      audioUrl={mediaUrl}
                      duration={(msg as any).attachments?.[0]?.duration ?? (msg as any)._duration}
                      isMine={mine}
                      failed={decryptFailed}
                      timestamp={msgTs ? formatChatTimestamp(msgTs) : ""}
                      state={(msg as any).deliveryState}
                      plain
                    />
                  </div>
                ) : mediaUrl && ((msg.type as string) === "image" || (msg.type as string) === "photo") ? (
                  <img src={mediaUrl} alt="" className="rounded-2xl max-w-[75%] max-h-64 object-cover border border-slate-200 dark:border-white/10" />
                ) : (
                  <p className="text-[14px] font-medium text-slate-800 dark:text-slate-100 whitespace-pre-wrap [overflow-wrap:anywhere] pr-8 text-left">
                    {bodyText}
                    <span className="float-right ml-2 mt-1 text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      {(msg as any).isEdited && <span className="italic">edited</span>}
                      {msgTs ? formatChatTimestamp(msgTs) : ""} {mine && <DeliveryTicks state={(msg as any).deliveryState} />}
                    </span>
                  </p>
                )}
              </div>
              )}
              {!isDeletedMsg && msg.type !== "system" && <ReactionChips reactions={(msg as any).reactions} mine={mine} myId={myId} onToggle={(emoji) => onToggleReaction(String(msg.id), emoji)} />}
            </SwipeableMessageItem>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RetroComposer({
  text, setText, onSend, isSending, editing, fileInputRef, onFilePick, recorderSlot, sendSlot,
}: {
  text: string;
  setText: (t: string) => void;
  onSend: () => void;
  isSending: boolean;
  editing?: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFilePick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  recorderSlot: React.ReactNode;
  sendSlot: React.ReactNode;
}) {
  return (
    <LiquidPanel
      as="form"
      onSubmit={(e: React.FormEvent) => { e.preventDefault(); onSend(); }}
      className="shrink-0 w-full px-3 py-2.5 border-t border-slate-200/60 dark:border-white/10 flex items-center gap-2 bg-white/70 dark:bg-black/60 backdrop-blur-xl"
      style={{ borderRadius: 0, paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={onFilePick} />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-full text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Attach"><Paperclip size={18} /></button>
      <div className="flex-1 flex items-center gap-2 px-4 py-2 rounded-full border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={editing ? "Edit your message…" : "Send a chat"}
          className="flex-1 bg-transparent text-[13.5px] placeholder:text-slate-400 focus:outline-none text-slate-800 dark:text-white"
        />
        {!text.trim() && recorderSlot}
      </div>
      {(text.trim() || editing) && sendSlot}
    </LiquidPanel>
  );
}
