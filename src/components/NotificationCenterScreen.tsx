/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Notification center — full screen list; tapping a message notification
 * opens that conversation.
 */
import React, { useEffect } from "react";
import { ArrowLeft, Bell, MessageSquare, CheckCheck, BellRing } from "lucide-react";
import { useNotificationStore } from "../services/notificationService";
import { AmbientLiquidBackground, LiquidPanel } from "./GlassUI";
import { formatDayDivider } from "./chat/chatHelpers";

export const NotificationCenterScreen: React.FC<{
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}> = ({ onBack, onOpenConversation }) => {
  const { items, unread, fetch, markAllRead } = useNotificationStore();

  useEffect(() => { void fetch(); }, []);

  return (
    <div className="w-full app-h flex flex-col relative overflow-hidden bg-slate-50 dark:bg-black">
      <AmbientLiquidBackground />
      <div className="shrink-0 z-20 border-b border-slate-200/60 dark:border-white/10 px-2 py-2.5 flex items-center gap-2 bg-white/70 dark:bg-black/60 backdrop-blur-xl">
        <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft size={20} /></button>
        <h1 className="text-sm font-bold text-slate-900 dark:text-white flex-1">Notifications</h1>
        {unread > 0 && (
          <button type="button" onClick={() => void markAllRead()} className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white flex items-center gap-1.5" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}>
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5 pb-28" style={{ overscrollBehavior: "contain" }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-60 gap-2 text-center">
            <BellRing size={30} className="text-slate-400" />
            <p className="text-xs text-slate-500 font-medium">You're all caught up</p>
            <p className="text-[11px] text-slate-400">New messages and mentions land here.</p>
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => { void markAllRead(); if (n.conversationId) onOpenConversation(n.conversationId); }}
              className={`w-full flex items-start gap-3 px-3 py-3 rounded-2xl border text-left transition-all ${
                n.isRead
                  ? "bg-white/60 dark:bg-white/5 border-slate-200 dark:border-white/10"
                  : "bg-white/90 dark:bg-white/10 border-[var(--primary-accent,#2563EB)]/30 shadow-sm"
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${n.isRead ? "bg-slate-100 dark:bg-white/10 text-slate-500" : "text-white"}`} style={!n.isRead ? { backgroundColor: "var(--primary-accent, #2563EB)" } : {}}>
                {n.type === "message" ? <MessageSquare size={16} /> : <Bell size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-[13px] truncate ${n.isRead ? "font-semibold text-slate-700 dark:text-slate-200" : "font-bold text-slate-900 dark:text-white"}`}>{n.title}</p>
                  {!n.isRead && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} />}
                </div>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{n.body}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{n.createdAt ? formatDayDivider(n.createdAt) : ""}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
