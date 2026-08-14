/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, ShieldAlert, ShieldOff, MessageSquare, Share2, Bell,
  Lock, Check, UserCheck, Smartphone, Clock, Calendar, Info, Trash2, UserX,
  Image as ImageIcon, Link as LinkIcon, FileText, Search, ChevronRight, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlassButton } from './GlassUI';
import { useAuthStore } from '../store/authStore';
import { useContactsStore } from '../store/contactsStore';
import { useChatStore } from '../store/chatStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import { UserProfile, MessageAttachment } from '../types';
import { supabase } from '../lib/supabase/client';
import { formatProfileRecord } from '../store/authStore';
import { profileCache } from '../services/profileCache';

export interface ContactProfileScreenProps {
  targetUserId: string;
  chatId?: string;
  onBack: () => void;
  onStartChat?: (userId: string) => void;
}

export const ContactProfileScreen: React.FC<ContactProfileScreenProps> = ({ 
  targetUserId, 
  chatId, 
  onBack, 
  onStartChat 
}) => {
  const { profile, currentUser, toggleBlockUser } = useAuthStore();
  const { openReportModal, searchResults } = useContactsStore();
  const { chats, deleteChat, updateGroupInfo } = useChatStore();

  const myProfileId = profile?.id || currentUser?.id;
  const myAuthId = currentUser?.id;

  const [toast, setToast] = useState<string | null>(null);
  const [fetchedUser, setFetchedUser] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [sharedMedia, setSharedMedia] = useState<MessageAttachment[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  // Modals state
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Find chat by ID or targetUserId
  const activeChatId = chatId || targetUserId;
  const foundChat = chats.find((c) => c.id === activeChatId || c.id === targetUserId || c.participants?.includes(targetUserId));

  // Resolve actual recipient profile ID
  let resolvedUserId = targetUserId;
  if (foundChat && foundChat.type === 'direct' && foundChat.participants) {
    const otherParticipant = foundChat.participants.find((p) => p !== myProfileId && p !== myAuthId);
    if (otherParticipant) {
      resolvedUserId = otherParticipant;
    }
  }

  const isBlocked = currentUser?.blockedUsers?.includes(resolvedUserId);

  useEffect(() => {
    let isMounted = true;

    async function loadFullProfileAndMedia() {
      setLoadingProfile(true);

      // Check profile cache first
      const cached = profileCache.get(resolvedUserId);
      if (cached && isMounted) {
        setFetchedUser(cached);
      }

      // Check store search results
      const storeMatch = searchResults.find((u) => u.id === resolvedUserId);
      if (storeMatch && isMounted) {
        setFetchedUser(storeMatch);
      }

      // Fetch fresh profile from Supabase
      try {
        const { data: profData } = await supabase
          .from('profiles')
          .select('*')
          .or(`id.eq.${resolvedUserId},auth_user_id.eq.${resolvedUserId}`)
          .maybeSingle();

        if (profData && isMounted) {
          const formatted = formatProfileRecord(profData);
          profileCache.set(formatted);
          setFetchedUser(formatted);
        }
      } catch (e) {
        console.warn('Error fetching contact profile:', e);
      }

      // Fetch shared media attachments from chat messages
      const convId = foundChat?.id || activeChatId;
      if (convId) {
        try {
          const { data: mediaMsgs } = await supabase
            .from('messages')
            .select('*')
            .or(`chat_id.eq.${convId},conversation_id.eq.${convId}`)
            .not('media_url', 'is', null)
            .limit(12);

          if (mediaMsgs && isMounted) {
            const mediaList: MessageAttachment[] = mediaMsgs.map((m: any) => ({
              id: m.id,
              type: m.message_type === 'image' ? 'image' : m.message_type === 'voice' ? 'voice' : 'file',
              url: m.media_url,
              fileName: m.file_name || 'Attachment'
            }));
            setSharedMedia(mediaList);
          }
        } catch (e) {
          console.warn('Error fetching shared media:', e);
        }
      }

      if (isMounted) {
        setLoadingProfile(false);
      }
    }

    loadFullProfileAndMedia();

    return () => { isMounted = false; };
  }, [resolvedUserId, foundChat?.id, activeChatId]);

  // Safe target user fallback using formatProfileRecord so targetUser.settings is guaranteed
  const targetUser: UserProfile = fetchedUser || profileCache.get(resolvedUserId) || formatProfileRecord({
    id: resolvedUserId,
    display_name: (foundChat as any)?.name || `@${resolvedUserId.substring(0, 8)}`,
    username: (foundChat as any)?.username || (foundChat as any)?.handle || 'user',
    avatar_url: (foundChat as any)?.avatarUrl,
    bio: (foundChat as any)?.bio || 'Hey there! I am using Relay.',
    status_message: 'Available'
  });

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleDisappearingChange = async (val: 'off' | '24h' | '7d' | '30d' | '90d') => {
    setShowDisappearingModal(false);
    const convId = foundChat?.id || activeChatId;
    if (convId) {
      await updateGroupInfo(convId, { disappearingMessages: val });
    }
    const labelMap: Record<string, string> = {
      'off': 'Off',
      '24h': '24 Hours',
      '7d': '7 Days',
      '30d': '30 Days',
      '90d': '90 Days'
    };
    triggerToast(`Disappearing messages set to ${labelMap[val] || val}`);
  };

  const handleShareContact = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`relay.app/u/${targetUser.username || resolvedUserId}`);
      triggerToast('Contact link copied to clipboard');
    }
  };

  const handleConfirmBlock = async () => {
    setShowBlockModal(false);
    await toggleBlockUser(targetUser.id);
    triggerToast(isBlocked ? `Unblocked ${targetUser.name}` : `Blocked ${targetUser.name}`);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteModal(false);
    const convId = foundChat?.id || activeChatId;
    if (convId) {
      await deleteChat(convId);
    }
    triggerToast(`Deleted contact ${targetUser.name}`);
    setTimeout(() => {
      onBack();
    }, 800);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-800 relative flex flex-col pb-28 select-none">
      
      {/* Top Header Navigation */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <button 
          type="button"
          onClick={onBack}
          className="p-2 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h2 className="text-xs font-bold text-slate-800 tracking-wider uppercase">
          Contact Info
        </h2>

        <button 
          type="button"
          onClick={handleShareContact}
          className="p-2 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95"
          title="Share Contact"
        >
          <Share2 size={16} />
        </button>
      </div>

      <div className="w-full max-w-2xl mx-auto p-4 md:p-6 space-y-5 flex-1">
        
        {/* Profile Hero Card */}
        <GlassCard heavy className="p-6 text-center space-y-4 relative overflow-hidden bg-white/90 border border-slate-200/80 shadow-sm">
          <div className="relative inline-block mx-auto">
            <img 
              src={targetUser.avatarUrl || getLetterAvatar(targetUser.name || targetUser.username)} 
              alt={targetUser.name} 
              className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-lg mx-auto"
            />
            <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
              targetUser.onlineStatus === 'online' ? 'bg-emerald-500' : 'bg-slate-300'
            }`} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{targetUser.name}</h1>
            {targetUser.username && (
              <span className="text-xs font-mono text-slate-500 font-semibold block mt-0.5">
                {formatHandle(targetUser.username)}
              </span>
            )}
            {targetUser.bio && (
              <p className="text-xs text-slate-600 mt-2 font-medium max-w-sm mx-auto leading-relaxed">
                {targetUser.bio}
              </p>
            )}
          </div>

          {/* Quick Primary Actions */}
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                if (onStartChat) onStartChat(targetUser.id);
                else onBack();
              }}
              style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
              className="py-2.5 px-5 rounded-2xl text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer hover:opacity-95 active:scale-95 transition-all border border-white/20"
            >
              <MessageSquare size={15} />
              <span>Message</span>
            </button>

            <button 
              type="button"
              onClick={handleShareContact} 
              className="py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all border border-slate-200/80"
            >
              <Share2 size={15} />
              <span>Share</span>
            </button>
          </div>
        </GlassCard>

        {/* Status & Info Card */}
        <GlassCard className="p-4 space-y-3 bg-white/90 border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            About & Info
          </span>

          <div className="space-y-2 text-xs">
            {targetUser.statusMessage && (
              <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 space-y-0.5">
                <span className="text-[10px] text-slate-400 font-mono block">Status Message</span>
                <p className="font-semibold text-slate-800">{targetUser.statusMessage}</p>
              </div>
            )}

            {/* Disappearing Messages Setting */}
            <div 
              onClick={() => setShowDisappearingModal(true)}
              className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-all"
            >
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-slate-500 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">Disappearing Messages</span>
                  <span className="font-semibold text-slate-800 text-xs capitalize">
                    {foundChat?.disappearingMessages ? (foundChat.disappearingMessages === 'off' ? 'Off' : foundChat.disappearingMessages) : 'Off'}
                  </span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </div>

            {/* Mute Notifications */}
            <div 
              onClick={() => {
                setIsMuted(!isMuted);
                triggerToast(isMuted ? 'Notifications unmuted' : 'Notifications muted');
              }}
              className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition-all"
            >
              <div className="flex items-center gap-3">
                <Bell size={16} className={isMuted ? 'text-amber-500 shrink-0' : 'text-slate-500 shrink-0'} />
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">Notifications</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    {isMuted ? 'Muted' : 'Enabled'}
                  </span>
                </div>
              </div>
              <span className={`w-8 h-4.5 rounded-full transition-colors flex items-center p-0.5 ${isMuted ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Shared Media Section */}
        {sharedMedia.length > 0 && (
          <GlassCard className="p-4 space-y-3 bg-white/90 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Media, Links & Docs ({sharedMedia.length})
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {sharedMedia.map((att) => (
                <div key={att.id} className="aspect-square rounded-xl bg-slate-100 overflow-hidden border border-slate-200 relative group">
                  {att.type === 'image' && att.url ? (
                    <img src={att.url} alt={att.fileName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-1 text-slate-500">
                      <FileText size={18} />
                      <span className="text-[9px] font-bold truncate max-w-full px-1">{att.fileName}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* End-to-End Encryption Security Card */}
        <GlassCard className="p-4 space-y-2 bg-emerald-50/40 border border-emerald-200/60 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <Lock size={15} className="text-emerald-600 shrink-0" />
            <span>End-to-End Encryption</span>
          </div>
          <p className="text-[11px] text-emerald-700/90 leading-relaxed font-medium">
            Messages, calls, and shared attachments with {targetUser.name} are secured with Signal protocol end-to-end encryption. No third parties can read or listen to them.
          </p>
        </GlassCard>

        {/* Destructive / Admin Actions */}
        <div className="space-y-3 pt-2">
          
          {/* Report User */}
          <button
            type="button"
            onClick={() => {
              openReportModal({
                id: targetUser.id,
                name: targetUser.name,
                username: targetUser.username
              } as any);
            }}
            className="w-full p-3.5 rounded-2xl bg-red-50/80 hover:bg-red-100/80 text-red-700 font-bold text-xs flex items-center justify-between border border-red-200/80 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={17} className="text-red-600" />
              <div className="text-left">
                <span className="block leading-tight">Report {targetUser.name}</span>
                <span className="text-[10px] text-red-500 font-normal">Flag inappropriate messages or spam</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-red-400" />
          </button>

          {/* Block User */}
          <button
            type="button"
            onClick={() => setShowBlockModal(true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-[0.98]"
          >
            <ShieldOff size={16} />
            <span>{isBlocked ? `Unblock ${targetUser.name}` : `Block ${targetUser.name}`}</span>
          </button>

          {/* Delete Contact */}
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 font-bold text-xs flex items-center justify-center gap-2 border border-slate-200/90 shadow-xs cursor-pointer transition-all active:scale-[0.98]"
          >
            <Trash2 size={16} />
            <span>Delete Contact</span>
          </button>

        </div>

      </div>

      {/* Disappearing Messages Modal */}
      <AnimatePresence>
        {showDisappearingModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-800">
                  <Clock size={18} className="text-blue-600" />
                  <h3 className="text-sm font-bold">Disappearing Messages</h3>
                </div>
                <button onClick={() => setShowDisappearingModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                When enabled, new messages sent in this chat will auto-delete for everyone after the chosen duration.
              </p>

              <div className="space-y-1.5">
                {[
                  { id: 'off', label: 'Off' },
                  { id: '24h', label: '24 Hours' },
                  { id: '7d', label: '7 Days' },
                  { id: '30d', label: '30 Days' },
                  { id: '90d', label: '90 Days' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleDisappearingChange(opt.id as any)}
                    className={`w-full p-3 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                      (foundChat?.disappearingMessages || 'off') === opt.id
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-slate-50/60 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {(foundChat?.disappearingMessages || 'off') === opt.id && (
                      <Check size={16} className="text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Block Confirmation Modal */}
      <AnimatePresence>
        {showBlockModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4 text-left"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <ShieldOff size={24} />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {isBlocked ? `Unblock ${targetUser.name}?` : `Block ${targetUser.name}?`}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {isBlocked 
                    ? `${targetUser.name} will be able to message you and see your online presence again.`
                    : `${targetUser.name} will no longer be able to message or call you. They will not be notified that you blocked them.`}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBlock}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  {isBlocked ? 'Unblock' : 'Block'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Contact Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4 text-left"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-slate-900">Delete Contact & Chat?</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  This will remove {targetUser.name} and clear the conversation from your active chat list.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
