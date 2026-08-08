import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Eye, 
  Heart, 
  Send, 
  X, 
  Globe, 
  Users, 
  Lock, 
  Clock, 
  MapPin, 
  BarChart2, 
  Mic, 
  Image as ImageIcon, 
  Type, 
  Music, 
  Sparkles, 
  Check, 
  ChevronRight, 
  Volume2, 
  VolumeX,
  TrendingUp,
  MoreVertical,
  Trash2,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { apiService } from '../services/apiService';
import { formatChatTimestamp } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import { GlassCard } from './GlassUI';

export interface StatusItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'poll';
  content: string;
  mediaUrl?: string;
  backgroundGradient?: string;
  privacy: 'everyone' | 'contacts' | 'selected';
  expiresAt: string;
  createdAt: string;
  viewers: { userId: string; userName: string; userAvatar?: string; viewedAt: string }[];
  likes: string[];
  pollOptions?: { id: string; text: string; votes: string[] }[];
}

const GRADIENTS = [
  'from-blue-600 to-indigo-900',
  'from-purple-600 to-pink-600',
  'from-amber-500 to-rose-600',
  'from-emerald-500 to-teal-800',
  'from-slate-900 to-slate-700',
  'from-cyan-500 to-blue-700'
];

export const StatusScreen: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { currentUser } = useAuthStore();
  const { customization } = useThemeStore();
  const storiesLayout = customization.storiesLayout || 'horizontal';

  const [activeTab, setActiveTab] = useState<'contacts' | 'discovery'>('contacts');
  const [contactsStatuses, setContactsStatuses] = useState<StatusItem[]>([]);
  const [discoveryStatuses, setDiscoveryStatuses] = useState<StatusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Active Viewers
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [activeViewerStatus, setActiveViewerStatus] = useState<StatusItem | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<StatusItem | null>(null);

  // Status Creator Form State
  const [creatorType, setCreatorType] = useState<'text' | 'image' | 'audio' | 'location' | 'poll'>('text');
  const [creatorContent, setCreatorContent] = useState('');
  const [creatorMediaUrl, setCreatorMediaUrl] = useState('');
  const [creatorGradient, setCreatorGradient] = useState(GRADIENTS[0]);
  const [creatorPrivacy, setCreatorPrivacy] = useState<'everyone' | 'contacts' | 'selected'>('everyone');
  const [creatorDuration, setCreatorDuration] = useState<number>(24);
  const [pollQuestions, setPollQuestions] = useState<string[]>(['Option 1', 'Option 2']);
  const [locationName, setLocationName] = useState('');

  // Interactive Viewer State
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [heartParticles, setHeartParticles] = useState<{ id: number; x: number; y: number }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    setIsLoading(true);
    try {
      const res = await apiService.getStatuses();
      setContactsStatuses(res.contacts || []);
      setDiscoveryStatuses(res.discovery || []);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStatus = async () => {
    try {
      let finalContent = creatorContent;
      let finalPollOptions = undefined;

      if (creatorType === 'location') {
        finalContent = locationName || creatorContent;
      } else if (creatorType === 'poll') {
        finalPollOptions = pollQuestions.map((q, idx) => ({
          id: `opt_${idx}`,
          text: q,
          votes: []
        }));
      }

      await apiService.createStatus({
        type: creatorType,
        content: finalContent,
        mediaUrl: creatorMediaUrl,
        backgroundGradient: creatorGradient,
        privacy: creatorPrivacy,
        durationHours: creatorDuration,
        pollOptions: finalPollOptions
      });

      setIsCreatorOpen(false);
      resetCreatorForm();
      loadStatuses();
    } catch (err) {
      console.error('Failed to create post:', err);
    }
  };

  const resetCreatorForm = () => {
    setCreatorType('text');
    setCreatorContent('');
    setCreatorMediaUrl('');
    setCreatorGradient(GRADIENTS[0]);
    setCreatorPrivacy('everyone');
    setCreatorDuration(24);
    setPollQuestions(['Option 1', 'Option 2']);
    setLocationName('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = evt.target?.result as string;
        const res = await apiService.uploadFile(base64, file.name, file.type);
        setCreatorMediaUrl(res.url);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File upload failed:', err);
    }
  };

  const handleOpenViewer = async (status: StatusItem) => {
    setActiveViewerStatus(status);
    setProgress(0);
    try {
      await apiService.recordStatusView(status.id);
    } catch (err) {
      console.error('Record view error:', err);
    }
  };

  const handleLikeStatus = async (status: StatusItem) => {
    try {
      const res = await apiService.likeStatus(status.id);
      if (activeViewerStatus) {
        setActiveViewerStatus({ ...activeViewerStatus, likes: res.likes });
      }
      setHeartParticles((prev) => [
        ...prev,
        { id: Date.now(), x: Math.random() * 200 - 100, y: Math.random() * -100 - 50 }
      ]);
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    try {
      await apiService.deleteStatus(statusId);
      setActiveViewerStatus(null);
      setShowAnalyticsModal(null);
      loadStatuses();
    } catch (err) {
      console.error('Delete post error:', err);
    }
  };

  const currentList = activeTab === 'contacts' ? contactsStatuses : discoveryStatuses;
  const myStatus = contactsStatuses.find((s) => s.userId === currentUser?.id);

  const renderCard = (status: StatusItem, isCompact = false) => (
    <div
      key={status.id}
      onClick={() => handleOpenViewer(status)}
      className={`relative rounded-2xl overflow-hidden cursor-pointer shadow-xs hover:shadow-md hover:scale-[1.01] transition-all bg-gradient-to-br ${status.backgroundGradient || 'from-slate-800 to-slate-900'} p-2.5 flex flex-col justify-between text-white border border-white/20 group ${
        isCompact ? 'w-36 sm:w-40 shrink-0 h-40' : 'h-40'
      }`}
    >
      {status.mediaUrl && (
        <img
          src={status.mediaUrl}
          alt="post bg"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />

      <div className="relative z-10 flex items-center gap-1.5">
        <img
          src={status.userAvatar || getLetterAvatar(status.userName)}
          alt="avatar"
          className="w-6 h-6 rounded-full border border-white/80 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold truncate">{status.userName}</div>
          <div className="text-[8.5px] text-slate-300 font-mono">{formatChatTimestamp(status.createdAt)}</div>
        </div>
      </div>

      <div className="relative z-10 my-auto text-center font-bold text-[10.5px] line-clamp-2 px-1 leading-snug">
        {status.content}
      </div>

      <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-300">
        <span className="capitalize font-mono bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-md">
          {status.type}
        </span>
        <div className="flex items-center gap-1">
          <Eye size={10} />
          <span>{status.viewers.length}</span>
        </div>
      </div>
    </div>
  );

  const statusContent = (
    <div className="space-y-3.5">
      {/* My Post Tray */}
      <GlassCard className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative cursor-pointer" onClick={() => myStatus ? handleOpenViewer(myStatus) : setIsCreatorOpen(true)}>
            <div className={`w-10 h-10 rounded-full p-0.5 ${myStatus ? 'bg-gradient-to-tr from-blue-500 to-indigo-600' : 'bg-slate-200'}`}>
              <img
                src={currentUser?.avatarUrl || getLetterAvatar(currentUser?.name || currentUser?.username || 'Me')}
                alt="My Avatar"
                className="w-full h-full rounded-full object-cover border-2 border-white"
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsCreatorOpen(true); }}
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center border-2 border-white shadow-md hover:scale-110 transition-transform cursor-pointer"
            >
              <Plus size={10} />
            </button>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-800">My Post</div>
            <div className="text-[10px] text-slate-500 font-medium">
              {myStatus ? `${myStatus.viewers.length} views • Tap to view` : 'Tap + to share a new post'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsCreatorOpen(true)}
            style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
            className="px-2.5 py-1.5 rounded-xl hover:brightness-105 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer"
          >
            <Plus size={13} />
            <span>Create Post</span>
          </button>
          {myStatus && (
            <button
              onClick={() => setShowAnalyticsModal(myStatus)}
              className="px-2 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <BarChart2 size={13} />
              <span>Analytics</span>
            </button>
          )}
        </div>
      </GlassCard>

      {/* Recent Updates Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {activeTab === 'contacts' ? 'Contact Updates' : 'Public Posts & Discovery'}
          </h2>
          {/* Dual Tab Switcher */}
          <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/80 dark:border-white/10">
            <button
              onClick={() => setActiveTab('contacts')}
              style={activeTab === 'contacts' ? { backgroundColor: 'var(--primary-accent, #2563EB)', color: '#FFFFFF' } : {}}
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold transition-all cursor-pointer ${
                activeTab === 'contacts'
                  ? 'shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              Contacts
            </button>
            <button
              onClick={() => setActiveTab('discovery')}
              style={activeTab === 'discovery' ? { backgroundColor: 'var(--primary-accent, #2563EB)', color: '#FFFFFF' } : {}}
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'discovery'
                  ? 'shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <Globe size={10} />
              <span>Discovery</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-slate-400 text-xs font-medium">Loading posts...</div>
        ) : currentList.length === 0 ? (
          <div className="text-center py-6 bg-white/60 dark:bg-slate-900/60 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Sparkles size={20} className="mx-auto text-slate-300 mb-1" />
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">No posts found</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Be the first to share a post update!</div>
          </div>
        ) : storiesLayout === 'horizontal' ? (
          <div className="flex flex-row overflow-x-auto gap-2.5 pb-2 scrollbar-none">
            {currentList.map((status) => renderCard(status, true))}
          </div>
        ) : storiesLayout === 'vertical' ? (
          <div className="flex flex-col gap-2.5">
            {currentList.map((status) => (
              <div
                key={status.id}
                onClick={() => handleOpenViewer(status)}
                className={`relative h-28 rounded-2xl overflow-hidden cursor-pointer shadow-xs hover:shadow-md transition-all bg-gradient-to-r ${status.backgroundGradient || 'from-slate-800 to-slate-900'} p-3 flex items-center justify-between text-white border border-white/20 group`}
              >
                {status.mediaUrl && (
                  <img src={status.mediaUrl} alt="post bg" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                )}
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative z-10 flex items-center gap-3">
                  <img src={status.userAvatar || getLetterAvatar(status.userName)} alt="avatar" className="w-9 h-9 rounded-full border border-white/80 object-cover" />
                  <div>
                    <div className="text-xs font-bold">{status.userName}</div>
                    <div className="text-[9.5px] text-slate-300 font-mono">{formatChatTimestamp(status.createdAt)}</div>
                    <div className="text-xs font-semibold mt-1 line-clamp-1">{status.content}</div>
                  </div>
                </div>
                <div className="relative z-10 flex items-center gap-1 text-[10px] bg-black/40 px-2 py-1 rounded-full">
                  <Eye size={12} />
                  <span>{status.viewers.length}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {currentList.map((status) => renderCard(status, false))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="w-full relative space-y-3.5">
          {statusContent}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
          {/* Top Header */}
          <div className="p-3.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between shrink-0 z-10">
            <div>
              <h1 className="text-base font-black text-slate-800 dark:text-white tracking-tight">Relay Posts</h1>
              <p className="text-[10px] text-slate-500 font-medium font-sans">Stories & Public Discovery</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5">
            {statusContent}
          </div>
        </div>
      )}

      {/* STATUS CREATOR MODAL */}
      <AnimatePresence>
        {isCreatorOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-white/20 rounded-3xl p-5 text-white shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              {/* Creator Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-extrabold text-sm flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-400" />
                  Create Relay Status
                </span>
                <button onClick={() => setIsCreatorOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Status Type Selector */}
              <div className="flex bg-white/10 p-1 rounded-2xl justify-between text-xs font-bold">
                {[
                  { id: 'text', label: 'Text', icon: Type },
                  { id: 'image', label: 'Media', icon: ImageIcon },
                  { id: 'location', label: 'Location', icon: MapPin },
                  { id: 'poll', label: 'Poll', icon: BarChart2 }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCreatorType(item.id as any)}
                      className={`flex-1 py-1.5 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        creatorType === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon size={13} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Gradient Selector for Text Status */}
              {creatorType === 'text' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Background Canvas</span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {GRADIENTS.map((grad) => (
                      <button
                        key={grad}
                        onClick={() => setCreatorGradient(grad)}
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} border-2 transition-all cursor-pointer ${
                          creatorGradient === grad ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Main Input Box */}
              {creatorType === 'text' ? (
                <textarea
                  rows={4}
                  placeholder="What's on your mind?..."
                  value={creatorContent}
                  onChange={(e) => setCreatorContent(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              ) : creatorType === 'image' ? (
                <div className="space-y-3">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-white/30 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {creatorMediaUrl ? (
                      <img src={creatorMediaUrl} alt="uploaded" className="h-full w-full object-cover rounded-2xl" />
                    ) : (
                      <>
                        <ImageIcon size={28} className="text-blue-400" />
                        <span className="text-xs font-semibold text-slate-300">Click to upload image or video</span>
                      </>
                    )}
                  </button>
                  <input
                    type="text"
                    placeholder="Add a caption..."
                    value={creatorContent}
                    onChange={(e) => setCreatorContent(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : creatorType === 'location' ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Enter location name (e.g., Tokyo, Japan)..."
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl p-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Poll Question..."
                    value={creatorContent}
                    onChange={(e) => setCreatorContent(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl p-2.5 text-xs text-white font-bold placeholder-slate-400 focus:outline-none"
                  />
                  {pollQuestions.map((q, idx) => (
                    <input
                      key={idx}
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={q}
                      onChange={(e) => {
                        const updated = [...pollQuestions];
                        updated[idx] = e.target.value;
                        setPollQuestions(updated);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white"
                    />
                  ))}
                  <button
                    onClick={() => setPollQuestions([...pollQuestions, `Option ${pollQuestions.length + 1}`])}
                    className="text-[11px] text-blue-400 font-bold hover:underline"
                  >
                    + Add Option
                  </button>
                </div>
              )}

              {/* Privacy & Duration Settings */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">Privacy</span>
                  <select
                    value={creatorPrivacy}
                    onChange={(e) => setCreatorPrivacy(e.target.value as any)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-2 text-xs text-white focus:outline-none"
                  >
                    <option value="everyone" className="bg-slate-900">Everyone (Public)</option>
                    <option value="contacts" className="bg-slate-900">My Contacts Only</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">Expires In</span>
                  <select
                    value={creatorDuration}
                    onChange={(e) => setCreatorDuration(Number(e.target.value))}
                    className="w-full bg-white/10 border border-white/20 rounded-xl p-2 text-xs text-white focus:outline-none"
                  >
                    <option value={24} className="bg-slate-900">24 Hours (Default)</option>
                    <option value={12} className="bg-slate-900">12 Hours</option>
                    <option value={1} className="bg-slate-900">1 Hour</option>
                    <option value={0} className="bg-slate-900">Permanent</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleCreateStatus}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Post Status Update</span>
                <Send size={15} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* INTERACTIVE FULLSCREEN VIEWER */}
      <AnimatePresence>
        {activeViewerStatus && (
          <div className="fixed inset-0 bg-black/95 z-50 flex flex-col justify-between overflow-hidden select-none">
            {/* Top Progress & Header */}
            <div className="p-4 bg-gradient-to-b from-black/80 to-transparent space-y-3 z-20">
              <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden">
                <div className="bg-white h-full transition-all duration-100" style={{ width: '100%' }} />
              </div>

              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <img
                    src={activeViewerStatus.userAvatar || getLetterAvatar(activeViewerStatus.userName)}
                    alt="author"
                    className="w-9 h-9 rounded-full border border-white/80 object-cover"
                  />
                  <div>
                    <div className="text-xs font-extrabold">{activeViewerStatus.userName}</div>
                    <div className="text-[10px] text-slate-300 font-mono">{formatChatTimestamp(activeViewerStatus.createdAt)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeViewerStatus.userId === currentUser?.id && (
                    <button
                      onClick={() => handleDeleteStatus(activeViewerStatus.id)}
                      className="p-2 rounded-full bg-red-600/20 text-red-300 hover:text-white"
                      title="Delete status"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button onClick={() => setActiveViewerStatus(null)} className="p-2 rounded-full bg-white/10 text-white">
                    <X size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Media Stage */}
            <div className="relative flex-1 flex items-center justify-center p-6">
              {activeViewerStatus.mediaUrl ? (
                <img
                  src={activeViewerStatus.mediaUrl}
                  alt="status full"
                  className="max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <div className={`w-full max-w-sm p-8 rounded-3xl bg-gradient-to-br ${activeViewerStatus.backgroundGradient || 'from-blue-600 to-purple-800'} text-white text-center shadow-2xl border border-white/20`}>
                  <p className="text-lg font-black leading-relaxed">{activeViewerStatus.content}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions & Quick Reply */}
            <div className="p-4 bg-gradient-to-t from-black/80 to-transparent space-y-3 z-20">
              <div className="flex items-center justify-between max-w-md mx-auto">
                <button
                  onClick={() => handleLikeStatus(activeViewerStatus)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 rounded-full text-white font-bold text-xs hover:bg-white/20 transition-all cursor-pointer"
                >
                  <Heart size={16} className={activeViewerStatus.likes.includes(currentUser?.id || '') ? 'fill-red-500 text-red-500' : ''} />
                  <span>{activeViewerStatus.likes.length} Likes</span>
                </button>

                {activeViewerStatus.userId === currentUser?.id ? (
                  <button
                    onClick={() => setShowAnalyticsModal(activeViewerStatus)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 rounded-full text-white font-bold text-xs"
                  >
                    <Eye size={16} />
                    <span>{activeViewerStatus.viewers.length} Viewers</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* STATUS ANALYTICS MODAL */}
      <AnimatePresence>
        {showAnalyticsModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-white/20 rounded-3xl p-5 text-white shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-extrabold text-sm flex items-center gap-2">
                  <BarChart2 size={16} className="text-blue-400" />
                  Status Analytics & Reach
                </span>
                <button onClick={() => setShowAnalyticsModal(null)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-white/10 p-3 rounded-2xl">
                  <div className="text-2xl font-black text-blue-400">{showAnalyticsModal.viewers.length}</div>
                  <div className="text-[10px] text-slate-300 uppercase font-bold">Total Views</div>
                </div>
                <div className="bg-white/10 p-3 rounded-2xl">
                  <div className="text-2xl font-black text-rose-400">{showAnalyticsModal.likes.length}</div>
                  <div className="text-[10px] text-slate-300 uppercase font-bold">Total Likes</div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 block">Viewers List</span>
                {showAnalyticsModal.viewers.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4 text-center">No views recorded yet</div>
                ) : (
                  showAnalyticsModal.viewers.map((viewer, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                      <div className="flex items-center gap-2">
                        <img src={viewer.userAvatar || getLetterAvatar(viewer.userName)} alt="avatar" className="w-7 h-7 rounded-full" />
                        <span className="font-bold">{viewer.userName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{formatChatTimestamp(viewer.viewedAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
