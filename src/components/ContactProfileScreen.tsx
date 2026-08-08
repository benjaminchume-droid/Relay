/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ArrowLeft, ShieldAlert, ShieldOff, MessageSquare, Share2, Bell,
  Lock, Check, UserCheck, Smartphone, Clock, Calendar, Info, Trash2, UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlassButton } from './GlassUI';
import { useAuthStore } from '../store/authStore';
import { useContactsStore } from '../store/contactsStore';
import { useChatStore } from '../store/chatStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import { UserProfile } from '../types';

export const ContactProfileScreen: React.FC<{
  targetUserId: string;
  onBack: () => void;
  onStartChat?: (userId: string) => void;
}> = ({ targetUserId, onBack, onStartChat }) => {
  const { currentUser, toggleBlockUser } = useAuthStore();
  const { openReportModal, searchResults } = useContactsStore();
  const { chats, deleteChat } = useChatStore();
  const [toast, setToast] = useState<string | null>(null);

  // Find chat by ID or by participant ID
  const foundChat = chats.find((c) => c.id === targetUserId || c.participants?.includes(targetUserId));
  
  // Resolve actual recipient user ID (if targetUserId was the chat ID, extract other participant)
  const resolvedUserId = (foundChat && foundChat.type === 'direct')
    ? ((foundChat as any).otherUserId || foundChat.participants?.find((p) => p !== currentUser?.id) || targetUserId)
    : targetUserId;

  const foundUser = searchResults.find((u) => u.id === resolvedUserId);

  const targetUser: UserProfile | undefined = foundUser || (foundChat ? ({
    id: resolvedUserId,
    name: (foundChat as any).name || 'User',
    username: (foundChat as any).username || (foundChat as any).handle || 'user',
    email: '',
    avatarUrl: (foundChat as any).avatarUrl,
    bio: (foundChat as any).bio || 'Hey there! I am using Relay.',
    statusMessage: 'Available',
    onlineStatus: 'online',
    country: (foundChat as any).country || (foundChat as any).location || 'United States',
    contacts: [],
    blockedUsers: [],
    sentRequests: [],
    receivedRequests: [],
    createdAt: new Date().toISOString()
  } as unknown as UserProfile) : undefined);

  const { updateGroupInfo } = useChatStore();
  const isBlocked = currentUser?.blockedUsers?.includes(targetUserId);

  const handleDisappearingChange = async (val: 'off' | '24h' | '7d' | '90d') => {
    if (foundChat) {
      await updateGroupInfo(foundChat.id, { disappearingMessages: val });
      triggerToast(`Disappearing messages set to ${val === 'off' ? 'Off' : val}`);
    } else {
      triggerToast(`Disappearing messages set to ${val === 'off' ? 'Off' : val}`);
    }
  };

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleShareContact = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`relay.app/u/${targetUser?.username || targetUserId}`);
      triggerToast('Contact link copied to clipboard!');
    }
  };

  const handleDeleteContact = async () => {
    if (foundChat) {
      await deleteChat(foundChat.id);
    }
    triggerToast('Contact deleted');
    setTimeout(() => {
      onBack();
    }, 1000);
  };

  if (!targetUser) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <p className="text-sm font-semibold">User details not found</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 text-left relative flex flex-col pb-28">
      
      {/* Top Header Navigation */}
      <div className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl border-b border-white/80 p-4 flex items-center justify-between shadow-xs">
        <button 
          onClick={onBack}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h2 className="text-xs font-bold text-slate-800 tracking-wide uppercase">Contact Info</h2>

        <button 
          onClick={handleShareContact}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95"
          title="Share Contact"
        >
          <Share2 size={16} />
        </button>
      </div>

      <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-6 flex-1">
        
        {/* Profile Card Header with Refraction Depth */}
        <GlassCard heavy className="p-6 text-center space-y-4 relative overflow-hidden">
          <div className="relative inline-block mx-auto">
            <img 
              src={targetUser.avatarUrl || getLetterAvatar(targetUser.name || targetUser.username)} 
              alt={targetUser.name} 
              className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-xl mx-auto"
            />
            <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
              targetUser.onlineStatus === 'online' ? 'bg-emerald-500' : 'bg-slate-300'
            }`} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{targetUser.name}</h1>
            <span className="text-xs font-mono text-slate-500 font-semibold block mt-0.5">
              {formatHandle(targetUser.username)}
            </span>
            <p className="text-xs text-slate-600 mt-2 font-medium max-w-sm mx-auto leading-relaxed">
              {targetUser.bio || 'Hey there! I am using Relay.'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {onStartChat && (
              <button
                onClick={() => onStartChat(targetUser.id)}
                style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                className="py-2.5 px-5 rounded-2xl text-white text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer hover:opacity-90 active:scale-95 transition-all border border-white/20"
              >
                <MessageSquare size={15} />
                <span>Message</span>
              </button>
            )}

            <GlassButton 
              onClick={handleShareContact} 
              variant="secondary" 
              className="py-2.5 px-4 text-xs font-bold"
            >
              <Share2 size={15} />
              <span>Share</span>
            </GlassButton>
          </div>
        </GlassCard>

        {/* Bio & Information Card */}
        <GlassCard className="p-5 space-y-4">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            About & Phone Number
          </span>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-white/70 rounded-2xl border border-white/80 space-y-1">
              <span className="text-[10px] text-slate-400 font-mono block">Status Message</span>
              <p className="font-semibold text-slate-800">{targetUser.statusMessage || targetUser.bio || 'Available'}</p>
            </div>

            <div className="p-3 bg-white/70 rounded-2xl border border-white/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">Disappearing Messages</span>
                  <span className="font-semibold text-slate-800 text-xs">Auto-delete timer</span>
                </div>
              </div>
              <select
                value={foundChat?.disappearingMessages || 'off'}
                onChange={(e) => handleDisappearingChange(e.target.value as any)}
                className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="off">Off</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
                <option value="90d">90 Days</option>
              </select>
            </div>

            <div className="p-3 bg-white/70 rounded-2xl border border-white/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">Member Since</span>
                  <span className="font-semibold text-slate-800">July 2026</span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Security & Encryption Info */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Lock size={16} className="text-emerald-600" />
            <span>End-to-End Encryption</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            Messages and attachments sent with {targetUser.name} are secured with signal protocol end-to-end encryption.
          </p>
        </GlassCard>

        {/* Bottom Actions: Report and Block User */}
        <div className="space-y-3 pt-4 border-t border-slate-200/80">
          
          {/* Report Button before Block */}
          <GlassCard 
            onClick={() => {
              openReportModal({
                id: targetUser.id,
                name: targetUser.name,
                username: targetUser.username
              } as any);
            }}
            className="p-4 flex items-center gap-3 text-red-600 border-red-200/60 bg-red-50/30 hover:bg-red-50/80 cursor-pointer transition-all"
          >
            <ShieldAlert size={18} />
            <div className="text-left">
              <span className="text-xs font-bold block">Report {targetUser.name}</span>
              <span className="text-[10px] text-red-500/80 font-medium">Flag harmful behavior or spam</span>
            </div>
          </GlassCard>

          {/* Block User */}
          <button
            onClick={() => {
              toggleBlockUser(targetUser.id);
              triggerToast(isBlocked ? `Unblocked ${targetUser.name}` : `Blocked ${targetUser.name}`);
            }}
            className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 cursor-pointer transition-all active:scale-[0.98]"
          >
            <ShieldOff size={16} />
            <span>{isBlocked ? `Unblock ${targetUser.name}` : `Block ${targetUser.name}`}</span>
          </button>

          {/* Delete Contact Button at the VERY BOTTOM */}
          <button
            onClick={async () => {
              if (foundChat) {
                await deleteChat(foundChat.id);
              }
              triggerToast(`Deleted contact ${targetUser.name}`);
              setTimeout(() => {
                onBack();
              }, 1000);
            }}
            className="w-full py-3 px-4 rounded-2xl bg-slate-200 hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-300/80 dark:border-slate-700 cursor-pointer transition-all active:scale-[0.98]"
          >
            <Trash2 size={16} />
            <span>Delete Contact</span>
          </button>

        </div>

      </div>

      {/* Toast Feedback */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-2xl backdrop-blur-md border border-white/20 flex items-center gap-2 pointer-events-none"
          >
            <Check size={14} className="text-emerald-400" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
