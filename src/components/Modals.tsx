/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Users, Plus, Search, ShieldAlert } from 'lucide-react';
import { GlassButton, GlassInput } from './GlassUI';
import { useChatStore } from '../store/chatStore';
import { useContactsStore } from '../store/contactsStore';
import { useCommunityStore } from '../store/communityStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

export const ModalsOverlay: React.FC<{
  showNewChatModal: boolean;
  onCloseNewChatModal: () => void;
  showCreateCommunityModal: boolean;
  onCloseCreateCommunityModal: () => void;
  onOpenCreateGroup?: () => void;
  onSelectChat: (chatId: string) => void;
}> = ({
  showNewChatModal,
  onCloseNewChatModal,
  showCreateCommunityModal,
  onCloseCreateCommunityModal,
  onOpenCreateGroup,
  onSelectChat
}) => {
  // Community creation state
  const [commName, setCommName] = useState('');
  const [commHandle, setCommHandle] = useState('');
  const [commDesc, setCommDesc] = useState('');
  const [commCat, setCommCat] = useState('Design & Tech');

  // Forwarding state
  const { forwardingMessage, setForwardingMessage, forwardMessageToChats, chats, createDirectChat } = useChatStore();
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);

  // Contacts & Search
  const { searchResults, searchStatus, searchError, lastSearchQuery, searchUsers, resetSearch, reportModalUser, closeReportModal, submitReport, reportSuccessMessage } = useContactsStore();
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [directSearchQuery, setDirectSearchQuery] = useState('');
  const [isStartingChat, setIsStartingChat] = useState<string | null>(null);
  const [chatStartError, setChatStartError] = useState<string | null>(null);

  React.useEffect(() => {
    if (showNewChatModal) {
      setDirectSearchQuery('');
      setChatStartError(null);
      setIsStartingChat(null);
      resetSearch();
    }
  }, [showNewChatModal]);

  const handleExecuteSearch = () => {
    if (!directSearchQuery.trim()) return;
    setChatStartError(null);
    searchUsers(directSearchQuery);
  };

  const handleCreateCommunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commName.trim() || !commHandle.trim()) return;
    const { createCommunity } = useCommunityStore.getState();
    await createCommunity({
      name: commName,
      handle: commHandle,
      description: commDesc,
      category: commCat
    });
    onCloseCreateCommunityModal();
  };

  const handleForwardSubmit = () => {
    if (forwardTargets.length === 0) return;
    forwardMessageToChats(forwardTargets);
    setForwardTargets([]);
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitReport({
      targetUserId: reportModalUser?.id,
      reason: reportReason,
      details: reportDetails
    });
  };

  return (
    <>
      {/* 1. Direct Contact Search + Create Group Action Sheet */}
      <AnimatePresence>
        {showNewChatModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 border border-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">New Conversation</h3>
                <button onClick={onCloseNewChatModal} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              {/* Prominent [+] Create New Group Action Button */}
              {onOpenCreateGroup && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseNewChatModal();
                    onOpenCreateGroup();
                  }}
                  className="w-full p-3.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/80 flex items-center gap-3 transition-all text-blue-900 cursor-pointer shadow-2xs group"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                    <Plus size={18} />
                  </div>
                  <div className="min-w-0 text-left">
                    <h4 className="text-xs font-bold">Create New Group</h4>
                    <p className="text-[10px] text-blue-600 font-medium">Multi-user group with custom handles & controls</p>
                  </div>
                </button>
              )}

              {/* Direct Message Search & Contact List */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <GlassInput 
                      placeholder="@ username or name"
                      icon={<Search size={15} />}
                      value={directSearchQuery}
                      onChange={(e) => setDirectSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleExecuteSearch();
                        }
                      }}
                      autoFocus
                    />
                  </div>
                  <GlassButton
                    variant="primary"
                    onClick={handleExecuteSearch}
                    disabled={searchStatus === 'loading' || !directSearchQuery.trim()}
                    className="px-4 py-2 text-xs shrink-0 cursor-pointer"
                  >
                    {searchStatus === 'loading' ? 'Searching...' : 'Search'}
                  </GlassButton>
                </div>

                {chatStartError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium text-left">
                    {chatStartError}
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {searchStatus === 'idle' && (
                    <div className="text-center py-8 space-y-1">
                      <p className="text-xs font-semibold text-slate-600">Find someone on Relay</p>
                      <p className="text-[11px] text-slate-400">Search by name or username.</p>
                    </div>
                  )}

                  {searchStatus === 'loading' && (
                    <div className="text-center py-8 space-y-2">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs font-medium text-slate-500">Searching...</p>
                    </div>
                  )}

                  {searchStatus === 'error' && (
                    <div className="text-center py-8 space-y-1">
                      <p className="text-xs font-semibold text-rose-600">
                        {searchError || "We couldn't complete the search. Try again."}
                      </p>
                    </div>
                  )}

                  {searchStatus === 'empty' && (
                    <div className="text-center py-8 space-y-1">
                      <p className="text-xs font-semibold text-slate-500 px-2">
                        No members found matching "{lastSearchQuery}"
                      </p>
                    </div>
                  )}

                  {searchStatus === 'success' && searchResults.map((user) => (
                    <div 
                      key={user.id}
                      onClick={async () => {
                        if (isStartingChat) return;
                        setIsStartingChat(user.id);
                        setChatStartError(null);
                        try {
                          const chatId = await createDirectChat(user.id);
                          if (chatId) {
                            onCloseNewChatModal();
                            onSelectChat(chatId);
                          } else {
                            setChatStartError('Failed to start conversation. Please try again.');
                          }
                        } catch (err: any) {
                          console.error("[Relay Direct Chat UI] Error starting conversation:", err);
                          setChatStartError(err.message || 'Failed to start conversation. Please try again.');
                        } finally {
                          setIsStartingChat(null);
                        }
                      }}
                      className="p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img 
                          src={user.avatarUrl || getLetterAvatar(user.name || user.username)} 
                          alt={user.name || user.username} 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getLetterAvatar(user.name || user.username);
                          }}
                          className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200" 
                        />
                        <div className="min-w-0 text-left">
                          <h4 className="text-xs font-bold text-slate-800 truncate">{user.name || user.username}</h4>
                          <span className="text-[10px] text-blue-600 font-mono block truncate">{formatHandle(user.username)}</span>
                          {user.bio && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{user.bio}</p>}
                        </div>
                      </div>
                      <GlassButton variant="secondary" className="py-1 px-3 text-[10px] shrink-0">
                        {isStartingChat === user.id ? 'Connecting...' : 'Message'}
                      </GlassButton>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Message Forwarding Modal */}
      <AnimatePresence>
        {forwardingMessage && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 border border-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Forward Message</h3>
                <button onClick={() => setForwardingMessage(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-100 rounded-2xl text-xs text-slate-700 font-medium italic border-l-2 border-blue-500">
                "{forwardingMessage.content}"
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Target Chats</span>
                {chats.map((c) => {
                  const isSel = forwardTargets.includes(c.id);
                  return (
                    <div 
                      key={c.id}
                      onClick={() => {
                        setForwardTargets((prev) => isSel ? prev.filter((id) => id !== c.id) : [...prev, c.id]);
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer ${
                        isSel ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-white border-slate-100 text-slate-700'
                      }`}
                    >
                      <span>{c.name}</span>
                      {isSel && <Check size={14} className="text-blue-600" />}
                    </div>
                  );
                })}
              </div>

              <GlassButton 
                onClick={handleForwardSubmit} 
                disabled={forwardTargets.length === 0} 
                variant="primary" 
                className="w-full py-2.5 text-xs"
              >
                Forward Message ({forwardTargets.length})
              </GlassButton>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Create Community Modal */}
      <AnimatePresence>
        {showCreateCommunityModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 border border-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Create Community</h3>
                <button onClick={onCloseCreateCommunityModal} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateCommunitySubmit} className="space-y-3">
                <GlassInput 
                  label="Community Name"
                  placeholder="e.g. Glassline Studio"
                  value={commName}
                  onChange={(e) => setCommName(e.target.value)}
                />
                <GlassInput 
                  label="Community Handle"
                  placeholder="glassline"
                  value={commHandle}
                  onChange={(e) => setCommHandle(e.target.value)}
                />
                <GlassInput 
                  label="Category"
                  placeholder="Design & Tech"
                  value={commCat}
                  onChange={(e) => setCommCat(e.target.value)}
                />
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Description</label>
                  <textarea 
                    value={commDesc}
                    onChange={(e) => setCommDesc(e.target.value)}
                    rows={3}
                    placeholder="Describe your community rules, topics, and channels..."
                    className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none"
                  />
                </div>

                <GlassButton type="submit" variant="primary" className="w-full py-2.5 text-xs">
                  Create Community
                </GlassButton>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Report User Modal */}
      <AnimatePresence>
        {reportModalUser && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 border border-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                  <ShieldAlert size={16} />
                  <span>Report User ({reportModalUser.name})</span>
                </h3>
                <button onClick={closeReportModal} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              {reportSuccessMessage ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl font-medium">
                  {reportSuccessMessage}
                </div>
              ) : (
                <form onSubmit={handleReportSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Reason</label>
                    <select 
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl glass-input text-xs text-slate-800 font-semibold"
                    >
                      <option value="spam">Spam or Unsolicited Promotion</option>
                      <option value="harassment">Harassment or Bullying</option>
                      <option value="impersonation">Impersonation of Handle</option>
                      <option value="other">Other Community Violation</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Details</label>
                    <textarea 
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      rows={3}
                      placeholder="Provide additional details regarding this report..."
                      className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none"
                    />
                  </div>

                  <GlassButton type="submit" variant="danger" className="w-full py-2.5 text-xs">
                    Submit Safety Report
                  </GlassButton>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
