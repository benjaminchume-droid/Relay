/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Explore — a Twitter (X) × Meta Threads × TikTok mix:
 *  · For You — Threads-style conversation cards (compact, ~12 items, no clutter)
 *  · Stories — ring + immersive full-bleed viewer (TikTok energy)
 *  · People  — X-style follow rows
 * Communities live in their own tab now; the plus button hides the bottom nav.
 */
import React, { useEffect, useState } from "react";
import {
  Search, Heart, MessageCircle, Send, X, Plus, UserPlus, Check, Eye, Loader2,
} from "lucide-react";
import { GlassButton } from "./GlassUI";
import { useContactsStore } from "../store/contactsStore";
import { useChatStore } from "../store/chatStore";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { formatHandle, formatRelativeTime } from "../lib/utils";
import { getLetterAvatar } from "../lib/avatar";
import {
  fetchPublicFeed,
  createPublicPost,
  togglePostLike,
  fetchActiveStories,
  createStory,
  recordStoryView,
  type FeedPost,
  type StoryItem,
} from "../services/phase1Service";

const STORY_GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
];

type ExploreTab = "foryou" | "stories" | "people";

export const ExploreView: React.FC<{
  onSelectChat: (chatId: string) => void;
  onOpenUserSearch?: () => void;
}> = ({ onSelectChat, onOpenUserSearch }) => {
  const [tab, setTab] = useState<ExploreTab>("foryou");
  const [query, setQuery] = useState("");
  const [friendStatuses, setFriendStatuses] = useState<Record<string, "initial" | "pending">>({});
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [composer, setComposer] = useState("");
  const [storyComposer, setStoryComposer] = useState("");
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [posting, setPosting] = useState(false);
  const [storyPosting, setStoryPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const { searchResults, searchUsers } = useContactsStore();
  const { createDirectChat } = useChatStore();
  const { currentUser } = useAuthStore();
  const { enterImmersive, exitImmersive } = useUiStore();

  const loadExplore = async () => {
    setLoadingFeed(true);
    setError(null);
    try {
      const [f, s] = await Promise.all([fetchPublicFeed(24), fetchActiveStories()]);
      setFeed(f);
      setStories(s);
    } catch (e: any) {
      setError(e?.message || "Failed to load explore");
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    loadExplore();
  }, []);

  useEffect(() => {
    if (query.trim().length >= 2) searchUsers(query.trim());
  }, [query]);

  const handlePost = async () => {
    if (!composer.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const post = await createPublicPost(composer.trim());
      setFeed((prev) => [
        {
          ...post,
          authorName: currentUser?.name || currentUser?.username || "You",
          authorAvatar: currentUser?.avatarUrl,
        },
        ...prev,
      ]);
      setComposer("");
    } catch (e: any) {
      setError(e?.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await togglePostLike(postId);
      setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p)));
    } catch { /* optimistic state kept */ }
  };

  const handleStartChat = async (userId: string) => {
    const chatId = await createDirectChat(userId);
    if (chatId) onSelectChat(chatId);
  };

  const handleAddFriend = async (userId: string) => {
    // follow = open a direct chat (X-style: the fastest path from profile to DM)
    setFriendStatuses((s) => ({ ...s, [userId]: "pending" }));
    await handleStartChat(userId);
  };

  const handleCreateStory = async () => {
    if (!storyComposer.trim() || storyPosting) return;
    setStoryPosting(true);
    try {
      const story = await createStory(storyComposer.trim());
      setStories((prev) => [story, ...prev]);
      setStoryComposer("");
      setShowStoryComposer(false);
    } catch (e: any) {
      setError(e?.message || "Failed to add story");
    } finally {
      setStoryPosting(false);
    }
  };

  const openStory = (story: StoryItem) => {
    setActiveStory(story);
    enterImmersive();
    void recordStoryView(story.id).catch(() => {});
  };

  const closeStory = () => {
    setActiveStory(null);
    exitImmersive();
  };

  const openStoryComposer = () => {
    setShowStoryComposer(true);
    enterImmersive();
  };
  const closeStoryComposer = () => {
    setShowStoryComposer(false);
    exitImmersive();
  };

  const visibleFeed = feed.slice(0, visibleCount);
  const peopleResults = query.trim().length >= 2 ? searchResults.slice(0, 12) : [];

  return (
    <div className="w-full max-w-2xl mx-auto min-h-screen pb-32 text-left">
      {/* header */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3 bg-gradient-to-b from-slate-50 via-slate-50/95 to-transparent dark:from-black dark:via-black/95 backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">Explore</h1>
          <button
            type="button"
            onClick={openStoryComposer}
            style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}
            className="p-2.5 rounded-full text-white shadow-md active:scale-95 transition-transform"
            aria-label="Add story"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400"><Search size={15} /></div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white/80 dark:bg-white/10 text-slate-800 dark:text-white placeholder-slate-400 text-xs font-medium border border-slate-200/80 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--primary-accent,#2563EB)]/40"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>
          )}
        </div>
        {/* segmented tabs */}
        <div className="flex items-center gap-1 mt-3 p-1 rounded-full bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 w-fit">
          {([
            ["foryou", "For you"],
            ["stories", "Stories"],
            ["people", "People"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${tab === id ? "text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"}`}
              style={tab === id ? { backgroundColor: "var(--primary-accent, #2563EB)" } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        {error && <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[11px] text-red-600 dark:text-red-300 font-medium">{error}</div>}

        {/* ---------------- FOR YOU (Threads-style cards) ---------------- */}
        {tab === "foryou" && (
          <div className="space-y-3">
            {/* quick composer */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-3xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <img src={currentUser?.avatarUrl || getLetterAvatar(currentUser?.name || "You")} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={composer.trim() ? 3 : 1}
                placeholder="Start a thread…"
                className="flex-1 bg-transparent text-[13px] text-slate-800 dark:text-white placeholder-slate-400 resize-none focus:outline-none pt-1.5"
              />
              {composer.trim() && (
                <button type="button" onClick={handlePost} disabled={posting} style={{ backgroundColor: "var(--primary-accent, #2563EB)" }} className="px-4 py-1.5 rounded-full text-[11px] font-bold text-white disabled:opacity-50 shrink-0">
                  {posting ? "Posting…" : "Post"}
                </button>
              )}
            </div>

            {loadingFeed ? (
              <div className="flex items-center justify-center py-14 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
            ) : (
              <>
                {visibleFeed.map((post) => (
                  <article key={post.id} className="px-3.5 py-3.5 rounded-3xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <img src={post.authorAvatar || getLetterAvatar(post.authorName || "U")} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{post.authorName || "User"}</span>
                          <span className="text-[11px] text-slate-400 truncate">{formatRelativeTime(post.createdAt)}</span>
                        </div>
                        <p className="text-[13.5px] text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</p>
                        <div className="flex items-center gap-6 mt-2.5 -ml-1.5">
                          <button type="button" onClick={() => handleLike(post.id)} className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors ${post.likedByMe ? "text-rose-500" : "text-slate-400 hover:text-rose-500"}`}>
                            <Heart size={15} className={post.likedByMe ? "fill-current" : ""} /> {post.likeCount || 0}
                          </button>
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400"><MessageCircle size={15} /> Reply</span>
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400"><Eye size={15} /> {post.viewCount ?? ""}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {feed.length > visibleCount && (
                  <button type="button" onClick={() => setVisibleCount((c) => c + 12)} className="w-full py-2.5 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                    Show more
                  </button>
                )}
                {feed.length === 0 && (
                  <div className="py-14 text-center text-xs text-slate-400">Nothing here yet — post the first thread.</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------------- STORIES ---------------- */}
        {tab === "stories" && (
          <div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              <button type="button" onClick={openStoryComposer} className="shrink-0 w-16 flex flex-col items-center gap-1.5">
                <span className="w-14 h-14 rounded-full border-2 border-dashed border-[var(--primary-accent,#2563EB)]/50 flex items-center justify-center text-[var(--primary-accent,#2563EB)] bg-white/60 dark:bg-white/5"><Plus size={20} /></span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Your story</span>
              </button>
              {stories.map((s, i) => (
                <button key={s.id} type="button" onClick={() => openStory(s)} className="shrink-0 w-16 flex flex-col items-center gap-1.5">
                  <span className="w-14 h-14 rounded-full p-[2px]" style={{ background: STORY_GRADIENTS[i % STORY_GRADIENTS.length] }}>
                    <span className="block w-full h-full rounded-full border-2 border-white dark:border-black overflow-hidden">
                      <img src={s.authorAvatar || getLetterAvatar(s.authorName || "U")} alt="" className="w-full h-full rounded-full object-cover" />
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate w-16 text-center">{s.authorName || "User"}</span>
                </button>
              ))}
              {stories.length === 0 && <p className="text-xs text-slate-400 self-center px-2">No active stories — be the first</p>}
            </div>
          </div>
        )}

        {/* ---------------- PEOPLE (X-style rows) ---------------- */}
        {tab === "people" && (
          <div className="space-y-2">
            {peopleResults.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <img src={u.avatarUrl || getLetterAvatar(u.name || u.username || "U")} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{u.name || u.username}</p>
                  <p className="text-[11px] text-slate-400 truncate">{formatHandle(u)}</p>
                </div>
                {friendStatuses[u.id] === "pending" ? (
                  <button type="button" onClick={() => handleStartChat(u.id)} className="px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-200 flex items-center gap-1">
                    <Send size={12} /> Message
                  </button>
                ) : (
                  <button type="button" onClick={() => handleAddFriend(u.id)} className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white flex items-center gap-1" style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}>
                    <UserPlus size={12} /> Follow
                  </button>
                )}
              </div>
            ))}
            {peopleResults.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">{query.trim().length >= 2 ? "No people found" : "Type at least 2 characters to find people"}</p>
            )}
          </div>
        )}
      </div>

      {/* ---------------- immersive story viewer (TikTok energy) ---------------- */}
      {activeStory && (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-xl flex flex-col" onClick={closeStory}>
          <div className="flex justify-center py-3">
            <span className="w-10 h-1 rounded-full bg-white/40" />
          </div>
          <div className="flex-1 flex items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={{ background: STORY_GRADIENTS[feed.length % STORY_GRADIENTS.length] }}>
              <div className="flex items-center gap-2.5 p-4 bg-black/20">
                <img src={activeStory.authorAvatar || getLetterAvatar(activeStory.authorName || "U")} alt="" className="w-8 h-8 rounded-full object-cover" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{activeStory.authorName || "User"}</p>
                  <p className="text-[10px] text-white/70">{formatRelativeTime(activeStory.createdAt)}</p>
                </div>
              </div>
              <p className="px-5 pb-8 pt-2 text-[15px] text-white leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] min-h-[180px] flex items-center">{activeStory.content}</p>
            </div>
          </div>
          <button type="button" onClick={closeStory} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"><X size={18} /></button>
        </div>
      )}

      {/* ---------------- story composer sheet ---------------- */}
      {showStoryComposer && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closeStoryComposer}>
          <div className="w-full sm:max-w-sm m-3 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add to your story</h3>
              <button type="button" onClick={closeStoryComposer} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><X size={16} /></button>
            </div>
            <textarea
              value={storyComposer}
              onChange={(e) => setStoryComposer(e.target.value)}
              rows={3}
              placeholder="What's on your mind?"
              autoFocus
              className="w-full p-3 rounded-2xl bg-slate-100 dark:bg-white/10 text-[13px] text-slate-800 dark:text-white placeholder-slate-400 resize-none focus:outline-none"
            />
            <GlassButton
              type="button"
              onClick={handleCreateStory}
              disabled={storyPosting || !storyComposer.trim()}
              className="w-full mt-3 py-3 text-xs font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}
            >
              {storyPosting ? "Posting…" : "Share story"}
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
};
