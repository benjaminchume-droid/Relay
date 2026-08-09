/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, UserPlus, Check, Clock, MessageSquare, Users } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { useContactsStore } from '../store/contactsStore';
import { useChatStore } from '../store/chatStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

export const UserSearchScreen: React.FC<{
  onBack: () => void;
  onSelectChat: (chatId: string) => void;
}> = ({ onBack, onSelectChat }) => {
  const [query, setQuery] = useState('');
  const [friendStatuses, setFriendStatuses] = useState<Record<string, 'initial' | 'pending' | 'accepted'>>({});
  const [isStartingChat, setIsStartingChat] = useState<string | null>(null);
  const [chatStartError, setChatStartError] = useState<string | null>(null);

  const { searchResults, searchStatus, searchError, lastSearchQuery, searchUsers, resetSearch } = useContactsStore();
  const { createDirectChat } = useChatStore();

  useEffect(() => {
    resetSearch();
  }, []);

  const handleExecuteSearch = () => {
    if (!query.trim()) return;
    setChatStartError(null);
    searchUsers(query);
  };

  const handleAddFriend = (userId: string) => {
    setFriendStatuses((prev) => ({
      ...prev,
      [userId]: 'pending'
    }));
  };

  const handleStartMessage = async (userId: string) => {
    if (isStartingChat) return;
    setIsStartingChat(userId);
    setChatStartError(null);
    try {
      const chatId = await createDirectChat(userId);
      if (chatId) {
        onSelectChat(chatId);
      }
    } catch (err: any) {
      console.error("[UserSearchScreen] Error creating chat:", err);
      setChatStartError(err.message || 'Failed to start conversation. Please try again.');
    } finally {
      setIsStartingChat(null);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6 space-y-6 text-left pb-28">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onBack}
          className="p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 border border-slate-200/80 shadow-xs cursor-pointer transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Find & Connect Users</h1>
          <p className="text-xs text-slate-500 font-medium">Search handles, usernames, or bios</p>
        </div>
      </div>

      {/* Dedicated Search Input & Button */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <GlassInput 
            placeholder="Type a handle (e.g. @gen) or display name..."
            icon={<Search size={16} />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          disabled={searchStatus === 'loading' || !query.trim()}
          className="px-5 py-2.5 text-xs shrink-0 cursor-pointer"
        >
          {searchStatus === 'loading' ? 'Searching...' : 'Search'}
        </GlassButton>
      </div>

      {chatStartError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {chatStartError}
        </div>
      )}

      {/* Rich Search Results */}
      <div className="space-y-3 pt-2">
        {searchStatus === 'idle' && (
          <GlassCard className="p-8 text-center text-slate-400 space-y-2">
            <Users size={32} className="mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">Find someone on Relay</p>
            <p className="text-[11px] text-slate-400">Search by name or username.</p>
          </GlassCard>
        )}

        {searchStatus === 'loading' && (
          <GlassCard className="p-8 text-center text-slate-400 space-y-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-600">Searching...</p>
          </GlassCard>
        )}

        {searchStatus === 'error' && (
          <GlassCard className="p-8 text-center text-slate-400 space-y-2">
            <p className="text-xs font-semibold text-rose-600">
              {searchError || "We couldn't complete the search. Try again."}
            </p>
          </GlassCard>
        )}

        {searchStatus === 'empty' && (
          <GlassCard className="p-8 text-center text-slate-400 space-y-2">
            <p className="text-xs font-semibold text-slate-600">
              No members found matching "{lastSearchQuery}"
            </p>
            <p className="text-[11px] text-slate-400">Double check spelling or try searching a handle prefix.</p>
          </GlassCard>
        )}

        {searchStatus === 'success' && (
          <div className="grid grid-cols-1 gap-3">
            {searchResults.map((user) => {
              const status = friendStatuses[user.id] || 'initial';
              return (
                <GlassCard key={user.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/90 transition-all">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img 
                      src={user.avatarUrl || getLetterAvatar(user.name || user.username)} 
                      alt={user.name || user.username} 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getLetterAvatar(user.name || user.username);
                      }}
                      className="w-12 h-12 rounded-2xl object-cover border border-white shadow-xs shrink-0" 
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-800 truncate">{user.name || user.username}</h3>
                        <span className="text-[10px] text-slate-500 font-mono font-semibold">{formatHandle(user.username)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-medium">{user.bio || 'Relay community member'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Add Friend Button with Dynamic States */}
                    {status === 'initial' && (
                      <GlassButton 
                        onClick={() => handleAddFriend(user.id)} 
                        variant="secondary" 
                        className="py-1.5 px-3 text-xs"
                      >
                        <UserPlus size={14} />
                        <span>Add Friend</span>
                      </GlassButton>
                    )}

                    {status === 'pending' && (
                      <button 
                        disabled 
                        className="py-1.5 px-3 text-xs font-semibold bg-slate-100 text-slate-400 rounded-xl border border-slate-200/60 flex items-center gap-1.5 cursor-not-allowed opacity-80"
                      >
                        <Clock size={13} className="animate-spin" />
                        <span>Pending</span>
                      </button>
                    )}

                    {status === 'accepted' && (
                      <button 
                        disabled 
                        className="py-1.5 px-3 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 flex items-center gap-1.5 cursor-default"
                      >
                        <Check size={13} />
                        <span>Connected</span>
                      </button>
                    )}

                    {/* Direct Message Button */}
                    <GlassButton 
                      onClick={() => handleStartMessage(user.id)} 
                      variant="primary" 
                      className="py-1.5 px-3.5 text-xs"
                    >
                      <MessageSquare size={14} />
                      <span>{isStartingChat === user.id ? 'Connecting...' : 'Message'}</span>
                    </GlassButton>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
