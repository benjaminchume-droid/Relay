import React from 'react';
import { 
  X, 
  Image as ImageIcon, 
  Film, 
  Mic, 
  FileText, 
  MapPin, 
  Smile, 
  CornerUpLeft 
} from 'lucide-react';
import { motion } from 'motion/react';
import { Message } from '../types';

export interface ReplyPreviewComposerProps {
  message: Message;
  onCancel: () => void;
  onJumpToMessage?: (messageId: string) => void;
}

export const ReplyPreviewComposer: React.FC<ReplyPreviewComposerProps> = ({
  message,
  onCancel,
  onJumpToMessage,
}) => {
  const attachment = message.attachments?.[0];

  const getMediaPreview = () => {
    if (message.type === 'image' || attachment?.type === 'image') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          {attachment?.url ? (
            <img 
              src={attachment.url} 
              alt="attachment preview" 
              className="w-9 h-9 object-cover rounded-lg border border-white/40 shrink-0"
            />
          ) : (
            <ImageIcon size={15} className="text-blue-500 shrink-0" />
          )}
          <span className="truncate max-w-[200px]">{message.content || 'Photo'}</span>
        </div>
      );
    }

    if (message.type === 'video' || attachment?.type === 'video') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          {attachment?.thumbnailUrl ? (
            <img 
              src={attachment.thumbnailUrl} 
              alt="video thumbnail" 
              className="w-9 h-9 object-cover rounded-lg border border-white/40 shrink-0"
            />
          ) : (
            <Film size={15} className="text-purple-500 shrink-0" />
          )}
          <span className="truncate max-w-[200px]">{message.content || 'Video'}</span>
        </div>
      );
    }

    if (message.type === 'voice' || attachment?.type === 'voice') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-mono">
          <Mic size={15} className="text-emerald-500 shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-bold">Voice Note</span>
            <span className="opacity-70">({attachment?.duration || 0}s)</span>
          </div>
        </div>
      );
    }

    if (message.type === 'file' || attachment?.type === 'file') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <FileText size={15} className="text-amber-500 shrink-0" />
          <span className="truncate max-w-[200px] font-mono">{attachment?.fileName || message.content || 'Document'}</span>
        </div>
      );
    }

    if (message.type === 'location') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <MapPin size={15} className="text-rose-500 shrink-0" />
          <span className="truncate max-w-[200px]">{message.content || 'Location'}</span>
        </div>
      );
    }

    return (
      <span className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 break-words">
        {message.content}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="p-1.5 px-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-blue-500/30 dark:border-blue-400/20 shadow-md flex items-center justify-between gap-2 mb-1.5"
    >
      <div 
        onClick={() => onJumpToMessage?.(message.id)}
        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
      >
        <div className="w-1 h-6 rounded-full bg-blue-600 shrink-0" />
        <CornerUpLeft size={14} className="text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-blue-600 dark:text-blue-400">
              Replying to {message.senderName}
            </span>
          </div>
          {getMediaPreview()}
        </div>
      </div>

      <button
        onClick={onCancel}
        className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer shrink-0"
        title="Cancel reply"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
};
