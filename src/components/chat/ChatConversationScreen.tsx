/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Chat — WhatsApp-style bubbles (mine right / others left), swipe-to-reply,
 * hold-mic-to-record with slide-up lock + slide-cancel, ticks, media, E2EE.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Send, Paperclip, MoreVertical, Phone, Video, Mic, X,
  MessageSquare, Trash2, Pause, Play, ChevronUp, ChevronLeft, Lock,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import { Chat } from "../../types";
import { profileCache } from "../../services/profileCache";
import { supabase } from "../../lib/supabase/client";
import { formatChatTimestamp } from "../../lib/utils";
import { getLetterAvatar } from "../../lib/avatar";
import { useCallStore } from "../../store/callStore";
import { AmbientLiquidBackground, LiquidPanel } from "../GlassUI";
import { useRelayRealtime } from "../../services/realtime/useRelayRealtime";
import { fetchPresence, presenceLabel, type PresenceRow } from "../../services/presenceService";
import { QuotedReplyBubble } from "../QuotedReplyBubble";
import { ReplyPreviewComposer } from "../ReplyPreviewComposer";
import { ContactProfileScreen } from "../ContactProfileScreen";
import { GroupProfileScreen } from "../GroupProfileScreen";
import { SwipeableMessageItem } from "../SwipeableMessageItem";
import { useVoiceRecorder } from "../../modules/voice/useVoiceRecorder";
import { VoiceNoteBubble } from "../../modules/voice/VoiceNoteBubble";
import { apiService } from "../../services/apiService";
import type { VoiceNoteData } from "../../modules/voice/types";
import { formatDayDivider, isSameDay, DeliveryTicks } from "./chatHelpers";

const extForMime = (m: string): string =>
  m.includes("mp4") || m.includes("m4a") || m.includes("aac") ? "m4a"
  : m.includes("ogg") ? "ogg"
  : m.includes("wav") ? "wav"
  : m.includes("mpeg") || m.includes("mp3") ? "mp3"
  : "webm";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const pressStartRef = useRef<number>(0);
  const pressStartXYRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef(false);

  const { currentUser, profile } = useAuthStore();
  const { phase: callPhase, placeCall, watchConversation, stopWatching, setPeerMeta } = useCallStore();
  const myProfileId = profile?.id || currentUser?.id || "";
  const {
    chats, messages, activeTyping, replyingToMessage, sendMessage, sendTypingSignal,
    setReplyingToMessage, setActiveChat, pollUpdates, error: chatError, acceptChatRequest, deleteChat,
  } = useChatStore();
  const { subscriptions } = useRelayRealtime();

  const recorder = useVoiceRecorder();
  const {
    status: recStatus, recordingSeconds, liveWaveform, isLocked,
    startRecording, stopRecording, cancelRecording, lockRecording,
    pauseRecording, resumeRecording, clearPreview, permissionDenied, errorMessage: recError,
  } = recorder;

  const chat = chats.find((c) => c.id === chatId) || ({ id: chatId, name: "Conversation", type: "direct", participants: [myProfileId || "me"] } as Chat);
  const chatMsgs = messages[chatId] || [];
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

  // recording abandoned on unmount
  useEffect(() => () => { try { cancelRecording(); } catch { /* noop */ } }, []);

  // live presence for the peer (user_presence is in the realtime publication)
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

  // re-render when an encrypted attachment finishes decrypting to a blob URL
  useEffect(() => {
    const onReady = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.chatId === chatId) forceTick((t) => t + 1);
    };
    window.addEventListener("relay:media-ready", onReady);
    return () => window.removeEventListener("relay:media-ready", onReady);
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, activeTypingUsers]);

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
      await sendMessage({ content: text.trim(), type: "text" });
      setText(""); setReplyingToMessage(null);
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
      // encrypted upload — bucket only ever sees ciphertext
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
        // encrypted upload — bucket now accepts opaque ciphertext; real mime rides
        // INSIDE the ratchet payload so receivers play it with the right decoder
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
    if (lockedRef.current || isLocked) return; // locked keeps recording
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
    clearPreview(); // send directly — no preview step (WhatsApp behavior)
    if (note) void handleVoiceSend(note);
  };

  const onMicPointerCancel = () => {
    if (!lockedRef.current && !isLocked) cancelRecording();
    pressStartXYRef.current = null;
  };

  const isMineMsg = (msg: { senderId?: string }) => {
    if (!msg.senderId) return false;
    if (msg.senderId === "me") return true;
    if (myProfileId && msg.senderId === myProfileId) return true;
    if (currentUser?.id && msg.senderId === currentUser.id) return true;
    return false;
  };

  const recordingActive = recStatus === "recording" || recStatus === "paused" || recStatus === "locked";
  const fmtSecs = (s: number) => `${Math.floor(s / 60) < 10 ? "0" : ""}${Math.floor(s / 60)}:${s % 60 < 10 ? "0" : ""}${s % 60}`;

  return (
    <div className="w-full app-h flex flex-col bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 relative overflow-hidden select-none">
      <AmbientLiquidBackground />
      <LiquidPanel as="header" className="w-full shrink-0 z-20 !rounded-none border-b border-slate-200/60 dark:border-white/10 px-3 flex items-center justify-between bg-white/70 dark:bg-black/60 backdrop-blur-xl" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10" type="button"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => setShowProfile(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <img src={headerAvatar} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{headerDisplayName}</h2>
              {subtitle ? <span className={`text-[11px] font-semibold ${activeTypingUsers.length ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>{subtitle}</span> : null}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isGroup && !isPendingIncoming && (
            <>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => {
                const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId;
                setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
                void placeCall(chatId, "voice", myProfileId);
              }} className="p-2 rounded-full text-emerald-600/80 dark:text-emerald-400/80 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"><Phone size={18} /></button>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => {
                const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId;
                setPeerMeta(headerDisplayName, recipientProfile?.avatar_url);
                void placeCall(chatId, "video", myProfileId);
              }} className="p-2 rounded-full text-blue-600/80 dark:text-blue-400/80 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"><Video size={18} /></button>
            </>
          )}
          <button type="button" onClick={() => setShowProfile(true)} className="p-2 rounded-full"><MoreVertical size={18} /></button>
        </div>
      </LiquidPanel>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5 max-w-4xl w-full mx-auto" style={{ overscrollBehavior: 'contain' }}>
        {chatMsgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-60 gap-2">
            <MessageSquare size={32} className="text-slate-400" />
            <p className="text-xs text-slate-500">{isPendingIncoming ? "Accept the request to reply." : "Say hello to start."}</p>
          </div>
        ) : (
          chatMsgs.map((msg, idx) => {
            const isMine = isMineMsg(msg);
            const msgTs = (msg as any).timestamp || (msg as any).createdAt;
            const prevTs = idx > 0 ? ((chatMsgs[idx - 1] as any).timestamp || (chatMsgs[idx - 1] as any).createdAt) : null;
            const showDay = !prevTs || !isSameDay(msgTs, prevTs);
            const mediaUrl = (msg as any).mediaUrl || (msg as any).attachments?.[0]?.url;
            const isVoice = msg.type === "voice" || (msg as any).attachments?.[0]?.mimeType?.startsWith?.("audio");
            return (
              <React.Fragment key={msg.id || idx}>
                {showDay && msgTs && (
                  <div className="flex justify-center my-2">
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-500 dark:text-slate-300 backdrop-blur-sm">{formatDayDivider(msgTs)}</span>
                  </div>
                )}
                <SwipeableMessageItem messageId={String(msg.id || idx)} onSwipeToReply={() => setReplyingToMessage(msg)}>
                  <div className={`flex ${isMine ? "justify-end" : "justify-start"} items-end gap-1.5`}>
                    {!isMine && isGroup && <img src={getLetterAvatar(msg.senderName || "U")} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0 mb-0.5" />}
                    <div
                      className={`px-2.5 py-1.5 rounded-2xl text-[13.5px] leading-snug font-medium max-w-[80%] shadow-xs [overflow-wrap:anywhere] ${
                        isMine
                          ? "text-white rounded-br-md glass-bubble-mine"
                          : "glass-bubble-other text-slate-900 dark:text-slate-100 rounded-bl-md"
                      }`}
                      style={isMine ? { backgroundColor: "var(--primary-accent, #2563EB)" } : undefined}
                    >
                      {(msg.replyToId || msg.replyToMessage) && (
                        <QuotedReplyBubble quotedMessage={msg.replyToMessage || { id: msg.replyToId || "", senderName: "User", content: (msg as any).replyPreview || "Message" }} isMine={!!isMine} onJumpToMessage={() => {}} />
                      )}
                      {!isMine && isGroup && (
                        <span className="block text-[10px] font-bold mb-0.5" style={{ color: "var(--primary-accent, #2563EB)" }}>{msg.senderName || "User"}</span>
                      )}
                      {isVoice && mediaUrl ? (
                        <VoiceNoteBubble audioUrl={mediaUrl} duration={(msg as any).attachments?.[0]?.duration} isMine={isMine} />
                      ) : mediaUrl && ((msg.type as string) === "image" || (msg.type as string) === "photo") ? (
                        <img src={mediaUrl} alt="" className="rounded-xl max-w-full max-h-56 object-cover mb-1" />
                      ) : (
                        <span>{msg.content}</span>
                      )}
                      <div className={`flex items-center justify-end gap-1 mt-0.5 text-[9px] ${isMine ? "text-white/80" : "text-slate-400 dark:text-slate-400"}`}>
                        <span>{msgTs ? formatChatTimestamp(msgTs) : ""}</span>
                        {isMine && <DeliveryTicks state={(msg as any).deliveryState} />}
                      </div>
                    </div>
                  </div>
                </SwipeableMessageItem>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {(sendError || chatError) && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/50 border-t border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300 text-center font-medium">{sendError || chatError}</div>
      )}
      {replyingToMessage && <ReplyPreviewComposer message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />}

      {isPendingIncoming ? (
        <div className="shrink-0 border-t border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-black/80 px-4 py-3 flex flex-col gap-2 max-w-4xl w-full mx-auto">
          <p className="text-[12px] text-slate-600 dark:text-slate-300 text-center font-medium">Accept invite and start chatting</p>
          <div className="flex items-center gap-2 justify-center">
            <button type="button" onClick={handleDecline} className="flex-1 max-w-[140px] px-3 py-2.5 rounded-full text-[12px] font-semibold bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200">Delete</button>
            <button type="button" disabled={accepting} onClick={handleAccept} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="flex-1 max-w-[160px] px-3 py-2.5 rounded-full text-[12px] font-bold text-white disabled:opacity-60">{accepting ? "Accepting…" : "Accept"}</button>
          </div>
        </div>
      ) : (
        <div className="relative shrink-0 max-w-4xl w-full mx-auto">
          <LiquidPanel as="form" onSubmit={handleSend} className="px-3 py-2 border-t border-slate-200/60 dark:border-white/10 flex items-center gap-2 bg-white/70 dark:bg-black/60 backdrop-blur-xl" style={{ borderRadius: 0 }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={handleFilePick} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Attach"><Paperclip size={18} /></button>
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); sendTypingSignal(chatId); }}
              placeholder="Message"
              className="flex-1 py-2 px-3.5 rounded-full bg-slate-100 dark:bg-white/10 text-[13.5px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent,#2563EB)]/40"
            />
            {text.trim() ? (
              <button type="submit" disabled={isSending} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="p-2.5 rounded-full text-white disabled:opacity-60"><Send size={18} /></button>
            ) : (
              <button
                ref={micRef}
                type="button"
                onPointerDown={onMicPointerDown}
                onPointerMove={onMicPointerMove}
                onPointerUp={onMicPointerUp}
                onPointerCancel={onMicPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: "none" }}
                className="p-2.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-transform"
                aria-label="Hold to record voice note"
              ><Mic size={18} /></button>
            )}
          </LiquidPanel>

          {/* WhatsApp-style recording overlay — floats ABOVE the mounted composer so
              the mic button underneath keeps its captured pointer while held. */}
          {recordingActive && (
            <div className={`absolute inset-x-0 bottom-0 z-20 px-3 py-2.5 border-t border-slate-200/60 dark:border-white/10 bg-white/95 dark:bg-black/90 backdrop-blur-xl ${isLocked ? "pointer-events-auto" : "pointer-events-none"}`}>
              {isLocked ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0" style={{ color: "var(--primary-accent, #2563EB)", backgroundColor: "color-mix(in srgb, var(--primary-accent, #2563EB) 12%, transparent)" }}>
                    <Lock size={10} /> Locked
                  </span>
                  <div className="relative flex items-center justify-center shrink-0">
                    {recStatus !== "paused" && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />}
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                  </div>
                  <span className="font-mono text-[12px] font-bold tabular-nums">{fmtSecs(recordingSeconds)}</span>
                  <div className="flex-1 h-6 flex items-center justify-end gap-[2px] overflow-hidden px-1">
                    {(liveWaveform.length ? liveWaveform.slice(-24) : [30, 55, 40, 70, 45, 60]).map((amp, i) => (
                      <div key={i} style={{ height: `${Math.max(18, Math.min(100, amp))}%` }} className="w-[3px] rounded-full bg-[var(--primary-accent,#2563EB)]/70 transition-all duration-100" />
                    ))}
                  </div>
                  {recStatus === "paused" ? (
                    <button type="button" onClick={resumeRecording} className="p-2.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200"><Play size={16} className="fill-current" /></button>
                  ) : (
                    <button type="button" onClick={pauseRecording} className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"><Pause size={16} /></button>
                  )}
                  <button type="button" onClick={cancelRecording} className="p-2.5 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={16} /></button>
                  <button type="button" onClick={async () => {
                    const note = await stopRecording();
                    clearPreview();
                    if (note) void handleVoiceSend(note);
                  }} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="p-2.5 rounded-full text-white"><Send size={16} /></button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center justify-center shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />
                      <span className="w-2 h-2 rounded-full bg-rose-600" />
                    </div>
                    <span className="font-mono text-[12px] font-bold tabular-nums">{fmtSecs(recordingSeconds)}</span>
                    <div className="flex-1 flex items-center gap-1 overflow-hidden text-slate-500 dark:text-slate-400">
                      <ChevronLeft size={14} className="animate-pulse shrink-0" />
                      <span className="text-[11px] font-semibold whitespace-nowrap">Slide left to cancel</span>
                    </div>
                    <div className="flex items-center gap-1 text-[var(--primary-accent,#2563EB)] shrink-0">
                      <span className="text-[10px] font-bold whitespace-nowrap">Slide up to lock</span>
                      <ChevronUp size={14} className="animate-bounce" />
                    </div>
                  </div>
                  <div className="flex items-end justify-center gap-[2px] h-4 mt-1 overflow-hidden">
                    {(liveWaveform.length ? liveWaveform.slice(-40) : [20, 45, 30, 60, 40, 75, 50, 35]).map((amp, i) => (
                      <div key={i} style={{ height: `${Math.max(15, Math.min(100, amp))}%` }} className="w-[3px] rounded-full bg-[var(--primary-accent,#2563EB)]/70 transition-all duration-100" />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* transient hints (hold-to-record guidance / mic errors) */}
      {(micHint || (permissionDenied && recError)) && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-full bg-slate-900/90 dark:bg-white/10 text-white dark:text-white text-[11px] font-semibold shadow-lg backdrop-blur-md z-30 pointer-events-none whitespace-nowrap">
          {permissionDenied && recError ? "Microphone permission is required for voice notes" : micHint}
        </div>
      )}
    </div>
  );
};
