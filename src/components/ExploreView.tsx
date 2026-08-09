/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Compass, Users, UserPlus, Check } from 'lucide-react';
import { GlassCard, GlassInput, GlassButton } from './GlassUI';
import { StatusScreen } from './StatusScreen';
import { useContactsStore } from '../store/contactsStore';
import { useCommunityStore } from '../store/communityStore';
import { useChatStore } from '../store/chatStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';

export const ExploreView: React.FC<{
  onSelectChat: (chatId: string) => void;
  onOpenUserSearch?: () => void;
}> = ({ onSelectChat, onOpenUserSearch }) => {
  const [query, setQuery] = useState('');
  const [friendStatuses, setFriendStatuses] = useState<Record<string, 'initial' | 'pending'>>({});

  const { searchResults, searchUsers } = useContactsStore();
  const { communities, fetchCommunities, joinCommunity } = useCommunityStore();
  const { createDirectChat } = useChatStore();

  useEffect(() => {
    fetchCommunities();
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    searchUsers(e.target.value);
  };

  const handleStartChat = async (userId: string) => {
    const chatId = await createDirectChat(userId);
    if (chatId) {
      onSelectChat(chatId);
    }
  };

  const handleAddFriend = (userId: string) => {
    setFriendStatuses((prev) => ({ ...prev, [userId]: 'pending' }));
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-3.5 md:p-5 space-y-4 pb-24 text-left">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Explore & Stories</h1>
          <p className="text-[11px] text-slate-500 font-medium">Stories, updates, people, and public communities</p>
        </div>

        {onOpenUserSearch && (
          <GlassButton onClick={onOpenUserSearch} variant="secondary" className="py-2 px-3 text-xs">
            <Search size={15} />
            <span>Advanced Search</span>
          </GlassButton>
        )}
      </div>

      {/* 1. Global Search Input at the top */}
      <GlassInput 
        placeholder="Search handles, names, or topics..."
        icon={<Search size={16} />}
        value={query}
        onChange={handleQueryChange}
      />

      {/* 2. Embedded Status Section (My Status + Others' Statuses) */}
      <StatusScreen embedded={true} />

      {/* 3. Discovered Users Search Results */}
      {query.trim() !== '' && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Users size={16} className="text-blue-500" />
            <span>Search Results for "{query}"</span>
          </div>

          {searchResults.length === 0 ? (
            <GlassCard className="p-6 text-center text-xs text-slate-500">
              No registered user handles matched "{query}"
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map((user) => {
                const isPending = friendStatuses[user.id] === 'pending';
                return (
                  <GlassCard key={user.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={user.avatarUrl || getLetterAvatar(user.name || user.username)} alt={user.name} className="w-11 h-11 rounded-2xl object-cover border border-white shadow-xs shrink-0" />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{user.name}</h4>
                        <span className="text-[10px] font-mono text-slate-500 block mb-0.5">{formatHandle(user.username)}</span>
                        <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{user.bio || 'Relay member'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleAddFriend(user.id)}
                        disabled={isPending}
                        className={`p-1.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isPending ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                        title="Add Friend"
                      >
                        {isPending ? <Check size={14} className="text-emerald-600" /> : <UserPlus size={14} />}
                      </button>

                      <GlassButton 
                        onClick={() => handleStartChat(user.id)}
                        variant="primary" 
                        className="py-1.5 px-3 text-xs"
                      >
                        Message
                      </GlassButton>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Featured Public Communities */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Compass size={16} className="text-purple-500" />
          <span>Featured Public Communities</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {communities.map((comm) => (
            <GlassCard key={comm.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img src={comm.avatarUrl || getLetterAvatar(comm.name)} alt={comm.name} className="w-10 h-10 rounded-2xl object-cover border border-white shadow-xs" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-800">{comm.name}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">{formatHandle(comm.handle)} • {comm.memberCount} members</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 font-medium leading-normal line-clamp-2">
                {comm.description || 'Public Relay community hub.'}
              </p>

              <GlassButton 
                onClick={() => joinCommunity(comm.id)}
                variant={comm.isJoined ? 'secondary' : 'primary'}
                className="w-full py-2 text-xs"
              >
                {comm.isJoined ? 'Joined' : 'Join Community'}
              </GlassButton>
            </GlassCard>
          ))}
        </div>
      </div>

    </div>
  );
};

