/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Chat conversation — left/right, sender identity, dark mode, send errors.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Send, Paperclip, MoreVertical, Phone, Video, Mic, CheckCheck, MessageSquare, AlertCircle,
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

function formatDayDivider(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startToday.getTime() - startMsg.getTime()) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function isSameDay(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export const ChatConversationScreen: React.FC<{ chatId: string; onBack: () => void }> = ({
  chatId,
  onBack,
}) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { currentUser, profile } = useAuthStore();
  const { phase: callPhase, placeCall, watchConversation, stopWatching, setPeerMeta } = useCallStore();
  const myProfileId = profile?.id || currentUser?.id || "";
  const {
    chats, messages, activeTyping, replyingToMessage, sendMessage, sendTypingSignal,
    setReplyingToMessage, setActiveChat, pollUpdates, error: chatError,
  } = useChatStore();
  const { subscriptions } = useRelayRealtime();

  const chat =
    chats.find((c) => c.id === chatId) ||
    ({ id: chatId, name: "Conversation", type: "direct", participants: [myProfileId || "me"] } as Chat);
  const chatMsgs = messages[chatId] || [];
  const activeTypingUsers = activeTyping[chatId] || [];

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
    const targetUserId =
      chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) ||
      (chat as any).recipientId;
    if (targetUserId && chat.type !== "group") {
      const cached = profileCache.get(targetUserId);
      if (cached) {
        setRecipientProfile({
          display_name: cached.name,
          username: cached.username,
          avatar_url: cached.avatarUrl,
        });
      }
      supabase
        .from("profiles")
        .select("display_name, full_name, username, avatar_url")
        .or(`id.eq.${targetUserId},auth_user_id.eq.${targetUserId}`)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setRecipientProfile(data);
        });
    }
  }, [chatId, chat.participants, currentUser?.id, myProfileId, chat.type]);

  if (showProfile) {
    if (chat.type === "group") {
      return <GroupProfileScreen chatId={chat.id} onBack={() => setShowProfile(false)} />;
    }
    const targetUserId =
      chat.participants?.find((p) => p !== myProfileId && p !== currentUser?.id) ||
      (chat as any).recipientId ||
      chat.id;
    return (
      <ContactProfileScreen
        targetUserId={targetUserId}
        chatId={chat.id}
        onBack={() => setShowProfile(false)}
        onStartChat={() => setShowProfile(false)}
      />
    );
  }

  const headerDisplayName =
    recipientProfile?.display_name ||
    recipientProfile?.full_name ||
    (recipientProfile?.username ? `@${recipientProfile.username}` : chat.name || "Conversation");
  const headerAvatar =
    recipientProfile?.avatar_url || chat.avatarUrl || getLetterAvatar(headerDisplayName);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      await sendMessage({ content: text.trim(), type: "text" });
      setText("");
      setReplyingToMessage(null);
    } catch (err: any) {
      setSendError(err?.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
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
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" type="button">
            <ArrowLeft size={20} />
          </button>
          <button type="button" onClick={() => setShowProfile(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
            <img src={headerAvatar} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white truncate">{headerDisplayName}</h2>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {activeTypingUsers.length > 0 ? "Typing..." : chat.type === "group" ? `${chat.participants?.length || 1} members` : "online"}
              </span>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {chat.type !== "group" && (
            <>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => { setPeerMeta(headerDisplayName, headerAvatar); placeCall(chatId, "voice", myProfileId); }} className="p-2 rounded-full text-emerald-600">
                <Phone size={18} />
              </button>
              <button type="button" disabled={callPhase !== "idle"} onClick={() => { setPeerMeta(headerDisplayName, headerAvatar); placeCall(chatId, "video", myProfileId); }} className="p-2 rounded-full text-blue-600">
                <Video size={18} />
              </button>
            </>
          )}
          <button type="button" onClick={() => setShowProfile(true)} className="p-2 rounded-full">
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 max-w-4xl w-full mx-auto flex flex-col">
        {chatMsgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center mb-3">
              <MessageSquare size={26} />
            </div>
            <h3 className="text-sm font-bold mb-1">No messages yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Say hello to start the conversation.</p>
          </div>
        ) : (
          chatMsgs.map((msg, msgIndex) => {
            const isMine = isMineMsg(msg);
            const msgTs = (msg as any).createdAt || (msg as any).timestamp || "";
            const prev = msgIndex > 0 ? chatMsgs[msgIndex - 1] : null;
            const prevTs = prev ? (prev as any).createdAt || (prev as any).timestamp || "" : "";
            const showDay = !prev || !isSameDay(prevTs, msgTs);
            const dayLabel = showDay && msgTs ? formatDayDivider(msgTs) : null;
            const failed = (msg as any).deliveryState === "failed";
            const avatar = msg.senderAvatar || getLetterAvatar(msg.senderName || "U");
            return (
              <React.Fragment key={msg.id}>
                {dayLabel && (
                  <div className="flex justify-center my-2">
                    <span className="px-3 py-1 rounded-lg bg-white/90 dark:bg-slate-800/90 text-[10px] font-bold text-slate-500 border border-slate-200/70 dark:border-white/10">{dayLabel}</span>
                  </div>
                )}
                <div className={`flex w-full items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                  {!isMine && (
                    <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0" />
                  )}
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-[12.5px] font-medium max-w-[78%] shadow-xs [overflow-wrap:anywhere] ${
                      isMine
                        ? "text-white rounded-br-xs"
                        : "bg-white/95 dark:bg-slate-800/95 border border-slate-200/90 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-bl-xs"
                    } ${failed ? "opacity-80 ring-1 ring-red-400" : ""}`}
                    style={isMine ? { backgroundColor: "var(--primary-accent, #2563EB)" } : undefined}
                  >
                    {(msg.replyToId || msg.replyToMessage) && (
                      <QuotedReplyBubble
                        quotedMessage={msg.replyToMessage || { id: msg.replyToId || "", senderName: "User", content: "Quoted message" }}
                        isMine={!!isMine}
                        onJumpToMessage={() => {}}
                      />
                    )}
                    {!isMine && (
                      <span className="block text-[10px] font-bold mb-0.5" style={{ color: "var(--primary-accent, #2563EB)" }}>
                        {msg.senderName || "User"}
                      </span>
                    )}
                    <span>{msg.content}</span>
                    <div className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${isMine ? "text-white/80" : "text-slate-400"}`}>
                      {failed && <AlertCircle size={10} />}
                      <span>{msgTs ? formatChatTimestamp(msgTs) : ""}</span>
                      {isMine && !failed && <CheckCheck size={12} />}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {(sendError || chatError) && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/50 border-t border-red-200 text-[11px] text-red-700 dark:text-red-300 text-center font-medium">
          {sendError || chatError}
        </div>
      )}

      {replyingToMessage && (
        <ReplyPreviewComposer message={replyingToMessage} onCancel={() => setReplyingToMessage(null)} />
      )}

      <form onSubmit={handleSend} className="shrink-0 px-3 py-2.5 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200/80 dark:border-white/10 flex items-center gap-2 max-w-4xl w-full mx-auto">
        <button type="button" className="p-2 rounded-full text-slate-500"><Paperclip size={18} /></button>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); sendTypingSignal(chatId); }}
          placeholder="Message"
          className="flex-1 py-2.5 px-4 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        {text.trim() ? (
          <button type="submit" disabled={isSending} className="p-2.5 rounded-full text-white" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}>
            <Send size={18} />
          </button>
        ) : (
          <button type="button" className="p-2.5 rounded-full text-slate-500"><Mic size={18} /></button>
        )}
      </form>
    </div>
  );
};
