/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Pin, MessageSquare, Users, UserPlus, Check, CheckCheck, Camera, MoreVertical, MessageSquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlassInput, GlassButton } from './GlassUI';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useContactsStore } from '../store/contactsStore';
import { Chat } from '../types';
import { formatChatTimestamp, formatHandle, formatRelativeTime } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

export const ChatList: React.FC<{
  onSelectChat: (chatId: string) => void;
  onOpenNewChatModal: () => void;
}> = ({ onSelectChat, onOpenNewChatModal }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<'all' | 'unread' | 'group' | 'favorites'>('all');
  const [isFabVisible, setIsFabVisible] = useState(true);

  const { chats, fetchChats, setActiveChat, createDirectChat } = useChatStore();
  const { searchResults, searchUsers } = useContactsStore();

  useEffect(() => {
    fetchChats();
  }, []);

  // Hide FAB on scroll down, show on scroll up
  useEffect(() => {
    let lastScrollY = 0;
    const scrollContainer = document.querySelector('main') || window;
    
    const handleScroll = () => {
      const currentScrollY = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : window.scrollY;
      if (currentScrollY > lastScrollY + 8 && currentScrollY > 40) {
        setIsFabVisible(false);
      } else if (currentScrollY < lastScrollY - 8) {
        setIsFabVisible(true);
      }
      lastScrollY = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredChats = chats.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.lastMessage?.text || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (subTab === 'unread') return matchesSearch && (c.unreadCount || 0) > 0;
    if (subTab === 'group') return matchesSearch && c.type === 'group';
    if (subTab === 'favorites') return matchesSearch && c.isPinned;
    return matchesSearch;
  });

  const pinnedChats = filteredChats.filter((c) => c.isPinned);
  const regularChats = filteredChats.filter((c) => !c.isPinned);

  const handleStartChatWithUser = async (targetUserId: string) => {
    const chatId = await createDirectChat(targetUserId);
    if (chatId) {
      onSelectChat(chatId);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-5 pb-28 relative min-h-screen text-left">
      
      {/* Top Header with App Branding, Camera Icon, and Action Menu */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Chats</h1>
        </div>
        <div className="flex items-center gap-3 text-slate-700">
          <button 
            type="button"
            onClick={onOpenNewChatModal}
            className="p-2 rounded-full hover:bg-slate-200/60 transition-all cursor-pointer"
            title="Camera"
          >
            <Camera size={20} className="text-slate-700" />
          </button>
          <button 
            type="button"
            onClick={onOpenNewChatModal}
            className="p-2 rounded-full hover:bg-slate-200/60 transition-all cursor-pointer"
            title="Menu"
          >
            <MoreVertical size={20} className="text-slate-700" />
          </button>
        </div>
      </div>

      {/* Rounded, light-gray search bar with "Ask Meta AI or Search" placeholder */}
      <div className="space-y-3">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/80 text-slate-800 placeholder-slate-400 text-xs font-medium border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'unread', 'group', 'favorites'] as const).map((tab) => {
            const totalUnreadCount = chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
            return (
              <button
                key={tab}
                onClick={() => setSubTab(tab as any)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  subTab === tab 
                    ? 'bg-blue-600 text-white shadow-xs font-bold' 
                    : 'bg-white/80 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <span>{tab === 'all' ? 'All' : tab === 'unread' ? 'Unread' : tab === 'group' ? 'Groups' : 'Favorites'}</span>
                {tab === 'unread' && totalUnreadCount > 0 && (
                  <span className={`px-1.5 py-0.2 text-[9px] font-mono rounded-full ${subTab === tab ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
                    {totalUnreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global User Search Results when searching */}
      {searchQuery.trim() !== '' && searchResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 text-left">
            <span>Global Users matching "{searchQuery}"</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {searchResults.map((user) => (
              <GlassCard 
                key={user.id} 
                onClick={() => handleStartChatWithUser(user.id)}
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/80 transition-all"
              >
                <div className="flex items-center gap-3">
                  <img src={user.avatarUrl || getLetterAvatar(user.name || user.username)} alt={user.name} className="w-10 h-10 rounded-xl object-cover border border-white shadow-xs" />
                  <div className="text-left">
                    <h4 className="text-xs font-bold text-slate-800">{user.name}</h4>
                    <span className="text-[10px] text-slate-500 font-mono">{formatHandle(user.username)}</span>
                  </div>
                </div>
                <GlassButton variant="secondary" className="py-1 px-3 text-[11px]">Message</GlassButton>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Chat List rendering */}
      <div className="space-y-4">
        
        {/* Pinned section */}
        {pinnedChats.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 text-left">
              <Pin size={12} className="rotate-45" />
              <span>Pinned Conversations</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {pinnedChats.map((chat) => (
                <ChatItem 
                  key={chat.id} 
                  chat={chat} 
                  onSelect={() => {
                    setActiveChat(chat.id);
                    onSelectChat(chat.id);
                  }} 
                />
              ))}
            </div>
          </div>
        )}

        {/* Regular chats */}
        <div className="space-y-2">
          {pinnedChats.length > 0 && (
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-2 text-left">
              <span>All Conversations</span>
            </div>
          )}

          {regularChats.length === 0 && pinnedChats.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <MessageSquare size={36} className="mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No conversations yet</p>
              <p className="text-xs text-slate-400">Tap the bubble below to start a new chat.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {regularChats.map((chat) => (
                <ChatItem 
                  key={chat.id} 
                  chat={chat} 
                  onSelect={() => {
                    setActiveChat(chat.id);
                    onSelectChat(chat.id);
                  }} 
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Requirement 5: Floating Action Bubble (FAB) for New Chat that hides on scroll */}
      <AnimatePresence>
        {isFabVisible && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onOpenNewChatModal}
            style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
            className="fixed bottom-20 right-5 md:bottom-8 md:right-8 z-30 w-14 h-14 rounded-full text-white shadow-xl shadow-blue-600/35 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform border border-white/40 backdrop-blur-xl"
            title="Start New Chat"
          >
            <Plus size={26} />
          </motion.button>
        )}
      </AnimatePresence>

    </div>
  );
};

const ChatItem: React.FC<{
  chat: Chat;
  onSelect: () => void;
}> = ({ chat, onSelect }) => {
  const { currentUser } = useAuthStore();
  const hasLastMessage = !!(chat.lastMessage && chat.lastMessage.text);
  const deliveryState = chat.lastMessage?.deliveryState || 'read';
  const isOutgoing = chat.lastMessage?.senderId === currentUser?.id;

  return (
    <GlassCard 
      onClick={onSelect}
      className="p-3 flex items-center justify-between gap-3 border-white/80 hover:bg-white/90 transition-all group cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="relative shrink-0">
          <img 
            src={chat.avatarUrl || getLetterAvatar(chat.name)} 
            alt={chat.name} 
            className="w-12 h-12 rounded-full object-cover border border-white shadow-2xs"
          />
          {/* Active status indicator / ring */}
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-2xs" />
          {chat.type === 'group' && (
            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1 rounded-full border border-white shadow-2xs">
              <Users size={10} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className="text-xs font-bold text-slate-900 truncate tracking-tight">{chat.name}</h3>
            {hasLastMessage && (
              <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                {formatChatTimestamp(chat.lastMessage?.timestamp)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate">
            {hasLastMessage && isOutgoing && (
              deliveryState === 'read' ? (
                <CheckCheck size={14} className="shrink-0 text-blue-600" />
              ) : deliveryState === 'delivered' ? (
                <CheckCheck size={14} className="text-slate-400 shrink-0" />
              ) : (
                <Check size={14} className="text-slate-400 shrink-0" />
              )
            )}
            <span className="truncate text-slate-600 font-normal">{hasLastMessage ? chat.lastMessage!.text : 'No messages yet'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {chat.unreadCount && chat.unreadCount > 0 ? (
          <span 
            className="bg-emerald-500 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shadow-xs"
          >
            {chat.unreadCount}
          </span>
        ) : null}

        {chat.isPinned && (
          <Pin size={14} className="text-blue-600 fill-blue-600 rotate-45" />
        )}
      </div>
    </GlassCard>
  );
};
