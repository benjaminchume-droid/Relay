/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Phase 3 ChatScreen — voice/video calls, day dividers, glass chat (WhatsApp-inspired layout, Relay design).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Send, Paperclip, MoreVertical, Phone, Video, Mic, CheckCheck, MessageSquare,
} from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore, ACCENT_COLOR_CONFIG } from "../../store/themeStore";
import { Chat, Message } from "../../types";
import { profileCache } from "../../services/profileCache";
import { supabase } from "../../lib/supabase/client";
import { formatChatTimestamp, formatHandle } from "../../lib/utils";
import { getLetterAvatar } from "../../lib/avatar";
import { useCallStore } from "../../store/callStore";
import { CallOverlay } from "../../modules/calls/CallOverlay";
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

const CallEventBubble: React.FC<{
  type: "voice" | "video";
  label?: string;
  timeLabel?: string;
  missed?: boolean;
}> = ({ type, label, timeLabel, missed }) => (
  <div className="flex justify-center my-2">
    <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/90 border border-slate-200/80 shadow-xs text-slate-700 max-w-[85%]">
      {type === "video" ? (
        <Video size={14} className="text-slate-500 shrink-0" />
      ) : (
        <Phone size={14} className="text-slate-500 shrink-0" />
      )}
      <div className="text-left min-w-0">
        <div className="text-[11px] font-bold leading-tight">
          {missed ? `Missed ${type} call` : `${type === "video" ? "Video" : "Voice"} call`}
        </div>
        {(label || timeLabel) && (
          <div className="text-[10px] text-slate-500 font-medium">
            {[label, timeLabel].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  </div>
);

export const ChatConversationScreen: React.FC<{
  chatId: string;
  onBack: () => void;
}> = ({ chatId, onBack }) => {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<{
    display_name?: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { currentUser, profile } = useAuthStore();
  const {
    phase: callPhase,
    placeCall,
    watchConversation,
    stopWatching,
  } = useCallStore();
  const myCallProfileId = profile?.id || currentUser?.id || "";

  const {
    chats,
    messages,
    activeTyping,
    replyingToMessage,
    sendMessage,
    sendTypingSignal,
    setReplyingToMessage,
    setActiveChat,
    pollUpdates,
  } = useChatStore();
  const { customization } = useThemeStore();
  const { subscriptions } = useRelayRealtime();

  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG["liquid-azure"];
  const chat =
    chats.find((c) => c.id === chatId) ||
    ({
      id: chatId,
      name: "Conversation",
      type: "direct",
      participants: [currentUser?.id || "me"],
    } as Chat);
  const chatMsgs = messages[chatId] || [];
  const activeTypingUsers = activeTyping[chatId] || [];

  useEffect(() => {
    if (!chatId || !myCallProfileId) return;
    watchConversation(chatId, myCallProfileId);
    return () => stopWatching();
  }, [chatId, myCallProfileId]);

  useEffect(() => {
    setActiveChat(chatId);
    subscriptions.subscribeToConversation(chatId);
    return () => subscriptions.unsubscribeFromConversation(chatId);
  }, [chatId]);

  useEffect(() => {
    const interval = setInterval(() => pollUpdates(), 5000);
    return () => clearInterval(interval);
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, activeTypingUsers]);

  useEffect(() => {
    const myProfileId = profile?.id || currentUser?.id;
    const myAuthId = currentUser?.id;
    const targetUserId =
      chat.participants?.find((p) => p !== myProfileId && p !== myAuthId) ||
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
  }, [chatId, chat.participants, currentUser?.id, profile?.id, chat.type]);

  if (showProfile) {
    if (chat.type === "group") {
      return <GroupProfileScreen chatId={chat.id} onBack={() => setShowProfile(false)} />;
    }
    const myProfileId = profile?.id || currentUser?.id;
    const myAuthId = currentUser?.id;
    const targetUserId =
      chat.participants?.find((p) => p !== myProfileId && p !== myAuthId) ||
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
    try {
      await sendMessage({ content: text.trim(), type: "text" });
      setText("");
      setReplyingToMessage(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full h-screen flex flex-col justify-between bg-slate-50 text-slate-900 relative overflow-hidden select-none">
      <AmbientLiquidBackground />

      <CallOverlay
        peerName={headerDisplayName}
        peerAvatar={headerAvatar}
        myProfileId={myCallProfileId}
      />

      <header className="w-full sticky top-0 left-0 right-0 z-30 h-[56px] bg-white/95 backdrop-blur-xl border-b border-slate-200/80 px-3 sm:px-4 flex items-center justify-between shadow-xs shrink-0 text-slate-800">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
            type="button"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2.5 cursor-pointer min-w-0 group flex-1 text-left"
          >
            <img
              src={headerAvatar}
              alt={headerDisplayName}
              className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold text-slate-900 leading-tight truncate group-hover:text-blue-600 transition-colors">
                {headerDisplayName}
              </h2>
              <span className="text-[10px] text-emerald-600 font-semibold block truncate">
                {activeTypingUsers.length > 0
                  ? "Typing..."
                  : chat.type === "group"
                    ? `${chat.participants?.length || 1} members`
                    : "online"}
              </span>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-slate-700">
          {chat.type !== "group" && (
            <>
              <button
                type="button"
                onClick={() => myCallProfileId && placeCall(chatId, "voice", myCallProfileId)}
                className="p-2 rounded-full hover:bg-emerald-50 text-emerald-600 transition-all cursor-pointer"
                title="Voice call"
                disabled={callPhase !== "idle"}
              >
                <Phone size={18} />
              </button>
              <button
                type="button"
                onClick={() => myCallProfileId && placeCall(chatId, "video", myCallProfileId)}
                className="p-2 rounded-full hover:bg-blue-50 text-blue-600 transition-all cursor-pointer"
                title="Video call"
                disabled={callPhase !== "idle"}
              >
                <Video size={18} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="p-2 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
            title="More"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-6 space-y-1.5 max-w-4xl w-full mx-auto flex flex-col bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.04)_1px,transparent_0)] [background-size:18px_18px]">
        {chatMsgs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center mb-3">
              <MessageSquare size={26} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">No messages yet</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Say hello to start the conversation. Calls and messages stay on Relay.
            </p>
          </div>
        ) : (
          chatMsgs.map((msg, msgIndex) => {
            const myProfileId = profile?.id || currentUser?.id;
            const isMine =
              (currentUser &&
                (msg.senderId === currentUser.id || msg.senderId === myProfileId)) ||
              msg.senderId === "me";
            const msgTs = msg.createdAt || (msg as any).timestamp || "";
            const prev = msgIndex > 0 ? chatMsgs[msgIndex - 1] : null;
            const prevTs = prev ? prev.createdAt || (prev as any).timestamp || "" : "";
            const showDay = !prev || !isSameDay(prevTs, msgTs);
            const dayLabel = showDay && msgTs ? formatDayDivider(msgTs) : null;
            const isCallEvent = msg.type === "system" && /call/i.test(msg.content || "");

            return (
              <React.Fragment key={msg.id}>
                {dayLabel && (
                  <div className="flex justify-center my-2.5 sticky top-1 z-10 pointer-events-none">
                    <span className="px-3 py-1 rounded-lg bg-white/90 backdrop-blur-md text-[10px] font-bold text-slate-500 shadow-xs border border-slate-200/70 tracking-wide">
                      {dayLabel}
                    </span>
                  </div>
                )}
                {isCallEvent ? (
                  <CallEventBubble
                    type={/video/i.test(msg.content || "") ? "video" : "voice"}
                    label={msg.content}
                    timeLabel={msgTs ? formatChatTimestamp(msgTs) : undefined}
                    missed={/missed/i.test(msg.content || "")}
                  />
                ) : (
                  <div className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-[12.5px] font-medium leading-relaxed max-w-[85%] shadow-xs [overflow-wrap:anywhere] ${
                        isMine
                          ? "text-white rounded-br-xs"
                          : "bg-white/95 border border-slate-200/90 text-slate-900 rounded-bl-xs"
                      }`}
                      style={isMine ? { backgroundColor: "var(--primary-accent, #2563EB)" } : undefined}
                    >
                      {(msg.replyToId || msg.replyToMessage) && (
                        <QuotedReplyBubble
                          quotedMessage={
                            msg.replyToMessage || {
                              id: msg.replyToId || "",
                              senderName: "User",
                              content: "Quoted message",
                            }
                          }
                          isMine={!!isMine}
                          onJumpToMessage={() => {}}
                        />
                      )}
                      {!isMine && chat.type === "group" && (
                        <span className="block text-[10px] font-bold text-blue-600 mb-0.5">
                          {msg.senderName}
                        </span>
                      )}
                      <span>{msg.content}</span>
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                          isMine ? "text-white/80" : "text-slate-400"
                        }`}
                      >
                        <span>{msgTs ? formatChatTimestamp(msgTs) : ""}</span>
                        {isMine && <CheckCheck size={12} />}
                      </div>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {replyingToMessage && (
        <ReplyPreviewComposer
          message={replyingToMessage}
          onCancel={() => setReplyingToMessage(null)}
        />
      )}

      <form
        onSubmit={handleSend}
        className="shrink-0 px-3 py-2.5 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 flex items-center gap-2 max-w-4xl w-full mx-auto"
      >
        <button type="button" className="p-2 rounded-full text-slate-500 hover:bg-slate-100">
          <Paperclip size={18} />
        </button>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            sendTypingSignal(chatId);
          }}
          placeholder="Message"
          className="flex-1 py-2.5 px-4 rounded-full bg-slate-100 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        {text.trim() ? (
          <button
            type="submit"
            disabled={isSending}
            className="p-2.5 rounded-full text-white shadow-md"
            style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}
          >
            <Send size={18} />
          </button>
        ) : (
          <button type="button" className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100">
            <Mic size={18} />
          </button>
        )}
      </form>
    </div>
  );
};
