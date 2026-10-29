/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Explore — a Twitter (X) × Meta Threads × TikTok mix:
 *  · For You — Threads-style conversation cards (compact, ~12 items, no clutter)
 *  · Stories — WhatsApp-style "Add status" composer (Text / Photo / Video /
 *    Voice) + immersive full-bleed viewer (TikTok energy): progress bars,
 *    tap navigation, hold-to-pause, swipe-down close, views + delete.
 *    The viewer is a fullscreen overlay — bottom nav is gone while it's open.
 *  · People  — X-style follow rows
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Search, Heart, MessageCircle, Send, X, Plus, UserPlus, Eye, Loader2,
  Text as TextIcon, Image as ImageIcon, Video as VideoIcon, Mic, Pause,
  Play, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { GlassButton } from "./GlassUI";
import { useContactsStore } from "../store/contactsStore";
import { useChatStore } from "../store/chatStore";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { formatHandle, formatRelativeTime } from "../lib/utils";
import { getLetterAvatar } from "../lib/avatar";
import { supabase } from "../lib/supabase/client";
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
  "linear-gradient(135deg,#0f172a,#334155)",
];

type ExploreTab = "foryou" | "stories" | "people";
type StoryMode = "text" | "image" | "video" | "voice";

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
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [posting, setPosting] = useState(false);
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
    setFriendStatuses((s) => ({ ...s, [userId]: "pending" }));
    await handleStartChat(userId);
  };

  // ---- story lifecycle ----
  const openStoryComposer = () => {
    setShowStoryComposer(true);
    enterImmersive();
  };
  const closeStoryComposer = () => {
    setShowStoryComposer(false);
    exitImmersive();
  };
  const handleStoryCreated = (story: StoryItem) => {
    setStories((prev) => [story, ...prev]);
    closeStoryComposer();
  };
  const openViewer = (i: number) => {
    setViewerIndex(i);
    enterImmersive();
  };
  const closeViewer = () => {
    setViewerIndex(null);
    exitImmersive();
  };
  const handleStoryDeleted = (storyId: string) => {
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    closeViewer();
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
            aria-label="Add status"
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
                <button key={s.id} type="button" onClick={() => openViewer(i)} className="shrink-0 w-16 flex flex-col items-center gap-1.5">
                  <span className="w-14 h-14 rounded-full p-[2px]" style={{ background: "linear-gradient(135deg,#7C3AED,#EC4899,#F59E0B)" }}>
                    <span className="block w-full h-full rounded-full border-2 border-white dark:border-black overflow-hidden">
                      <img src={s.authorAvatar || getLetterAvatar(s.authorName || "U")} alt="" className="w-full h-full rounded-full object-cover" />
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate w-16 text-center">{s.authorName || "User"}</span>
                </button>
              ))}
              {stories.length === 0 && <p className="text-xs text-slate-400 self-center px-2">No active stories — be the first</p>}
            </div>

            {/* story cards (TikTok energy) */}
            <div className="mt-4 space-y-2">
              {stories.slice(0, 12).map((s) => (
                <button
                  key={`card-${s.id}`}
                  type="button"
                  onClick={() => openViewer(stories.findIndex((x) => x.id === s.id))}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-left hover:border-slate-300 dark:hover:border-white/20 transition-colors"
                >
                  <StoryThumb story={s} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-slate-900 dark:text-white truncate">{s.authorName || "User"}</p>
                    <p className="text-[10.5px] text-slate-400">
                      {s.type === "voice" ? "Voice status" : s.type === "text" ? "Text" : s.type === "video" ? "Video" : "Photo"}
                      {" · "}{formatRelativeTime(s.createdAt)} · {s.viewCount || 0} views
                    </p>
                  </div>
                  <Play size={16} className="text-slate-300 dark:text-slate-500" />
                </button>
              ))}
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

      {/* ---------------- immersive story viewer (fullscreen — nav hidden) ---------------- */}
      {viewerIndex !== null && stories[viewerIndex] && (
        <StoryViewer
          stories={stories}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={closeViewer}
          onDeleted={handleStoryDeleted}
        />
      )}

      {/* ---------------- WhatsApp-style story composer ---------------- */}
      {showStoryComposer && (
        <StoryComposer onClose={closeStoryComposer} onCreated={handleStoryCreated} onError={(m) => setError(m)} />
      )}
    </div>
  );
};

// ================= story thumbnail =================

function StoryThumb({ story }: { story: StoryItem }) {
  if (story.type === "image" || story.type === "video") {
    return (
      <span className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-white/10 flex items-center justify-center">
        {story.type === "image" && story.mediaUrl ? (
          <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <VideoIcon size={18} className="text-slate-400" />
        )}
      </span>
    );
  }
  if (story.type === "voice") {
    return (
      <span className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: "var(--primary-accent, #2563EB)" }}>
        <Mic size={18} className="text-white" />
      </span>
    );
  }
  return (
    <span className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: story.backgroundColor || STORY_GRADIENTS[0] }}>
      <TextIcon size={18} className="text-white" />
    </span>
  );
}

// ================= story viewer =================

const STORY_SECONDS: Record<string, number> = { text: 6, image: 6, video: 20, voice: 15 };

function StoryViewer({
  stories, index, onIndex, onClose, onDeleted,
}: {
  stories: StoryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { currentUser } = useAuthStore();
  const story = stories[index];
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const duration = (STORY_SECONDS[story.type] || 6) * 1000;

  useEffect(() => {
    setProgress(0);
    recordStoryView(story.id).catch(() => {});
  }, [story.id]);

  useEffect(() => {
    if (paused) return;
    const start = Date.now() - progress * duration;
    const t = setInterval(() => {
      const p = (Date.now() - start) / duration;
      if (p >= 1) {
        clearInterval(t);
        if (index < stories.length - 1) onIndex(index + 1);
        else onClose();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(t);
  }, [index, paused, story.id]);

  const next = () => {
    if (index < stories.length - 1) onIndex(index + 1);
    else onClose();
  };
  const prev = () => (index > 0 ? onIndex(index - 1) : setProgress(0));

  const isMine = story.profileId === currentUser?.id;

  const deleteMine = async () => {
    try {
      await supabase.from("stories").delete().eq("id", story.id);
      onDeleted(story.id);
    } catch { /* keep open */ }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black select-none"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchStartY.current == null) return;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (dy > 90) { onClose(); return; }
        if (touchStartX.current != null) {
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (dx < -60) next();
          else if (dx > 60) prev();
        }
        touchStartX.current = null;
        touchStartY.current = null;
      }}
    >
      {/* progress bars */}
      <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
        {stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[2.5px] rounded-full bg-white/25 overflow-hidden">
            <div
              className="h-full bg-white"
              style={{ width: i < index ? "100%" : i === index ? `${Math.min(100, progress * 100)}%` : "0%", transition: i === index ? "width 60ms linear" : "none" }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute top-7 left-4 right-4 z-20 flex items-center gap-2.5">
        <img src={story.authorAvatar || getLetterAvatar(story.authorName || "U")} alt="" className="w-8 h-8 rounded-full object-cover border border-white/40" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{story.authorName || "User"}</p>
          <p className="text-[10px] text-white/60">{formatRelativeTime(story.createdAt)}</p>
        </div>
        {isMine && (
          <span className="px-2.5 py-1 rounded-full bg-white/15 text-white text-[10px] font-bold">{story.viewCount || 0} views</span>
        )}
        {isMine && (
          <button type="button" onClick={deleteMine} className="p-2 rounded-full hover:bg-white/10 text-white/80" aria-label="Delete story">
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {/* tap zones + content */}
      <div className="absolute inset-0 flex" onClick={() => { /* body click = pause toggle on desktop */ }}>
        <button type="button" aria-label="Previous" className="w-1/4 h-full flex items-center justify-start pl-2 text-white/40 hover:text-white z-10" onClick={(e) => { e.stopPropagation(); prev(); }}>
          <ChevronLeft size={26} />
        </button>
        <div
          className="flex-1 h-full flex items-center justify-center"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          <StoryBody story={story} />
        </div>
        <button type="button" aria-label="Next" className="w-1/4 h-full flex items-center justify-end pr-2 text-white/40 hover:text-white z-10" onClick={(e) => { e.stopPropagation(); next(); }}>
          <ChevronRight size={26} />
        </button>
      </div>
    </div>
  );
}

function StoryBody({ story }: { story: StoryItem }) {
  if (story.type === "text") {
    return (
      <div className="w-full max-w-sm aspect-[9/16] max-h-[76vh] rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center" style={{ background: story.backgroundColor || STORY_GRADIENTS[0] }}>
        <p className="px-6 text-[17px] leading-relaxed text-white font-bold text-center whitespace-pre-wrap [overflow-wrap:anywhere]">{story.caption}</p>
      </div>
    );
  }
  if (story.type === "voice") {
    const secs = Math.round((story as any).durationMs ? (story as any).durationMs / 1000 : 0);
    return (
      <div className="w-full max-w-sm aspect-[9/16] max-h-[76vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-center gap-5" style={{ background: story.backgroundColor || STORY_GRADIENTS[5] }}>
        <Mic size={56} className="text-white/90" />
        {story.mediaUrl && <audio src={story.mediaUrl} controls autoPlay className="w-4/5" />}
        <p className="text-white/70 text-xs font-bold">{secs > 0 ? `${secs}s voice status` : "Voice status"}</p>
      </div>
    );
  }
  // image / video
  if (story.type === "video" && story.mediaUrl) {
    return (
      <video src={story.mediaUrl} autoPlay playsInline controls className="max-w-full max-h-[86vh] object-contain" />
    );
  }
  return story.mediaUrl ? (
    <img src={story.mediaUrl} alt="" className="max-w-full max-h-[86vh] object-contain" />
  ) : (
    <div className="text-white/50 text-xs">Media unavailable</div>
  );
}

// ================= WhatsApp-style composer =================

function StoryComposer({
  onClose, onCreated, onError,
}: {
  onClose: () => void;
  onCreated: (s: StoryItem) => void;
  onError: (m: string) => void;
}) {
  const [mode, setMode] = useState<StoryMode>("text");
  const [text, setText] = useState("");
  const [gradient, setGradient] = useState(0);
  const [media, setMedia] = useState<{ file: File; kind: "image" | "video"; url: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceSecs, setVoiceSecs] = useState(0);
  const [posting, setPosting] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { currentUser } = useAuthStore();

  const canPost =
    (mode === "text" && text.trim()) ||
    (mode === "image" && media) ||
    (mode === "video" && media) ||
    (mode === "voice" && voiceBlob);

  const pick = (kind: "image" | "video") => {
    setMode(kind);
    // trigger the shared hidden input with the right accept filter
    requestAnimationFrame(() => {
      const el = fileInput.current;
      if (!el) return;
      el.accept = kind === "image" ? "image/*" : "video/*";
      el.click();
    });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind: "image" | "video" = f.type.startsWith("video") ? "video" : "image";
    setMedia({ file: f, kind, url: URL.createObjectURL(f) });
    setMode(kind);
    e.target.value = "";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunks.current = [];
      mr.ondataavailable = (ev) => recChunks.current.push(ev.data);
      mr.onstop = () => {
        const blob = new Blob(recChunks.current, { type: mr.mimeType || "audio/webm" });
        setVoiceBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorder.current = mr;
      setVoiceSecs(0);
      recTimer.current = setInterval(() => setVoiceSecs((s) => s + 1), 1000);
      setRecording(true);
    } catch {
      onError("Microphone permission required");
    }
  };
  const stopRec = (discard = false) => {
    recTimer.current && clearInterval(recTimer.current);
    recTimer.current = null;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") mediaRecorder.current.stop();
    setRecording(false);
    if (discard) setVoiceBlob(null);
  };

  const post = async () => {
    if (!canPost || posting) return;
    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id || "anon";
      let mediaUrl: string | undefined;
      let durationMs: number | undefined;

      if (media) {
        const ext = media.kind === "video" ? "mp4" : "jpg";
        const mime = media.kind === "video" ? "video/mp4" : "image/jpeg";
        const path = `${uid}/story_${Date.now()}.${ext}`;
        const up = await supabase.storage.from("story-media").upload(path, media.file, { contentType: mime, upsert: false });
        if (up.error) throw up.error;
        const signed = await supabase.storage.from("story-media").createSignedUrl(path, 60 * 60 * 24);
        mediaUrl = signed.data?.signedUrl;
      } else if (mode === "voice" && voiceBlob) {
        const path = `${uid}/story_${Date.now()}.webm`;
        const up = await supabase.storage.from("story-media").upload(path, voiceBlob, { contentType: voiceBlob.type || "audio/webm", upsert: false });
        if (up.error) throw up.error;
        const signed = await supabase.storage.from("story-media").createSignedUrl(path, 60 * 60 * 24);
        mediaUrl = signed.data?.signedUrl;
        durationMs = voiceSecs * 1000;
      }

      const story = await createStory({
        type: mode === "voice" ? "voice" : mode === "text" ? "text" : mode,
        caption: mode === "text" || mode === "voice" ? (text.trim() || undefined) : (text.trim() || undefined),
        mediaUrl,
        backgroundColor: mode === "text" || mode === "voice" ? STORY_GRADIENTS[gradient] : undefined,
        durationHours: 24,
        durationMs,
      } as any);
      onCreated(story);
    } catch (e: any) {
      onError(e?.message || "Failed to add status");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-white font-black text-base">Add status</h3>
        <div className="flex items-center gap-2">
          {canPost && (
            <button
              type="button"
              onClick={post}
              disabled={posting}
              style={{ backgroundColor: "var(--primary-accent, #2563EB)" }}
              className="px-4 py-1.5 rounded-full text-[12px] font-bold text-white disabled:opacity-50"
            >
              {posting ? "Sharing…" : "Share"}
            </button>
          )}
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="flex-1 relative overflow-hidden">
        <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
        {mode === "text" && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: STORY_GRADIENTS[gradient] }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="Type a status…"
              className="bg-transparent text-center text-white text-xl font-bold placeholder-white/50 resize-none w-full h-2/3 px-8 focus:outline-none"
            />
          </div>
        )}
        {mode === "voice" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5" style={{ background: STORY_GRADIENTS[gradient] }}>
            <Mic size={64} className={recording ? "text-red-400 animate-pulse" : "text-white/90"} />
            <p className="text-white font-bold text-lg font-mono">
              {String(Math.floor(voiceSecs / 60)).padStart(2, "0")}:{String(voiceSecs % 60).padStart(2, "0")}
            </p>
            {!recording && !voiceBlob && (
              <button type="button" onClick={startRec} className="px-6 py-2.5 rounded-full bg-white/15 border border-white/25 text-white text-sm font-bold hover:bg-white/25">
                Tap to record
              </button>
            )}
            {recording && (
              <button type="button" onClick={() => stopRec(false)} className="px-6 py-2.5 rounded-full bg-red-500 text-white text-sm font-bold">
                Stop
              </button>
            )}
            {!recording && voiceBlob && (
              <div className="flex items-center gap-3">
                <audio src={URL.createObjectURL(voiceBlob)} controls className="max-w-[240px]" />
                <button type="button" onClick={() => setVoiceBlob(null)} className="p-2 rounded-full bg-white/10 text-white" aria-label="Discard recording">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        )}
        {media && (
          <div className="absolute inset-0 flex items-center justify-center">
            {media.kind === "image" ? (
              <img src={media.url} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <video src={media.url} autoPlay muted playsInline loop className="max-w-full max-h-full object-contain" />
            )}
          </div>
        )}
        {/* caption strip for media modes */}
        {media && (
          <div className="absolute bottom-4 left-4 right-4">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a caption…"
              className="w-full px-4 py-2.5 rounded-full bg-black/45 backdrop-blur text-white text-[13px] placeholder-white/50 border border-white/15 focus:outline-none"
            />
          </div>
        )}
        {/* gradient picker for text/voice */}
        {(mode === "text" || mode === "voice") && (
          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2.5">
            {STORY_GRADIENTS.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradient(i)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${gradient === i ? "border-white scale-110" : "border-white/30"}`}
                style={{ background: g }}
                aria-label={`Background ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* mode chips (WhatsApp Add status row) */}
      <div className="flex items-center justify-around px-3 py-3 bg-black border-t border-white/10">
        {([
          ["text", "Text", TextIcon],
          ["image", "Photo", ImageIcon],
          ["video", "Video", VideoIcon],
          ["voice", "Voice", Mic],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => (id === "image" || id === "video" ? pick(id) : setMode(id))}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11.5px] font-bold transition-all ${
              mode === id ? "text-white border" : "text-white/60 hover:text-white"
            }`}
            style={mode === id ? { borderColor: "var(--primary-accent, #2563EB)", backgroundColor: "color-mix(in srgb, var(--primary-accent, #2563EB) 25%, transparent)" } : {}}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
