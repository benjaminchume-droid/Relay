import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Download, 
  Share2, 
  Star, 
  Trash2, 
  CornerUpRight, 
  Info, 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Send,
  Heart,
  Flame,
  Laugh,
  ThumbsUp,
  Smile
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, MessageAttachment } from '../types';
import { VoiceNoteBubble } from '../modules/voice/VoiceNoteBubble';
import { formatChatTimestamp } from '../lib/utils';

export interface MediaViewerModalProps {
  isOpen: boolean;
  activeMessage: Message | null;
  allChatMessages: Message[];
  onClose: () => void;
  onStarMessage?: (msgId: string) => void;
  onForwardMessage?: (msg: Message) => void;
  onDeleteMessage?: (msgId: string) => void;
  onReactMessage?: (msgId: string, emoji: string) => void;
  onSendReply?: (replyToId: string, text: string) => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  activeMessage,
  allChatMessages,
  onClose,
  onStarMessage,
  onForwardMessage,
  onDeleteMessage,
  onReactMessage,
  onSendReply,
}) => {
  // Extract all media messages from current chat
  const mediaMessages = allChatMessages.filter(
    (m) => m.attachments && m.attachments.length > 0
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showFilmstrip, setShowFilmstrip] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (activeMessage) {
      const foundIdx = mediaMessages.findIndex((m) => m.id === activeMessage.id);
      setCurrentIndex(foundIdx >= 0 ? foundIdx : 0);
    }
  }, [activeMessage, mediaMessages]);

  if (!isOpen || mediaMessages.length === 0) return null;

  const currentMsg = mediaMessages[currentIndex] || activeMessage || mediaMessages[0];
  const attachment: MessageAttachment | undefined = currentMsg?.attachments?.[0];

  const handlePrev = () => {
    setZoomScale(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : mediaMessages.length - 1));
  };

  const handleNext = () => {
    setZoomScale(1);
    setCurrentIndex((prev) => (prev < mediaMessages.length - 1 ? prev + 1 : 0));
  };

  const handleDoubleTap = () => {
    setZoomScale((prev) => (prev === 1 ? 2.5 : 1));
  };

  const handleTogglePlayVideo = () => {
    if (!videoRef.current) return;
    if (isPlayingVideo) {
      videoRef.current.pause();
      setIsPlayingVideo(false);
    } else {
      videoRef.current.play();
      setIsPlayingVideo(true);
    }
  };

  const handleSendQuickReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReplyText.trim() || !currentMsg) return;
    onSendReply?.(currentMsg.id, quickReplyText.trim());
    setQuickReplyText('');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-50 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Media Viewer Toolbar */}
      <div className="w-full p-4 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between z-20 text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
          
          <div>
            <div className="text-xs font-bold">{currentMsg.senderName}</div>
            <div className="text-[10px] text-slate-400 font-mono">
              {formatChatTimestamp(currentMsg.timestamp)} • ({currentIndex + 1} of {mediaMessages.length})
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {attachment?.url && (
            <a
              href={attachment.url}
              download={attachment.fileName || 'media'}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title="Download to device"
            >
              <Download size={17} />
            </a>
          )}

          <button
            onClick={() => onStarMessage?.(currentMsg.id)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Star media"
          >
            <Star size={17} />
          </button>

          <button
            onClick={() => onForwardMessage?.(currentMsg)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            title="Forward media"
          >
            <CornerUpRight size={17} />
          </button>

          <button
            onClick={() => setShowInfoPanel(!showInfoPanel)}
            className={`p-2 rounded-full transition-all cursor-pointer ${
              showInfoPanel ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Media info"
          >
            <Info size={17} />
          </button>

          <button
            onClick={() => onDeleteMessage?.(currentMsg.id)}
            className="p-2 rounded-full bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white transition-all cursor-pointer"
            title="Delete media"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      {/* Main Immersive Stage with Pan/Zoom & Swipe Gestures */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden">
        {/* Navigation Arrows */}
        {mediaMessages.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 z-20 transition-all cursor-pointer"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 z-20 transition-all cursor-pointer"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Media Render Target */}
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.y) > 120) {
              onClose();
            }
          }}
          onDoubleClick={handleDoubleTap}
          style={{ scale: zoomScale }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="max-w-full max-h-full flex items-center justify-center p-4 cursor-grab active:cursor-grabbing"
        >
          {currentMsg.type === 'image' || attachment?.type === 'image' ? (
            <img
              src={attachment?.url || ''}
              alt="fullscreen media"
              className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          ) : currentMsg.type === 'video' || attachment?.type === 'video' ? (
            <div className="relative max-h-[75vh] max-w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <video
                ref={videoRef}
                src={attachment?.url || ''}
                controls={false}
                muted={isMuted}
                className="max-h-[75vh] object-contain rounded-2xl"
              />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-4 text-white z-20 border border-white/20">
                <button onClick={handleTogglePlayVideo} className="cursor-pointer">
                  {isPlayingVideo ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button onClick={() => setIsMuted(!isMuted)} className="cursor-pointer">
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  onClick={() => {
                    const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
                    setPlaybackSpeed(nextSpeed);
                    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
                  }}
                  className="font-mono text-xs font-bold cursor-pointer"
                >
                  {playbackSpeed}x
                </button>
              </div>
            </div>
          ) : currentMsg.type === 'voice' || attachment?.type === 'voice' ? (
            <div className="p-6 bg-slate-900/90 rounded-3xl border border-white/20 shadow-2xl max-w-md w-full">
              <VoiceNoteBubble
                audioUrl={attachment?.url || ''}
                duration={attachment?.duration || 10}
                waveformData={attachment?.waveformData}
                fileName={attachment?.fileName}
                isMine={false}
              />
            </div>
          ) : null}
        </motion.div>

        {/* Media EXIF & Metadata Info Modal */}
        <AnimatePresence>
          {showInfoPanel && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="absolute right-4 top-20 bottom-24 w-80 bg-slate-900/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-4 text-white z-30 shadow-2xl overflow-y-auto space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-xs">Media Details & EXIF</span>
                <button onClick={() => setShowInfoPanel(false)} className="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block">File Name:</span>
                  <span className="text-white truncate block">{attachment?.fileName || 'RelayMedia.jpg'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Sender:</span>
                  <span className="text-blue-400 font-bold">{currentMsg.senderName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Sent Date:</span>
                  <span className="text-white">{new Date(currentMsg.timestamp).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Type:</span>
                  <span className="text-emerald-400 uppercase">{currentMsg.type}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Bar: Filmstrip, Quick Reactions & Quick Reply */}
      <div className="w-full bg-gradient-to-t from-black/90 to-transparent p-4 flex flex-col gap-3 z-20 text-white">
        {/* Caption */}
        {currentMsg.content && (
          <div className="text-center text-xs font-medium text-slate-200 max-w-xl mx-auto line-clamp-2">
            {currentMsg.content}
          </div>
        )}

        {/* Quick Reactions Bar */}
        <div className="flex items-center justify-center gap-3 bg-white/10 backdrop-blur-md py-1.5 px-4 rounded-full max-w-fit mx-auto border border-white/15">
          {['❤️', '🔥', '😂', '👍', '😮', '😢'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReactMessage?.(currentMsg.id, emoji)}
              className="hover:scale-125 transition-transform text-lg cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Quick Reply Box */}
        <form onSubmit={handleSendQuickReply} className="max-w-xl w-full mx-auto flex items-center gap-2">
          <input
            type="text"
            placeholder={`Reply to ${currentMsg.senderName}...`}
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Send size={15} />
          </button>
        </form>

        {/* Filmstrip Carousel */}
        {showFilmstrip && mediaMessages.length > 1 && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto py-1 max-w-xl mx-auto">
            {mediaMessages.map((m, idx) => {
              const att = m.attachments?.[0];
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setZoomScale(1);
                    setCurrentIndex(idx);
                  }}
                  className={`w-10 h-10 rounded-lg overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                    idx === currentIndex ? 'border-blue-500 scale-110 shadow-lg' : 'border-white/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  {att?.url ? (
                    <img src={att.url} alt="thumb" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px]">
                      {m.type}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
