/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Phase 1 Explore: public feed, stories ring, communities strip, people search.
 */

import React, { useEffect, useState } from 'react';
import {
  Search, Compass, Users, UserPlus, Check, Heart, MessageCircle,
  Plus, Send, X, Eye
} from 'lucide-react';
import { GlassCard, GlassInput, GlassButton } from './GlassUI';
import { useContactsStore } from '../store/contactsStore';
import { useCommunityStore } from '../store/communityStore';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import {
  fetchPublicFeed,
  createPublicPost,
  togglePostLike,
  fetchActiveStories,
  createStory,
  recordStoryView,
  type FeedPost,
  type StoryItem,
} from '../services/phase1Service';

const STORY_GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
];

export const ExploreView: React.FC<{
  onSelectChat: (chatId: string) => void;
  onOpenUserSearch?: () => void;
}> = ({ onSelectChat, onOpenUserSearch }) => {
  const [query, setQuery] = useState('');
  const [friendStatuses, setFriendStatuses] = useState<Record<string, 'initial' | 'pending'>>({});
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [composer, setComposer] = useState('');
  const [storyComposer, setStoryComposer] = useState('');
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [posting, setPosting] = useState(false);
  const [storyPosting, setStoryPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { searchResults, searchUsers } = useContactsStore();
  const { communities, fetchCommunities, joinCommunity } = useCommunityStore();
  const { createDirectChat } = useChatStore();
  const { currentUser } = useAuthStore();

  const loadExplore = async () => {
    setLoadingFeed(true);
    setError(null);
    try {
      const [f, s] = await Promise.all([fetchPublicFeed(40), fetchActiveStories()]);
      setFeed(f);
      setStories(s);
    } catch (e: any) {
      setError(e?.message || 'Failed to load explore');
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchCommunities();
    loadExplore();
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    searchUsers(e.target.value);
  };

  const handleStartChat = async (userId: string) => {
    const chatId = await createDirectChat(userId);
    if (chatId) onSelectChat(chatId);
  };

  const handlePost = async () => {
    if (!composer.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const post = await createPublicPost(composer.trim());
      setFeed((prev) => [
        {
          ...post,
          authorName: currentUser?.name || currentUser?.username || 'You',
          authorAvatar: currentUser?.avatarUrl,
        },
        ...prev,
      ]);
      setComposer('');
    } catch (e: any) {
      setError(e?.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await togglePostLike(postId);
      setFeed((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p
        )
      );
    } catch {
      /* optimistic ignore */
    }
  };

  const handleCreateStory = async () => {
    if (!storyComposer.trim() || storyPosting) return;
    setStoryPosting(true);
    setError(null);
    try {
      const gradient = STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)];
      const story = await createStory({
        type: 'text',
        caption: storyComposer.trim(),
        backgroundColor: gradient,
        privacy: 'everyone',
        durationHours: 24,
      });
      setStories((prev) => [
        {
          ...story,
          authorName: currentUser?.name || 'You',
          authorAvatar: currentUser?.avatarUrl,
        },
        ...prev,
      ]);
      setStoryComposer('');
      setShowStoryComposer(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to post story');
    } finally {
      setStoryPosting(false);
    }
  };

  const openStory = async (story: StoryItem) => {
    setActiveStory(story);
    try {
      await recordStoryView(story.id);
    } catch {
      /* non-blocking */
    }
  };

  const storyRings = React.useMemo(() => {
    const map = new Map<string, StoryItem[]>();
    for (const s of stories) {
      const list = map.get(s.profileId) || [];
      list.push(s);
      map.set(s.profileId, list);
    }
    return Array.from(map.entries()).map(([profileId, items]) => ({
      profileId,
      authorName: items[0].authorName,
      authorAvatar: items[0].authorAvatar,
      items,
    }));
  }, [stories]);

  return (
    <div className="w-full max-w-4xl mx-auto p-3.5 md:p-5 space-y-4 pb-24 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Explore</h1>
          <p className="text-[11px] text-slate-500 font-medium">Stories · Public feed · Communities · People</p>
        </div>
        {onOpenUserSearch && (
          <GlassButton onClick={onOpenUserSearch} variant="secondary" className="py-2 px-3 text-xs">
            <Search size={15} />
            <span>Search</span>
          </GlassButton>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-1"><X size={14} /></button>
        </div>
      )}

      <GlassInput
        placeholder="Search handles, names, or topics..."
        icon={<Search size={16} />}
        value={query}
        onChange={handleQueryChange}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Stories</span>
          <button
            type="button"
            onClick={() => setShowStoryComposer(true)}
            className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1"
          >
            <Plus size={14} /> Add yours
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => setShowStoryComposer(true)}
            className="flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-emerald-400 flex items-center justify-center bg-emerald-50">
              <Plus size={20} className="text-emerald-600" />
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Your story</span>
          </button>
          {storyRings.map((ring) => (
            <button
              key={ring.profileId}
              type="button"
              onClick={() => openStory(ring.items[0])}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-emerald-400 via-teal-400 to-cyan-400">
                <img
                  src={ring.authorAvatar || getLetterAvatar(ring.authorName, 56)}
                  alt=""
                  className="w-full h-full rounded-full object-cover border-2 border-white"
                />
              </div>
              <span className="text-[10px] text-slate-600 font-medium max-w-[56px] truncate">
                {ring.authorName}
              </span>
            </button>
          ))}
          {storyRings.length === 0 && !loadingFeed && (
            <p className="text-[11px] text-slate-400 self-center px-2">No active stories — be the first</p>
          )}
        </div>
      </div>

      {showStoryComposer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <GlassCard className="w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">New story</h3>
              <button type="button" onClick={() => setShowStoryComposer(false)} className="p-1 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={storyComposer}
              onChange={(e) => setStoryComposer(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40 resize-none"
            />
            <GlassButton
              onClick={handleCreateStory}
              variant="primary"
              className="w-full py-2.5 text-sm"
              disabled={storyPosting || !storyComposer.trim()}
            >
              {storyPosting ? 'Posting…' : 'Share story'}
            </GlassButton>
          </GlassCard>
        </div>
      )}

      {activeStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setActiveStory(null)}
        >
          <div
            className="w-full max-w-sm aspect-[9/16] rounded-3xl overflow-hidden relative shadow-2xl"
            style={{
              background: activeStory.backgroundColor || STORY_GRADIENTS[0],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/30 text-white"
              onClick={() => setActiveStory(null)}
            >
              <X size={18} />
            </button>
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <img
                src={activeStory.authorAvatar || getLetterAvatar(activeStory.authorName, 32)}
                alt=""
                className="w-8 h-8 rounded-full border border-white/50"
              />
              <span className="text-white text-xs font-semibold drop-shadow">{activeStory.authorName}</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="text-white text-xl font-bold text-center leading-snug drop-shadow-lg">
                {activeStory.caption || '…'}
              </p>
            </div>
            {activeStory.mediaUrl && (
              <img src={activeStory.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute bottom-4 left-4 flex items-center gap-1 text-white/80 text-[11px]">
              <Eye size={12} /> {activeStory.viewCount}
            </div>
          </div>
        </div>
      )}

      <GlassCard className="p-3 space-y-2">
        <div className="flex gap-2">
          <img
            src={currentUser?.avatarUrl || getLetterAvatar(currentUser?.name || 'You', 36)}
            alt=""
            className="w-9 h-9 rounded-xl object-cover shrink-0"
          />
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Share something with everyone…"
            rows={2}
            className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400/40 resize-none"
          />
        </div>
        <div className="flex justify-end">
          <GlassButton
            onClick={handlePost}
            variant="primary"
            className="py-2 px-4 text-xs"
            disabled={posting || !composer.trim()}
          >
            <Send size={14} />
            {posting ? 'Posting…' : 'Post'}
          </GlassButton>
        </div>
      </GlassCard>

      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Compass size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Public feed</span>
        </div>
        {loadingFeed && (
          <p className="text-[11px] text-slate-400 px-1">Loading feed…</p>
        )}
        {!loadingFeed && feed.length === 0 && (
          <GlassCard className="p-4 text-center text-[12px] text-slate-500">
            No public posts yet. Be the first to share something.
          </GlassCard>
        )}
        {feed.map((post) => (
          <GlassCard key={post.id} className="p-3.5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src={post.authorAvatar || getLetterAvatar(post.authorName, 36)}
                alt=""
                className="w-9 h-9 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">{post.authorName}</div>
                {post.authorUsername && (
                  <div className="text-[10px] text-slate-400 font-mono">{formatHandle(post.authorUsername)}</div>
                )}
              </div>
              <span className="text-[10px] text-slate-400">
                {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{post.content}</p>
            {post.mediaUrl && (
              <img src={post.mediaUrl} alt="" className="rounded-xl max-h-64 w-full object-cover" />
            )}
            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => handleLike(post.id)}
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  post.likedByMe ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500'
                }`}
              >
                <Heart size={15} fill={post.likedByMe ? 'currentColor' : 'none'} />
                {post.likeCount || ''}
              </button>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <MessageCircle size={15} />
                {post.commentCount || 0}
              </span>
            </div>
          </GlassCard>
        ))}
      </div>

      {query.trim().length > 1 && (
        <GlassCard className="p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700">People</div>
          {searchResults.length === 0 && (
            <p className="text-[11px] text-slate-400">No matches</p>
          )}
          {searchResults.slice(0, 8).map((u: any) => (
            <div key={u.id} className="flex items-center gap-2.5">
              <img
                src={u.avatarUrl || getLetterAvatar(u.name || u.username, 36)}
                className="w-9 h-9 rounded-xl object-cover"
                alt=""
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{u.name || u.username}</div>
                <div className="text-[10px] text-slate-500 font-mono">{formatHandle(u.username)}</div>
              </div>
              <GlassButton onClick={() => handleStartChat(u.id)} variant="secondary" className="py-1.5 px-2.5 text-[10px]">
                Message
              </GlassButton>
              <button
                type="button"
                onClick={() => setFriendStatuses((p) => ({ ...p, [u.id]: 'pending' }))}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                {friendStatuses[u.id] === 'pending' ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <UserPlus size={14} />
                )}
              </button>
            </div>
          ))}
        </GlassCard>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Users size={14} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Communities</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
          {communities.slice(0, 12).map((c) => (
            <GlassCard key={c.id} className="p-3 min-w-[160px] max-w-[180px] space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <img
                  src={c.avatarUrl || getLetterAvatar(c.name, 32)}
                  alt=""
                  className="w-8 h-8 rounded-xl object-cover"
                />
                <div className="text-xs font-bold text-slate-800 truncate">{c.name}</div>
              </div>
              <div className="text-[10px] text-slate-500 line-clamp-2">{c.description || 'No description'}</div>
              <div className="text-[10px] text-slate-400">{c.memberCount} members</div>
              {!c.isJoined ? (
                <GlassButton
                  onClick={() => joinCommunity(c.id)}
                  variant="primary"
                  className="py-1.5 px-2 text-[10px] w-full"
                >
                  Join
                </GlassButton>
              ) : (
                <span className="text-[10px] font-bold text-emerald-600">Joined</span>
              )}
            </GlassCard>
          ))}
          {communities.length === 0 && (
            <p className="text-[11px] text-slate-400 px-1">
              No communities yet — create one from the Communities tab
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
