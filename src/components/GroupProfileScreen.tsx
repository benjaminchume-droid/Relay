/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ArrowLeft, Users, Shield, UserPlus, Copy, Clock, MoreVertical, 
  X, Check, LogOut, Lock, Globe, Settings, UserMinus, ShieldAlert, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useContactsStore } from '../store/contactsStore';
import { useThemeStore, ACCENT_COLOR_CONFIG } from '../store/themeStore';
import { Chat, UserProfile } from '../types';
import { GlassCard, GlassButton } from './GlassUI';
import { getLetterAvatar } from '../lib/avatar';
import { getGroupInviteUrl } from '../lib/authRedirect';

export const GroupProfileScreen: React.FC<{
  chatId: string;
  onBack: () => void;
}> = ({ chatId, onBack }) => {
  const { currentUser } = useAuthStore();
  const { chats, updateGroupInfo, addGroupMembers, removeGroupMember, updateMemberRole, deleteChat } = useChatStore();
  const { searchResults, searchUsers } = useContactsStore();
  const { customization } = useThemeStore();

  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [selectedAddUsers, setSelectedAddUsers] = useState<string[]>([]);
  const [selectedMemberModal, setSelectedMemberModal] = useState<{ id: string; role: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  React.useEffect(() => {
    if (showAddMemberModal) {
      searchUsers(addMemberSearch);
    }
  }, [showAddMemberModal, addMemberSearch]);

  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];
  const chat = chats.find((c) => c.id === chatId);

  if (!chat) {
    return (
      <div className="w-full min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center text-slate-700">
        <p className="text-sm font-semibold mb-3">Group details unavailable</p>
        <button 
          onClick={onBack} 
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800"
        >
          Go Back
        </button>
      </div>
    );
  }

  const roles = chat.roles || {};
  const myRole = roles[currentUser?.id || ''] || (chat.participants[0] === currentUser?.id ? 'creator' : 'member');
  const isAdmin = myRole === 'creator' || myRole === 'admin';

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const permissions = chat.permissions || {
    sendMessages: 'everyone',
    editGroupInfo: 'admins',
    requiresApproval: false,
    privacy: 'public'
  };

  const handleDisappearingChange = async (val: 'off' | '24h' | '7d' | '90d') => {
    await updateGroupInfo(chat.id, { disappearingMessages: val });
    triggerToast(`Disappearing messages set to ${val === 'off' ? 'Off' : val}`);
  };

  const handleTogglePrivacy = async () => {
    const newPrivacy = permissions.privacy === 'public' ? 'private' : 'public';
    await updateGroupInfo(chat.id, {
      permissions: { ...permissions, privacy: newPrivacy }
    });
    triggerToast(`Group is now ${newPrivacy}`);
  };

  const handleToggleApproval = async () => {
    const newApproval = !permissions.requiresApproval;
    await updateGroupInfo(chat.id, {
      permissions: { ...permissions, requiresApproval: newApproval }
    });
    triggerToast(`Admin approval ${newApproval ? 'enabled' : 'disabled'}`);
  };

  const handleSendMessagesRule = async (rule: 'everyone' | 'admins') => {
    await updateGroupInfo(chat.id, {
      permissions: { ...permissions, sendMessages: rule }
    });
    triggerToast(`Messaging restricted to ${rule}`);
  };

  const handleEditInfoRule = async (rule: 'everyone' | 'admins') => {
    await updateGroupInfo(chat.id, {
      permissions: { ...permissions, editGroupInfo: rule }
    });
    triggerToast(`Group edit info restricted to ${rule}`);
  };

  const handleAddMembersSubmit = async () => {
    if (selectedAddUsers.length === 0) return;
    await addGroupMembers(chat.id, selectedAddUsers);
    triggerToast(`Added ${selectedAddUsers.length} member(s)`);
    setSelectedAddUsers([]);
    setShowAddMemberModal(false);
  };

  const handleDeleteGroup = async () => {
    if (chat) {
      await deleteChat(chat.id);
      onBack();
    }
  };

  const handleExitGroup = async () => {
    if (currentUser) {
      await removeGroupMember(chat.id, currentUser.id);
      onBack();
    }
  };

  const handleCopyLink = () => {
    const link = chat.inviteLink || getGroupInviteUrl(chat.id);
    navigator.clipboard.writeText(link);
    triggerToast('Group invite link copied!');
  };

  return (
    <div className="w-full h-screen bg-[#F2F5F8] flex flex-col justify-between overflow-y-auto relative select-none">
      
      {/* Top Bar */}
      <div className="p-3 sticky top-0 z-30 bg-[#F2F5F8]/80 backdrop-blur-xl border-b border-white/60">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button 
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-xs border border-white hover:scale-105 transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-bold text-slate-800">Group Info</span>
          {isAdmin ? (
            <button 
              onClick={() => setShowPermissionsModal(true)}
              className="w-9 h-9 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-xs border border-white hover:scale-105 transition-all cursor-pointer"
              title="Group Permissions & Settings"
            >
              <MoreVertical size={18} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>
      </div>

      <div className="max-w-xl w-full mx-auto p-4 space-y-4 flex-1">

        {/* Group Hero Card */}
        <GlassCard className="p-5 flex flex-col items-center text-center space-y-3 relative overflow-hidden">
          <div className="relative">
            <img 
              src={chat.avatarUrl || getLetterAvatar(chat.name)} 
              alt={chat.name}
              className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md"
            />
            <span className="absolute bottom-0 right-0 p-1.5 rounded-full bg-blue-600 text-white shadow-md">
              <Users size={12} />
            </span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{chat.name}</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{chat.description || 'Group Chat'}</p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 flex items-center gap-1">
              <Users size={11} /> {chat.participants.length} Members
            </span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
              permissions.privacy === 'public'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {permissions.privacy === 'public' ? <Globe size={11} /> : <Lock size={11} />}
              {permissions.privacy === 'public' ? 'Public Group' : 'Private Group'}
            </span>
          </div>
        </GlassCard>

        {/* Disappearing Messages & Link Settings */}
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Clock size={16} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Disappearing Messages</h4>
                <p className="text-[10px] text-slate-500">Auto-delete messages after duration</p>
              </div>
            </div>
            <select
              value={chat.disappearingMessages || 'off'}
              onChange={(e) => handleDisappearingChange(e.target.value as any)}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="off">Off</option>
              <option value="24h">24 Hours</option>
              <option value="7d">7 Days</option>
              <option value="90d">90 Days</option>
            </select>
          </div>

          {/* Group Invite Link */}
          <div className="flex items-center justify-between pt-1">
            <div className="min-w-0 flex-1 mr-3">
              <h4 className="text-xs font-bold text-slate-800">Invite Link</h4>
              <p className="text-[10px] text-slate-400 font-mono truncate">{chat.inviteLink || getGroupInviteUrl(chat.id)}</p>
            </div>
            <button
              onClick={handleCopyLink}
              style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
              className="px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer hover:scale-105 transition-all"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        </GlassCard>

        {/* Members Section Header & Add Members Button */}
        <div className="flex items-center justify-between pt-2 px-1">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Group Members ({chat.participants.length})</h3>
          {isAdmin && (
            <button
              onClick={() => setShowAddMemberModal(true)}
              style={{ color: 'var(--primary-accent, #2563EB)' }}
              className="text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <UserPlus size={14} /> Add Members
            </button>
          )}
        </div>

        {/* Members List */}
        <GlassCard className="p-2 space-y-1 divide-y divide-slate-100">
          {chat.participants.map((pId) => {
            const role = roles[pId] || (pId === chat.participants[0] ? 'creator' : 'member');
            const isMe = pId === currentUser?.id;
            const myIsCreator = myRole === 'creator';

            return (
              <div 
                key={pId} 
                onClick={() => {
                  if ((myIsCreator || isAdmin) && !isMe && role !== 'creator') {
                    setSelectedMemberModal({ id: pId, role });
                  }
                }}
                className={`p-2.5 flex items-center justify-between gap-3 rounded-2xl hover:bg-slate-50/80 transition-colors ${
                  (myIsCreator || isAdmin) && !isMe && role !== 'creator' ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <img 
                      src={getLetterAvatar(isMe ? (currentUser?.name || 'You') : `User ${pId.slice(-4)}`)} 
                      alt="User"
                      className="w-9 h-9 rounded-full object-cover border border-white shadow-xs" 
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {isMe ? 'You' : `User ${pId.slice(-4)}`}
                      </span>
                      {role === 'creator' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-extrabold border border-amber-200">
                          Creator
                        </span>
                      )}
                      {role === 'admin' && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[9px] font-extrabold border border-blue-200">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isAdmin && !isMe && role !== 'creator' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMemberModal({ id: pId, role });
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Member Options"
                  >
                    <MoreVertical size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </GlassCard>

        {/* Bottom Group Action (Delete for creator, Exit for member) */}
        <div className="pt-4">
          {myRole === 'creator' ? (
            <button
              onClick={handleDeleteGroup}
              className="w-full py-3 px-4 rounded-2xl bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-700 transition-all cursor-pointer shadow-md active:scale-98"
            >
              <Trash2 size={16} /> Delete Group
            </button>
          ) : (
            <button
              onClick={handleExitGroup}
              className="w-full py-3 px-4 rounded-2xl bg-red-50 border border-red-200 text-red-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <LogOut size={16} /> Exit Group
            </button>
          )}
        </div>

      </div>

      {/* Admin Permissions Modal - simplified restore of core UI */}
      <AnimatePresence>
        {showPermissionsModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-white space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Shield size={16} className="text-blue-600" /> Group Permissions
                </h3>
                <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <h5 className="font-bold text-slate-800">Admin Approval</h5>
                    <p className="text-[10px] text-slate-500">Require approval to join via link</p>
                  </div>
                  <input type="checkbox" checked={permissions.requiresApproval} onChange={handleToggleApproval} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <h5 className="font-bold text-slate-800">Public Group</h5>
                    <p className="text-[10px] text-slate-500">Findable in explore & search</p>
                  </div>
                  <input type="checkbox" checked={permissions.privacy === 'public'} onChange={handleTogglePrivacy} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                </div>
              </div>
              <GlassButton onClick={() => setShowPermissionsModal(false)} variant="primary" className="w-full py-2.5 text-xs">Done</GlassButton>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
