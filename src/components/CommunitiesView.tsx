/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Plus, Heart, MessageCircle, Sparkles, Users, ArrowLeft, 
  Search, Shield, Check, UserCheck, ChevronRight, Info, Send, X,
  Lock, Globe, Share2, Copy, LogOut, MoreVertical, Trash2, Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { useCommunityStore } from '../store/communityStore';
import { useAuthStore } from '../store/authStore';
import { formatHandle, formatRelativeTime } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import { Community, CommunityPost } from '../types';

export const CommunitiesView: React.FC<{
  onOpenCreateCommunityModal: () => void;
  onCommunityChatStateChange?: (isOpen: boolean) => void;
}> = ({ onOpenCreateCommunityModal, onCommunityChatStateChange }) => {
  const [selectedCommId, setSelectedCommId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostImage, setNewPostImage] = useState<string>('');
  const [showCreateThreadModal, setShowCreateThreadModal] = useState(false);
  const [activeThreadPost, setActiveThreadPost] = useState<CommunityPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showCommunityInfo, setShowCommunityInfo] = useState(false);
  const [showFab, setShowFab] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const { 
    communities, 
    posts,
    fetchCommunities,
    joinCommunity, 
    leaveCommunity,
    deleteCommunity,
    createPost, 
    likePost,
    addComment,
    updateCommunityInfo
  } = useCommunityStore();

  const { currentUser } = useAuthStore();

  useEffect(() => {
    fetchCommunities();
  }, []);

  useEffect(() => {
    onCommunityChatStateChange?.(!!selectedCommId);
  }, [selectedCommId]);

  // Hide/show FAB on scroll
  useEffect(() => {
    let lastY = window.scrollY;
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastY + 10) setShowFab(false);
      else if (currentY < lastY - 10) setShowFab(true);
      lastY = currentY;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const selectedCommunity = communities.find((c) => c.id === selectedCommId);
  const activePosts = selectedCommunity ? (posts[selectedCommunity.id] || []) : [];

  const handlePostSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPostContent.trim() || !selectedCommunity) return;
    await createPost(selectedCommunity.id, {
      title: newPostTitle,
      content: newPostContent,
      imageUrl: newPostImage || undefined
    });
    setNewPostContent('');
    setNewPostTitle('');
    setNewPostImage('');
    setShowCreateThreadModal(false);
    triggerToast('Thread published!');
  };

  const handleThreadImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setNewPostImage(evt.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !activeThreadPost || !selectedCommunity) return;
    await addComment(selectedCommunity.id, activeThreadPost.id, commentText);
    setCommentText('');
    triggerToast('Comment added!');
  };

  const filteredCommunities = communities.filter((c) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.category && c.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const joinedCommunities = filteredCommunities.filter((c) => c.isJoined);
  const discoverCommunities = filteredCommunities.filter((c) => !c.isJoined);

  /* Detailed Community Screen View (when tapped) */
  if (selectedCommunity) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-28 text-left animate-fadeIn">
        
        {/* Top Header Bar with Community Avatar and Profile */}
        <div className="sticky top-0 z-30 bg-white/75 backdrop-blur-2xl border-b border-white/80 p-3 -mx-4 -mt-4 mb-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button 
              onClick={() => setSelectedCommId(null)}
              className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1 text-xs font-bold shrink-0"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Back</span>
            </button>

            {/* Clickable Header Info for Community Info Screen */}
            <div 
              onClick={() => setShowCommunityInfo(true)}
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <img 
                src={selectedCommunity.avatarUrl || getLetterAvatar(selectedCommunity.name)} 
                alt={selectedCommunity.name} 
                className="w-10 h-10 rounded-2xl object-cover border border-white shadow-xs shrink-0"
              />

              <div className="min-w-0 flex-1 text-left">
                <h2 className="text-sm font-bold text-slate-900 truncate">
                  {selectedCommunity.name}
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                  <span>{formatHandle(selectedCommunity.handle)}</span>
                  <span>•</span>
                  <span>{selectedCommunity.memberCount} members</span>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowCommunityInfo(true)}
            className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all active:scale-95 ml-2 shrink-0"
            title="Community Info"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        {/* Community Discussion Feed */}
        <div className="space-y-4">
          {activePosts.length === 0 ? (
            <GlassCard className="p-8 text-center text-slate-500 space-y-2">
              <Users size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No community posts yet</p>
              <p className="text-xs text-slate-400">Be the first to share an update in #{selectedCommunity.name}!</p>
            </GlassCard>
          ) : (
            activePosts.map((post) => (
              <GlassCard 
                key={post.id} 
                onClick={() => setActiveThreadPost(post)}
                className="p-4 space-y-3 cursor-pointer hover:bg-white/95 transition-all"
              >
                <div className="flex items-center gap-3">
                  <img 
                    src={post.authorAvatar || getLetterAvatar(post.authorName)} 
                    alt="author" 
                    className="w-9 h-9 rounded-full object-cover border border-white shadow-xs" 
                  />
                  <div className="text-left">
                    <h4 className="text-xs font-bold text-slate-800">{post.authorName}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">{formatRelativeTime(post.timestamp)}</span>
                  </div>
                </div>

                {post.title && <h3 className="text-xs font-bold text-slate-900">{post.title}</h3>}

                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {post.content}
                </p>

                {post.imageUrl && (
                  <img src={post.imageUrl} alt="post visual" className="rounded-2xl max-h-72 w-full object-cover border border-white/60 shadow-xs" />
                )}

                <div className="flex items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      likePost(selectedCommunity.id, post.id);
                    }}
                    className={`flex items-center gap-1.5 font-semibold cursor-pointer transition-colors ${
                      post.isLiked ? 'text-rose-600' : 'hover:text-slate-800'
                    }`}
                  >
                    <Heart size={15} className={post.isLiked ? 'fill-rose-600' : ''} />
                    <span>{post.likesCount}</span>
                  </button>

                  <div className="flex items-center gap-1.5 font-semibold hover:text-slate-800">
                    <MessageCircle size={15} />
                    <span>{post.commentsCount || (post.comments?.length || 0)} comments</span>
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </div>

        {/* Floating Action Button (FAB) inside community view to quickly post an update */}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setShowCreateThreadModal(true)}
          style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
          className="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl border-2 border-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
          title="Share Update / Create Thread"
        >
          <Plus size={24} />
        </motion.button>

        {/* Community Info Screen / Modal overlay */}
        <AnimatePresence>
          {showCommunityInfo && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white space-y-4 text-left relative max-h-[90vh] overflow-y-auto"
              >
                <button 
                  onClick={() => setShowCommunityInfo(false)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>

                <div className="text-center space-y-3 pt-2">
                  <img 
                    src={selectedCommunity.avatarUrl || getLetterAvatar(selectedCommunity.name)} 
                    alt={selectedCommunity.name} 
                    className="w-20 h-20 rounded-3xl object-cover border-4 border-white shadow-md mx-auto"
                  />
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{selectedCommunity.name}</h2>
                    <p className="text-xs font-mono text-slate-500">{formatHandle(selectedCommunity.handle)}</p>
                  </div>
                  <p className="text-xs text-slate-600 font-medium px-4">{selectedCommunity.description}</p>
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-blue-600" />
                      <span className="font-bold text-slate-800">Total Members</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedCommunity.memberCount}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      {selectedCommunity.isPrivate ? <Lock size={16} className="text-amber-600" /> : <Globe size={16} className="text-emerald-600" />}
                      <div>
                        <span className="font-bold text-slate-800 block">Privacy Setting</span>
                        <span className="text-[10px] text-slate-500">{selectedCommunity.isPrivate ? 'Private (Invite required)' : 'Public (Searchable)'}</span>
                      </div>
                    </div>
                    {selectedCommunity.ownerId === currentUser?.id && (
                      <button
                        onClick={async () => {
                          await updateCommunityInfo(selectedCommunity.id, { isPrivate: !selectedCommunity.isPrivate });
                          triggerToast(`Updated privacy to ${!selectedCommunity.isPrivate ? 'Private' : 'Public'}`);
                        }}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0 mr-2">
                      <Share2 size={16} className="text-purple-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 block">Invite Link</span>
                        <span className="text-[10px] text-slate-400 font-mono truncate block">{`https://relay.app/c/${selectedCommunity.handle}`}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://relay.app/c/${selectedCommunity.handle}`);
                        triggerToast('Invite link copied!');
                      }}
                      style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                      className="px-3 py-1.5 rounded-xl text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-xs"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                </div>

                {selectedCommunity.ownerId === currentUser?.id ? (
                  <button
                    onClick={async () => {
                      await deleteCommunity(selectedCommunity.id);
                      setShowCommunityInfo(false);
                      setSelectedCommId(null);
                    }}
                    className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-700 transition-colors cursor-pointer shadow-md"
                  >
                    <Trash2 size={16} /> Delete Community
                  </button>
                ) : selectedCommunity.isJoined ? (
                  <button
                    onClick={async () => {
                      await leaveCommunity(selectedCommunity.id);
                      setShowCommunityInfo(false);
                      setSelectedCommId(null);
                    }}
                    className="w-full py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <LogOut size={16} /> Leave Community
                  </button>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Thread Modal */}
        <AnimatePresence>
          {showCreateThreadModal && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-white space-y-4 text-left relative"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Sparkles size={16} className="text-blue-500" />
                    <span>Create New Thread in #{selectedCommunity.name}</span>
                  </h3>
                  <button 
                    onClick={() => setShowCreateThreadModal(false)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handlePostSubmit} className="space-y-4">
                  <input 
                    type="text"
                    placeholder="Title (optional)..."
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                  />

                  <textarea 
                    placeholder="What's on your mind? Share updates, questions, or ideas..."
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    rows={4}
                    required
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500"
                  />

                  {newPostImage ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 max-h-48">
                      <img src={newPostImage} alt="thread visual" className="w-full h-48 object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setNewPostImage('')} 
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-all">
                      <ImageIcon size={14} className="text-blue-600" /> Attach Image
                      <input type="file" accept="image/*" onChange={handleThreadImageUpload} className="hidden" />
                    </label>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <GlassButton type="button" onClick={() => setShowCreateThreadModal(false)} variant="secondary" className="py-2 px-4 text-xs">
                      Cancel
                    </GlassButton>
                    <GlassButton type="submit" variant="primary" disabled={!newPostContent.trim()} className="py-2 px-6 text-xs font-bold">
                      Publish Thread
                    </GlassButton>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Post Thread / Comments Modal */}
        <AnimatePresence>
          {activeThreadPost && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-white space-y-4 text-left relative max-h-[85vh] flex flex-col"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 shrink-0">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MessageCircle size={16} className="text-blue-600" /> Thread Comments
                  </h3>
                  <button onClick={() => setActiveThreadPost(null)} className="text-slate-400 hover:text-slate-700">
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <img src={activeThreadPost.authorAvatar || getLetterAvatar(activeThreadPost.authorName)} alt="" className="w-7 h-7 rounded-full object-cover" />
                    <span className="text-xs font-bold text-slate-800">{activeThreadPost.authorName}</span>
                  </div>
                  {activeThreadPost.title && <h4 className="text-xs font-bold text-slate-900">{activeThreadPost.title}</h4>}
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">{activeThreadPost.content}</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-slate-100">
                  {(activeThreadPost.comments || []).length === 0 ? (
                    <p className="text-xs text-center text-slate-400 py-6">No comments yet. Start the discussion below!</p>
                  ) : (
                    (activeThreadPost.comments || []).map((cmt) => (
                      <div key={cmt.id} className="pt-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={cmt.authorAvatar || getLetterAvatar(cmt.authorName)} alt="" className="w-5 h-5 rounded-full object-cover" />
                            <span className="font-bold text-slate-800">{cmt.authorName}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">{formatRelativeTime(cmt.timestamp)}</span>
                        </div>
                        <p className="text-slate-700 pl-7">{cmt.content}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 py-2 px-3.5 rounded-2xl bg-slate-100 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                    className="p-2 rounded-2xl text-white shadow-md disabled:opacity-40 cursor-pointer hover:scale-105 transition-all"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  /* Default Vertical Joined Communities List View */
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-28 text-left">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Communities</h1>
          <p className="text-xs text-slate-500 font-medium">Vertical directory of your channels & hubs</p>
        </div>
      </div>

      {/* Search Input */}
      <GlassInput 
        placeholder="Search joined communities..."
        icon={<Search size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Vertical List of Joined Communities */}
      <div className="space-y-4">
        
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Joined Communities ({joinedCommunities.length})
          </span>
        </div>

        {joinedCommunities.length === 0 ? (
          <GlassCard className="p-8 text-center text-slate-500 space-y-2">
            <Users size={32} className="mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No joined communities yet</p>
            <p className="text-xs text-slate-400">Discover and join communities below to start participating!</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {joinedCommunities.map((comm) => (
              <GlassCard
                key={comm.id}
                onClick={() => setSelectedCommId(comm.id)}
                className="p-3.5 flex items-center justify-between gap-3 border-white/80 hover:bg-white/90 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <img 
                    src={comm.avatarUrl || getLetterAvatar(comm.name)} 
                    alt={comm.name} 
                    className="w-12 h-12 rounded-2xl object-cover border border-white shadow-xs shrink-0 group-hover:scale-105 transition-transform"
                  />

                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-xs font-bold text-slate-800 truncate">{comm.name}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[9px] font-bold shrink-0">
                        Joined
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium truncate">
                      <span className="font-mono text-[10px]">@{comm.handle}</span>
                      <span>•</span>
                      <span>{comm.memberCount} members</span>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {comm.description || 'Public Relay community feed'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Discover Communities Section (Vertical Cards) */}
        {discoverCommunities.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-200/60">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 block">
              Discover Other Communities ({discoverCommunities.length})
            </span>

            <div className="grid grid-cols-1 gap-2.5">
              {discoverCommunities.map((comm) => (
                <GlassCard
                  key={comm.id}
                  onClick={() => setSelectedCommId(comm.id)}
                  className="p-3.5 flex items-center justify-between gap-3 border-white/80 hover:bg-white/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <img 
                      src={comm.avatarUrl || getLetterAvatar(comm.name)} 
                      alt={comm.name} 
                      className="w-12 h-12 rounded-2xl object-cover border border-white shadow-xs shrink-0"
                    />

                    <div className="min-w-0 flex-1 text-left">
                      <h3 className="text-xs font-bold text-slate-800 truncate">{comm.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span className="font-mono text-[10px]">@{comm.handle}</span>
                        <span>•</span>
                        <span>{comm.memberCount} members</span>
                      </div>
                    </div>
                  </div>

                  <GlassButton 
                    onClick={(e) => {
                      e.stopPropagation();
                      joinCommunity(comm.id);
                    }}
                    variant="primary"
                    className="py-1.5 px-3 text-xs shrink-0 font-bold"
                  >
                    Join
                  </GlassButton>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Floating Action Bubble (FAB) for Create Community at Bottom Right */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={onOpenCreateCommunityModal}
            style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
            className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl border-2 border-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
            title="Create New Community"
          >
            <Plus size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Community Info Modal / Screen */}
      <AnimatePresence>
        {showCommunityInfo && selectedCommunity && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-white space-y-4 text-left relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowCommunityInfo(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="text-center space-y-3 pt-2">
                <img 
                  src={selectedCommunity.avatarUrl || getLetterAvatar(selectedCommunity.name)} 
                  alt="" 
                  className="w-20 h-20 rounded-3xl object-cover border-4 border-white shadow-md mx-auto"
                />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedCommunity.name}</h2>
                  <p className="text-xs font-mono text-slate-500">{formatHandle(selectedCommunity.handle)}</p>
                </div>
                <p className="text-xs text-slate-600 font-medium px-4">{selectedCommunity.description}</p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-600" />
                    <span className="font-bold text-slate-800">Total Members</span>
                  </div>
                  <span className="font-bold text-slate-900">{selectedCommunity.memberCount}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2">
                    {selectedCommunity.isPrivate ? <Lock size={16} className="text-amber-600" /> : <Globe size={16} className="text-emerald-600" />}
                    <div>
                      <span className="font-bold text-slate-800 block">Privacy Setting</span>
                      <span className="text-[10px] text-slate-500">{selectedCommunity.isPrivate ? 'Private (Invite required)' : 'Public (Searchable)'}</span>
                    </div>
                  </div>
                  {selectedCommunity.ownerId === currentUser?.id && (
                    <button
                      onClick={async () => {
                        await updateCommunityInfo(selectedCommunity.id, { isPrivate: !selectedCommunity.isPrivate });
                        triggerToast(`Updated privacy to ${!selectedCommunity.isPrivate ? 'Private' : 'Public'}`);
                      }}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-2 min-w-0 mr-2">
                    <Share2 size={16} className="text-purple-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block">Invite Link</span>
                      <span className="text-[10px] text-slate-400 font-mono truncate block">{`https://relay.app/c/${selectedCommunity.handle}`}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://relay.app/c/${selectedCommunity.handle}`);
                      triggerToast('Invite link copied!');
                    }}
                    style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                    className="px-3 py-1.5 rounded-xl text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-xs"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>

              {selectedCommunity.ownerId === currentUser?.id ? (
                <button
                  onClick={async () => {
                    await deleteCommunity(selectedCommunity.id);
                    setShowCommunityInfo(false);
                    setSelectedCommId(null);
                  }}
                  className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-700 transition-colors cursor-pointer shadow-md"
                >
                  <Trash2 size={16} /> Delete Community
                </button>
              ) : selectedCommunity.isJoined ? (
                <button
                  onClick={async () => {
                    await leaveCommunity(selectedCommunity.id);
                    setShowCommunityInfo(false);
                    setSelectedCommId(null);
                  }}
                  className="w-full py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <LogOut size={16} /> Leave Community
                </button>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Thread Modal */}
      <AnimatePresence>
        {showCreateThreadModal && selectedCommunity && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-white space-y-4 text-left relative"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-500" />
                  <span>Create New Thread in #{selectedCommunity.name}</span>
                </h3>
                <button 
                  onClick={() => setShowCreateThreadModal(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handlePostSubmit} className="space-y-4">
                <input 
                  type="text"
                  placeholder="Title (optional)..."
                  value={newPostTitle}
                  onChange={(e) => setNewPostTitle(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                />

                <textarea 
                  placeholder="What's on your mind? Share updates, questions, or ideas..."
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  rows={4}
                  required
                  className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500"
                />

                {/* Optional Image upload preview */}
                {newPostImage ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 max-h-48">
                    <img src={newPostImage} alt="thread visual" className="w-full h-48 object-cover" />
                    <button 
                      type="button" 
                      onClick={() => setNewPostImage('')} 
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-all">
                    <ImageIcon size={14} className="text-blue-600" /> Attach Image
                    <input type="file" accept="image/*" onChange={handleThreadImageUpload} className="hidden" />
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <GlassButton type="button" onClick={() => setShowCreateThreadModal(false)} variant="secondary" className="py-2 px-4 text-xs">
                    Cancel
                  </GlassButton>
                  <GlassButton type="submit" variant="primary" disabled={!newPostContent.trim()} className="py-2 px-6 text-xs font-bold">
                    Publish Thread
                  </GlassButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post Thread / Comments Modal */}
      <AnimatePresence>
        {activeThreadPost && selectedCommunity && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-white space-y-4 text-left relative max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 shrink-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MessageCircle size={16} className="text-blue-600" /> Thread Comments
                </h3>
                <button onClick={() => setActiveThreadPost(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              {/* Main Post Content */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  <img src={activeThreadPost.authorAvatar || getLetterAvatar(activeThreadPost.authorName)} alt="" className="w-7 h-7 rounded-full object-cover" />
                  <span className="text-xs font-bold text-slate-800">{activeThreadPost.authorName}</span>
                </div>
                {activeThreadPost.title && <h4 className="text-xs font-bold text-slate-900">{activeThreadPost.title}</h4>}
                <p className="text-xs text-slate-700 leading-relaxed font-medium">{activeThreadPost.content}</p>
              </div>

              {/* Comments Scroll Area */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-slate-100">
                {(activeThreadPost.comments || []).length === 0 ? (
                  <p className="text-xs text-center text-slate-400 py-6">No comments yet. Start the discussion below!</p>
                ) : (
                  (activeThreadPost.comments || []).map((cmt) => (
                    <div key={cmt.id} className="pt-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={cmt.authorAvatar || getLetterAvatar(cmt.authorName)} alt="" className="w-5 h-5 rounded-full object-cover" />
                          <span className="font-bold text-slate-800">{cmt.authorName}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">{formatRelativeTime(cmt.timestamp)}</span>
                      </div>
                      <p className="text-slate-700 pl-7">{cmt.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Write Comment Form */}
              <form onSubmit={handleCommentSubmit} className="flex items-center gap-2 pt-2 border-t border-slate-100 shrink-0">
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 py-2 px-3.5 rounded-2xl bg-slate-100 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                  className="p-2 rounded-2xl text-white shadow-md disabled:opacity-40 cursor-pointer hover:scale-105 transition-all"
                >
                  <Send size={15} />
                </button>
              </form>
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
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2 pointer-events-none"
          >
            <Check size={14} className="text-emerald-400" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
