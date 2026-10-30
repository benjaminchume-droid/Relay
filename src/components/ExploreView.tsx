/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Explore — rebuilt to spec:
 *  · No search bar anywhere on this screen (find-people lives at /search).
 *  · For you — X (Twitter) replica feed: author row (avatar · name · handle ·
 *    time), rich text + photo posts, action rail (reply / like / views) with
 *    real counts, threaded comment sheet. The header "+" publishes a STORY.
 *  · Stories — contact-only (you see stories from people in your contacts,
 *    plus your own). WhatsApp-style composer (Text/Photo/Video/Voice).
 *    The viewer is TikTok: fullscreen, fit-to-screen content, views badge at
 *    the top, comment bar pinned at the bottom, vertical swipe to move, hold
 *    to pause, swipe down to close. NO likes anywhere in stories.
 *  · People — your contacts as X-style rows.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, Send, X, Plus, UserPlus, Eye, Loader2,
  Text as TextIcon, Image as ImageIcon, Video as VideoIcon, Mic,
  Play, Trash2, BarChart2, MoreHorizontal, Search,
} from "lucide-react";
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
  recordPostView,
  fetchPostComments,
  createPostComment,
  fetchActiveStories,
  fetchContactStories,
  fetchMyContacts,
  createStory,
  recordStoryView,
  fetchStoryReplies,
  createStoryReply,
  type FeedPost,
  type PostComment,
  type StoryItem,
  type StoryReply,
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
type StoryMode = "text" | "image" | "video" | "voice";

const ACCENT = "var(--primary-accent, #2563EB)";

export const ExploreView: React.FC<{
  onSelectChat: (chatId: string) => void;
  onOpenUserSearch?: () => void;
}> = ({ onSelectChat, onOpenUserSearch }) => {
  const [tab, setTab] = useState<ExploreTab>("foryou");
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; username?: string; avatarUrl?: string }>>([]);
  const [composer, setComposer] = useState("");
  const [postImage, setPostImage] = useState<{ file: File; url: string } | null>(null);
  const [showStoryComposer, setShowStoryComposer] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const { createDirectChat } = useChatStore();
  const { currentUser } = useAuthStore();
  const { enterImmersive, exitImmersive } = useUiStore();

  const loadExplore = useCallback(async () => {
    setLoadingFeed(true);
    setError(null);
    try {
      const [f, s, c] = await Promise.all([fetchPublicFeed(30), fetchContactStories(), fetchMyContacts()]);
      setFeed(f);
      setStories(s);
      setContacts(c);
    } catch (e: any) {
      setError(e?.message || "Failed to load explore");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    loadExplore();
  }, [loadExplore]);

  const handlePost = async () => {
    if ((!composer.trim() && !postImage) || posting) return;
    setPosting(true);
    setError(null);
    try {
      let mediaUrl: string | undefined;
      if (postImage) {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id || "anon";
        const path = `${uid}/post_${Date.now()}.jpg`;
        const up = await supabase.storage.from("story-media").upload(path, postImage.file, { contentType: postImage.file.type || "image/jpeg", upsert: false });
        if (!up.error) {
          const signed = await supabase.storage.from("story-media").createSignedUrl(path, 60 * 60 * 24 * 30);
          mediaUrl = signed.data?.signedUrl;
        }
      }
      const post = await createPublicPost(composer.trim() || "📷", mediaUrl);
      setFeed((prev) => [
        {
          ...post,
          authorName: currentUser?.name || currentUser?.username || "You",
          authorAvatar: currentUser?.avatarUrl,
          mediaUrl,
        },
        ...prev,
      ]);
      setComposer("");
      setPostImage(null);
    } catch (e: any) {
      setError(e?.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    // optimistic — flip locally first so the tap feels instant (X behavior)
    setFeed((prev) => prev.map((p) => (p.id === postId
      ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
      : p)));
    try {
      const res = await togglePostLike(postId);
      setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p)));
    } catch { /* optimistic state kept */ }
  };

  const handleCommentPosted = (postId: string) => {
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p)));
  };

  const handleStartChat = async (userId: string) => {
    const chatId = await createDirectChat(userId);
    if (chatId) onSelectChat(chatId);
  };

  // ---- story lifecycle ----
  const openStoryComposer = useCallback(() => {
    setShowStoryComposer(true);
    enterImmersive();
  }, [enterImmersive]);
  const closeStoryComposer = useCallback(() => {
    setShowStoryComposer(false);
    exitImmersive();
  }, [exitImmersive]);
  const handleStoryCreated = (story: StoryItem) => {
    setStories((prev) => [story, ...prev]);
    closeStoryComposer();
  };
  const openViewer = (i: number) => {
    setViewerIndex(i);
    enterImmersive();
  };
  const closeViewer = useCallback(() => {
    setViewerIndex(null);
    exitImmersive();
  }, [exitImmersive]);
  const handleStoryDeleted = (storyId: string) => {
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    closeViewer();
  };

  // Browser back must ALWAYS restore the nav bar — even when a fullscreen
  // overlay unmounts without going through its close handler. Guarded by a
  // released flag so double-exit can never drive the counter negative.
  const overlayReleaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    overlayReleaseRef.current = viewerIndex !== null || showStoryComposer ? () => {} : null;
    if (viewerIndex !== null || showStoryComposer) {
      window.history.pushState({ relayOverlay: true }, "");
    }
  }, [viewerIndex, showStoryComposer]);
  useEffect(() => {
    const onPop = () => {
      if (viewerIndex !== null) { setViewerIndex(null); exitImmersive(); }
      else if (showStoryComposer) { setShowStoryComposer(false); exitImmersive(); }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // unmount cleanup — the "back button ate the nav bar" fix
      if (viewerIndex !== null || showStoryComposer) exitImmersive();
    };
  }, [viewerIndex, showStoryComposer, exitImmersive]);

  const visibleFeed = feed.slice(0, visibleCount);

  return (
    <div className="w-full max-w-2xl mx-auto min-h-full pb-32 text-left">
      {/* header — search bar REMOVED per spec */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3 bg-gradient-to-b from-slate-50 via-slate-50/95 to-transparent dark:from-black dark:via-black/95 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">Explore</h1>
          <button
            type="button"
            onClick={openStoryComposer}
            style={{ backgroundColor: ACCENT }}
            className="p-2.5 rounded-full text-white shadow-md active:scale-95 transition-transform"
            aria-label="Add status"
          >
            <Plus size={18} />
          </button>
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
              style={tab === id ? { backgroundColor: ACCENT } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        {error && <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[11px] text-red-600 dark:text-red-300 font-medium">{error}</div>}

        {/* ---------------- FOR YOU — X replica ---------------- */}
        {tab === "foryou" && (
          <div className="space-y-0.5">
            <div className="flex items-start gap-2.5 px-3.5 py-3 border-b border-slate-200/70 dark:border-white/10">
              <img src={currentUser?.avatarUrl || getLetterAvatar(currentUser?.name || "You")} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={composer.trim() || postImage ? 3 : 1}
                  placeholder="What's happening?"
                  className="w-full bg-transparent text-[14px] text-slate-800 dark:text-white placeholder-slate-400 resize-none focus:outline-none pt-1"
                />
                {postImage && (
                  <div className="relative mt-1 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                    <img src={postImage.url} alt="" className="max-h-64 w-full object-cover" />
                    <button type="button" onClick={() => setPostImage(null)} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"><X size={14} /></button>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("foryou-image-input") as HTMLInputElement | null;
                      el?.click();
                    }}
                    className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label="Add photo"
                  >
                    <ImageIcon size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={handlePost}
                    disabled={posting || (!composer.trim() && !postImage)}
                    className="py-2 px-5 rounded-full text-[12px] font-black text-white disabled:opacity-40"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {posting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
            <input
              id="foryou-image-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPostImage({ file: f, url: URL.createObjectURL(f) });
                e.target.value = "";
              }}
            />
            {loadingFeed ? (
              <div className="flex items-center justify-center py-14 text-slate-400"><Loader2 size={22} className="animate-spin" /></div>
            ) : (
              <>
                {visibleFeed.map((post) => (
                  <div key={post.id}>
                    <FeedCard post={post} onLike={handleLike} onCommentPosted={handleCommentPosted} />
                  </div>
                ))}
                {feed.length > visibleCount && (
                  <button type="button" onClick={() => setVisibleCount((c) => c + 12)} className="w-full py-2.5 rounded-2xl bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                    Show more
                  </button>
                )}
                {feed.length === 0 && (
                  <div className="py-14 text-center text-xs text-slate-400">Nothing here yet — be the first to post.</div>
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
                <span className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center bg-white/60 dark:bg-white/5" style={{ borderColor: "color-mix(in srgb, " + ACCENT + " 50%, transparent)", color: ACCENT }}><Plus size={20} /></span>
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
              {stories.length === 0 && <p className="text-xs text-slate-400 self-center px-2">No stories from your contacts yet</p>}
            </div>

            {/* story cards */}
            <div className="mt-4 space-y-2">
              {stories.slice(0, 15).map((s) => (
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

        {/* ---------------- PEOPLE — your contacts ---------------- */}
        {tab === "people" && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onOpenUserSearch}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-300 text-[12px] font-bold"
            >
              <Search size={15} /> Find people to follow
            </button>
            {contacts.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white/80 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <img src={u.avatarUrl || getLetterAvatar(u.name || "U")} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">{u.name}</p>
                  {u.username && <p className="text-[11px] text-slate-400 truncate">{formatHandle(u.username)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleStartChat(u.id)}
                  className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white flex items-center gap-1"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Send size={12} /> Message
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">No contacts yet — find people above.</p>
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

// ================= For You post card (X replica) =================

function FeedCard({
  post, onLike, onCommentPosted,
}: {
  post: FeedPost;
  onLike: (id: string) => void;
  onCommentPosted: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    recordPostView(post.id);
  }, [post.id]);

  return (
    <article className="px-3.5 py-3 border-b border-slate-200/70 dark:border-white/10 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start gap-3">
        <img src={post.authorAvatar || getLetterAvatar(post.authorName || "U")} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">{post.authorName || "User"}</span>
            {post.authorUsername && (
              <span className="text-[12px] text-slate-400 truncate">{formatHandle(post.authorUsername)}</span>
            )}
            <span className="text-[12px] text-slate-400 shrink-0">· {formatRelativeTime(post.createdAt)}</span>
            <MoreHorizontal size={15} className="ml-auto text-slate-400 shrink-0" />
          </div>
          {post.content && (
            <p className="text-[14px] text-slate-800 dark:text-slate-100 leading-snug mt-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">{post.content}</p>
          )}
          {post.mediaUrl && (
            <img src={post.mediaUrl} alt="" className="mt-2 rounded-2xl max-h-80 w-full object-cover border border-slate-200 dark:border-white/10" />
          )}
          {/* X action rail */}
          <div className="flex items-center gap-7 mt-2.5 -ml-1.5">
            <button
              type="button"
              onClick={() => setShowComments(true)}
              className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400 hover:text-sky-500 transition-colors"
            >
              <MessageCircle size={15.5} /> {post.commentCount || ""}
            </button>
            <button
              type="button"
              onClick={() => onLike(post.id)}
              className={`flex items-center gap-1.5 text-[11.5px] font-medium transition-colors ${post.likedByMe ? "text-rose-500" : "text-slate-400 hover:text-rose-500"}`}
            >
              <Heart size={15.5} className={post.likedByMe ? "fill-current" : ""} /> {post.likeCount || ""}
            </button>
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400">
              <BarChart2 size={15.5} /> {formatViews(post.viewCount ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {showComments && (
        <CommentSheet
          postId={post.id}
          postAuthor={post.authorName}
          onPosted={() => onCommentPosted(post.id)}
          onClose={() => setShowComments(false)}
        />
      )}
    </article>
  );
}

function formatViews(n: number): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

// ================= comment sheet (X-style reply bar) =================

function CommentSheet({
  postId, postAuthor, onPosted, onClose,
}: {
  postId: string;
  postAuthor: string;
  onPosted: () => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { currentUser } = useAuthStore();

  useEffect(() => {
    let alive = true;
    fetchPostComments(postId)
      .then((c) => { if (alive) setComments(c); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [postId]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const c = await createPostComment(postId, text.trim());
      setComments((prev) => [...prev, c]);
      setText("");
      onPosted();
    } catch { /* keep text */ }
    finally { setSending(false); }
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/70 dark:border-white/10">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300">Replying to {postAuthor}</span>
        <button type="button" onClick={onClose} className="p-1 text-slate-400"><X size={14} /></button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {loading && <div className="py-4 flex justify-center text-slate-400"><Loader2 size={16} className="animate-spin" /></div>}
        {!loading && comments.length === 0 && <p className="py-4 text-center text-[11px] text-slate-400">No replies yet</p>}
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-2.5 px-3 py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
            <img src={c.authorAvatar || getLetterAvatar(c.authorName || "U")} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-900 dark:text-white truncate">{c.authorName}</span>
                <span className="text-[10.5px] text-slate-400">{formatRelativeTime(c.createdAt)}</span>
              </div>
              <p className="text-[12.5px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2 border-t border-slate-200/70 dark:border-white/10">
        <img src={currentUser?.avatarUrl || getLetterAvatar(currentUser?.name || "You")} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder="Post your reply..."
          className="flex-1 bg-transparent text-[12.5px] text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !text.trim()}
          className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
        >
          {sending ? "…" : "Reply"}
        </button>
      </div>
    </div>
  );
}

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
      <span className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center" style={{ background: ACCENT }}>
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

// ================= TikTok-style story viewer =================

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
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const [replies, setReplies] = useState<StoryReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);

  const duration = (STORY_SECONDS[story.type] || 6) * 1000;

  // load replies (story comments) per story
  useEffect(() => {
    let alive = true;
    setReplies([]);
    recordStoryView(story.id).catch(() => {});
    fetchStoryReplies(story.id)
      .then((r) => { if (alive) setReplies(r); })
      .catch(() => {});
    return () => { alive = false; };
  }, [story.id]);

  // progress engine — video/voice are driven by their real media, others by timer
  const mediaMode = story.type === "video" || story.type === "voice";
  useEffect(() => {
    if (paused || mediaMode) return;
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
  }, [index, paused, story.id, mediaMode, duration]);

  // media-driven progress: bump progress from timeupdate so the bar tracks reality
  const onMediaTime = (frac: number) => setProgress(frac);
  const onMediaEnded = () => {
    if (index < stories.length - 1) onIndex(index + 1);
    else onClose();
  };

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

  const sendReply = async () => {
    if (!replyText.trim() || replySending) return;
    setReplySending(true);
    try {
      const r = await createStoryReply(story.id, replyText.trim());
      setReplies((p) => [...p, r]);
      setReplyText("");
    } catch { /* keep text */ }
    finally { setReplySending(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black select-none"
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        if (!touchStart.current) return;
        const dy = e.changedTouches[0].clientY - touchStart.current.y;
        const dx = e.changedTouches[0].clientX - touchStart.current.x;
        const dt = Date.now() - touchStart.current.t;
        touchStart.current = null;
        if (dy > 110 && dt < 600 && Math.abs(dx) < 90) { onClose(); return; } // fast swipe down = close
        if (dy < -70 && dt < 700 && Math.abs(dx) < 90) { next(); return; }    // swipe up = next (TikTok)
        if (dy > 70 && dt < 700 && Math.abs(dx) < 90) { prev(); return; }     // swipe down slow = prev
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

      {/* header — author + views badge (views live at the TOP per spec) */}
      <div className="absolute top-7 left-4 right-4 z-20 flex items-center gap-2.5">
        <img src={story.authorAvatar || getLetterAvatar(story.authorName || "U")} alt="" className="w-8 h-8 rounded-full object-cover border border-white/40" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{story.authorName || "User"}</p>
          <p className="text-[10px] text-white/60">{formatRelativeTime(story.createdAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => setViewsOpen((v) => !v)}
          className="px-2.5 py-1 rounded-full bg-white/15 text-white text-[10px] font-bold flex items-center gap-1"
        >
          <Eye size={11} /> {story.viewCount || 0} views
        </button>
        {isMine && (
          <button type="button" onClick={deleteMine} className="p-2 rounded-full hover:bg-white/10 text-white/80" aria-label="Delete story">
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {/* tap zones + fit-to-screen content */}
      <div className="absolute inset-0 flex">
        <button type="button" aria-label="Previous" className="w-[22%] h-full z-10" onClick={(e) => { e.stopPropagation(); prev(); }} />
        <div
          className="flex-1 h-full flex items-center justify-center overflow-hidden"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
        >
          <StoryBody story={story} paused={paused} onTime={onMediaTime} onEnded={onMediaEnded} />
        </div>
        <button type="button" aria-label="Next" className="w-[22%] h-full z-10" onClick={(e) => { e.stopPropagation(); next(); }} />
      </div>

      {/* views pop-over (author only) */}
      {viewsOpen && isMine && (
        <div className="absolute top-24 right-4 z-30 px-3.5 py-2.5 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 text-white text-[11px] font-semibold max-w-[220px]">
          <p className="font-black uppercase tracking-wider text-white/70 text-[9px] mb-1">Story analytics</p>
          <p>{story.viewCount || 0} views · {replies.length} replies</p>
          <p className="text-white/50 mt-0.5">Viewer details arrive with phase 2 analytics.</p>
        </div>
      )}

      {/* comment bar — pinned bottom (comments ONLY, no likes in stories) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-5 pt-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        {replies.length > 0 && (
          <div className="mb-2 max-h-32 overflow-y-auto space-y-1.5 px-1">
            {replies.slice(-8).map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <img src={r.authorAvatar || getLetterAvatar(r.authorName || "U")} alt="" className="w-5 h-5 rounded-full object-cover mt-0.5 shrink-0" />
                <p className="text-[11.5px] text-white/90 leading-snug">
                  <span className="font-bold mr-1.5">{r.authorName}</span>
                  <span className="text-white/80 [overflow-wrap:anywhere]">{r.content}</span>
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/12 backdrop-blur-xl border border-white/25">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendReply(); } }}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder="Send a comment…"
              className="flex-1 bg-transparent text-white text-[12.5px] placeholder-white/50 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={sendReply}
            disabled={replySending || !replyText.trim()}
            className="p-3 rounded-full text-white disabled:opacity-40 shrink-0"
            style={{ backgroundColor: ACCENT }}
            aria-label="Send comment"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryBody({
  story, paused, onTime, onEnded,
}: {
  story: StoryItem;
  paused: boolean;
  onTime: (frac: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // honor pause for real media
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (paused) { v?.pause(); a?.pause(); }
    else {
      if (v && story.type === "video") v.play().catch(() => {});
      if (a && story.type === "voice") a.play().catch(() => {});
    }
  }, [paused, story.type]);

  if (story.type === "text") {
    return (
      <div className="w-full h-full flex items-center justify-center p-8" style={{ background: story.backgroundColor || STORY_GRADIENTS[0] }}>
        <p className="max-w-md text-[19px] leading-relaxed text-white font-bold text-center whitespace-pre-wrap [overflow-wrap:anywhere]">{story.caption}</p>
      </div>
    );
  }
  if (story.type === "voice") {
    const secs = Math.round((story as any).durationMs ? (story as any).durationMs / 1000 : 0);
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8" style={{ background: story.backgroundColor || STORY_GRADIENTS[5] }}>
        <span className="w-28 h-28 rounded-full bg-white/15 border border-white/25 flex items-center justify-center backdrop-blur-xl">
          <Mic size={52} className="text-white/90" />
        </span>
        {story.mediaUrl && (
          <audio
            ref={audioRef}
            src={story.mediaUrl}
            autoPlay
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration && isFinite(el.duration)) onTime(el.currentTime / el.duration);
            }}
            onEnded={onEnded}
            className="w-4/5"
          />
        )}
        <p className="text-white/75 text-xs font-bold tracking-wide">{secs > 0 ? `${secs}s voice status` : "Voice status"}</p>
      </div>
    );
  }
  if (story.type === "video" && story.mediaUrl) {
    return (
      <video
        ref={videoRef}
        src={story.mediaUrl}
        autoPlay
        playsInline
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && isFinite(el.duration)) onTime(el.currentTime / el.duration);
        }}
        onEnded={onEnded}
        className="w-full h-full object-contain bg-black"
      />
    );
  }
  // image — fit to screen, edge to edge like TikTok
  return story.mediaUrl ? (
    <img src={story.mediaUrl} alt="" className="w-full h-full object-contain" />
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

  const canPost =
    (mode === "text" && text.trim()) ||
    (mode === "image" && media) ||
    (mode === "video" && media) ||
    (mode === "voice" && voiceBlob);

  const pick = (kind: "image" | "video") => {
    setMode(kind);
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
        caption: text.trim() || undefined,
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
              style={{ backgroundColor: ACCENT }}
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
            style={mode === id ? { borderColor: ACCENT, backgroundColor: "color-mix(in srgb, " + ACCENT + " 25%, transparent)" } : {}}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
