/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Chat — compact bubbles, ticks, accept banner, media, voice, swipe-reply.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Send, Paperclip, MoreVertical, Phone, Video, Mic, Check, CheckCheck,
  MessageSquare, AlertCircle,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import { Chat } from "../../types";
import { profileCache } from "../../services/profileCache";
import { supabase } from "../../lib/supabase/client";
import { formatChatTimestamp } from "../../lib/utils";
import { getLetterAvatar } from "../../lib/avatar";
import { useCallStore } from "../../store/callStore";
import { AmbientLiquidBackground } from "../GlassUI";
import { useRelayRealtime } from "../../services/realtime/useRelayRealtime";
import { QuotedReplyBubble } from "../QuotedReplyBubble";
import { ReplyPreviewComposer } from "../ReplyPreviewComposer";
import { ContactProfileScreen } from "../ContactProfileScreen";
import { GroupProfileScreen } from "../GroupProfileScreen";
import { SwipeableMessageItem } from "../SwipeableMessageItem";
import { VoiceRecorderUI } from "../../modules/voice/VoiceRecorderUI";
import { VoiceNoteBubble } from "../../modules/voice/VoiceNoteBubble";
import { apiService } from "../../services/apiService";
import type { VoiceNoteData } from "../../modules/voice/types";
import { formatDayDivider, isSameDay, DeliveryTicks } from "./chatHelpers";

export const ChatConversationScreen: React.FC<{ chatId: string; onBack: () => void }> = ({ chatId, onBack }) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { currentUser, profile } = useAuthStore();
  const { phase: callPhase, placeCall, watchConversation, stopWatching, setPeerMeta } = useCallStore();
  const myProfileId = profile?.id || currentUser?.id || "";
  const {
    chats, messages, activeTyping, replyingToMessage, sendMessage, sendTypingSignal,
    setReplyingToMessage, setActiveChat, pollUpdates, error: chatError, acceptChatRequest, deleteChat,
  } = useChatStore();
  const { subscriptions } = useRelayRealtime();

  const chat = chats.find((c) => c.id === chatId) || ({ id: chatId, name: "Conversation", type: "direct", participants: [myProfileId || "me"] } as Chat);
  const chatMsgs = messages[chatId] || [];
  const activeTypingUsers = activeTyping[chatId] || [];
  const isPendingIncoming = chat.requestStatus === "pending_incoming";
  const isPendingOutgoing = chat.requestStatus === "pending_outgoing";

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
    const interval = setInterval(() => pollUpdates(), 8000);
    return () => clearInterval(interval);
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, activeTypingUsers]);

  useEffect(() => {
    const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId;
    if (targetUserId && chat.type !== "group") {
      const cached = profileCache.get(targetUserId);
      if (cached) setRecipientProfile({ display_name: cached.name, username: cached.username, avatar_url: cached.avatarUrl });
      supabase.from("profiles").select("display_name, full_name, username, avatar_url")
        .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`).maybeSingle()
        .then(({ data }) => { if (data) setRecipientProfile(data); });
    }
  }, [chatId, chat.participants, currentUser?.id, myProfileId, chat.type]);

  if (showProfile) {
    if (chat.type === "group") return <GroupProfileScreen chatId={chat.id} onBack={() => setShowProfile(false)} />;
    const targetUserId = chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) || (chat as any).recipientId || chat.id;
    return <ContactProfileScreen targetUserId={targetUserId} chatId={chat.id} onBack={() => setShowProfile(false)} onStartChat={() => setShowProfile(false)} />;
  }

  const headerDisplayName = recipientProfile?.display_name || recipientProfile?.full_name || (recipientProfile?.username ? `@${recipientProfile.username}` : chat.name || "Conversation");
  const headerAvatar = recipientProfile?.avatar_url || chat.avatarUrl || getLetterAvatar(headerDisplayName);
  const subtitle = activeTypingUsers.length > 0 ? "Typing..." : (isPendingIncoming || isPendingOutgoing) ? "Message request" : chat.type === "group" ? `${chat.participants?.length || 1} members` : "";

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
      const uploaded = await apiService.uploadFile(base64, file.name, file.type || "application/octet-stream");
      const isImage = (file.type || "").startsWith("image/");
      const isVideo = (file.type || "").startsWith("video/");
      await sendMessage({
        content: file.name,
        type: isImage ? "image" : isVideo ? "video" : "file",
        attachments: [{ url: uploaded.url, name: file.name, mimeType: file.type, size: file.size } as any],
      });
    } catch (err: any) { setSendError(err?.message || "Upload failed"); }
    finally { setIsSending(false); }
  };

  const handleVoiceSend = async (voiceNote: VoiceNoteData) => {
    setShowVoice(false);
    setIsSending(true); setSendError(null);
    try {
      let url = voiceNote.audioUrl;
      if (voiceNote.blob) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(voiceNote.blob!);
        });
        const uploaded = await apiService.uploadFile(base64, voiceNote.fileName || "voice.webm", voiceNote.mimeType || "audio/webm");
        url = uploaded.url;
      }
      await sendMessage({
        content: "Voice note",
        type: "voice_note",
        attachments: [{ url, name: voiceNote.fileName, mimeType: voiceNote.mimeType, duration: voiceNote.duration } as any],
      });
    } catch (err: any) { setSendError(err?.message || "Voice send failed"); }
    finally { setIsSending(false); }
  };

  const isMineMsg = (msg: { senderId?: string }) => {
    if (!msg.senderId) return false;
    if (msg.senderId === "me") return true;
    if (myProfileId && msg.senderId === myProfileId) return true;
    if (currentUser?.id && msg.senderId === currentUser.id) return true;
    return false;
  };

  return (
    <div className="w-full h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden select-none">
      <AmbientLiquidBackground />
      <header className="w-full sticky top-0 z-30 h-[56px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" type="button"><ArrowLeft size={20} /></button>
          <button type="button" onClick={() => setShowProfile(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <img src={headerAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">{headerDisplayName}</h2>
              {subtitle ? <span className={`text-[10px] font-semibold ${activeTypingUsers.length ? "text-emerald-600" : "text-slate-500"}`}>{subtitle}</span> : null}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {chat.type !== "group" && !isPendingIncoming && (
            <>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => { setPeerMeta(headerDisplayName, headerAvatar); placeCall(chatId, "voice", myProfileId); }} className="p-2 rounded-full text-emerald-600"><Phone size={18} /></button>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => { setPeerMeta(headerDisplayName, headerAvatar); placeCall(chatId, "video", myProfileId); }} className="p-2 rounded-full text-blue-600"><Video size={18} /></button>
            </>
          )}
          <button type="button" onClick={() => setShowProfile(true)} className="p-2 rounded-full"><MoreVertical size={18} /></button>
        </div>
      </header>

      {isPendingIncoming && (
        <div className="shrink-0 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100 min-w-0">{headerDisplayName} wants to message you.</p>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={handleDecline} className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 text-slate-600">Delete</button>
            <button type="button" disabled={accepting} onClick={handleAccept} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="px-3 py-1 rounded-full text-[11px] font-bold text-white disabled:opacity-60">{accepting ? "…" : "Accept"}</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1 max-w-4xl w-full mx-auto flex flex-col">
        {chatMsgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center mb-3"><MessageSquare size={26} /></div>
            <h3 className="text-sm font-bold mb-1">No messages yet</h3>
            <p className="text-xs text-slate-500">{isPendingIncoming ? "Accept the request to reply." : "Say hello to start."}</p>
          </div>
        ) : (
          chatMsgs.map((msg, msgIndex) => {
            const isMine = isMineMsg(msg);
            const msgTs = (msg as any).createdAt || (msg as any).timestamp || "";
            const prev = msgIndex > 0 ? chatMsgs[msgIndex - 1] : null;
            const prevTs = prev ? (prev as any).createdAt || (prev as any).timestamp || "" : "";
            const showDay = !prev || !isSameDay(prevTs, msgTs);
            const dayLabel = showDay && msgTs ? formatDayDivider(msgTs) : null;
            const avatar = msg.senderAvatar || getLetterAvatar(msg.senderName || "U");
            const isVoice = msg.type === "voice_note" || msg.type === "audio";
            const mediaUrl = (msg as any).attachments?.[0]?.url || (msg as any).mediaUrl;
            return (
              <React.Fragment key={msg.id}>
                {dayLabel && (
                  <div className="flex justify-center my-1.5">
                    <span className="px-2.5 py-0.5 rounded-lg bg-white/90 dark:bg-slate-800/90 text-[10px] font-bold text-slate-500 border border-slate-200/70">{dayLabel}</span>
                  </div>
                )}
                <SwipeableMessageItem messageId={msg.id} onSwipeToReply={() => setReplyingToMessage(msg)}>
                  <div className={`flex w-full items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                    {!isMine && <img src={avatar} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0 mb-0.5" />}
                    <div
                      className={`px-2.5 py-1.5 rounded-2xl text-[13.5px] leading-snug font-medium max-w-[78%] shadow-xs [overflow-wrap:anywhere] ${
                        isMine ? "text-white rounded-br-sm" : "bg-white/95 dark:bg-slate-800/95 border border-slate-200/90 text-slate-900 dark:text-slate-100 rounded-bl-sm"
                      }`}
                      style={isMine ? { backgroundColor: "var(--primary-accent, #2563EB)" } : undefined}
                    >
                      {(msg.replyToId || msg.replyToMessage) && (
                        <QuotedReplyBubble quotedMessage={msg.replyToMessage || { id: msg.replyToId || "", senderName: "User", content: "Quoted" }} isMine={!!isMine} onJumpToMessage={() => {}} />
                      )}
                      {!isMine && chat.type === "group" && (
                        <span className="block text-[10px] font-bold mb-0.5" style={{ color: "var(--primary-accent, #2563EB)" }}>{msg.senderName || "User"}</span>
                      )}
                      {isVoice && mediaUrl ? (
                        <VoiceNoteBubble audioUrl={mediaUrl} duration={(msg as any).attachments?.[0]?.duration} isMine={isMine} />
                      ) : mediaUrl && (msg.type === "image" || msg.type === "photo") ? (
                        <img src={mediaUrl} alt="" className="rounded-xl max-w-full max-h-56 object-cover mb-1" />
                      ) : (
                        <span>{msg.content}</span>
                      )}
                      <div className={`flex items-center justify-end gap-1 mt-0.5 text-[9px] ${isMine ? "text-white/80" : "text-slate-400"}`}>
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
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/50 border-t border-red-200 text-[11px] text-red-700 text-center font-medium">{sendError || chatError}</div>
      )}
      {replyingToMessage && <ReplyPreviewComposer message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />}

      {showVoice ? (
        <div className="shrink-0 border-t border-slate-200/80 bg-white/95 dark:bg-slate-900/95 px-3 py-2">
          <VoiceRecorderUI onSendVoiceNote={handleVoiceSend} onCancel={() => setShowVoice(false)} />
        </div>
      ) : (
        <form onSubmit={handleSend} className="shrink-0 px-3 py-2 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 flex items-center gap-2 max-w-4xl w-full mx-auto">
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={handleFilePick} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-full text-slate-500"><Paperclip size={18} /></button>
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); sendTypingSignal(chatId); }}
            placeholder={isPendingIncoming ? "Accept request to reply…" : "Message"}
            disabled={isPendingIncoming && chatMsgs.length === 0}
            className="flex-1 py-2 px-3.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
          />
          {text.trim() ? (
            <button type="submit" disabled={isSending} className="p-2.5 rounded-full text-white" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}><Send size={18} /></button>
          ) : (
            <button type="button" onClick={() => setShowVoice(true)} className="p-2.5 rounded-full text-slate-500"><Mic size={18} /></button>
          )}
        </form>
      )}
    </div>
  );
};
