import React from 'react';
import { 
  CornerUpLeft, 
  Image as ImageIcon, 
  Film, 
  Mic, 
  FileText, 
  MapPin, 
  AlertCircle 
} from 'lucide-react';
import { QuotedMessageSummary } from '../types';

export interface QuotedReplyBubbleProps {
  quotedMessage?: QuotedMessageSummary;
  isMine?: boolean;
  onJumpToMessage?: (messageId: string) => void;
}

export const QuotedReplyBubble: React.FC<QuotedReplyBubbleProps> = ({
  quotedMessage,
  isMine = false,
  onJumpToMessage,
}) => {
  if (!quotedMessage) {
    return (
      <div className={`p-2 rounded-xl mb-1.5 text-xs flex items-center gap-1.5 ${
        isMine ? 'bg-white/15 text-white/80' : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
      }`}>
        <AlertCircle size={13} className="shrink-0" />
        <span className="italic text-[11px]">Original message deleted</span>
      </div>
    );
  }

  const attachment = quotedMessage.attachments?.[0];

  const renderContentPreview = () => {
    if (quotedMessage.type === 'image' || attachment?.type === 'image') {
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          {attachment?.url ? (
            <img src={attachment.url} alt="quoted photo" className="w-6 h-6 object-cover rounded-md border border-white/30 shrink-0" />
          ) : (
            <ImageIcon size={13} />
          )}
          <span className="truncate">{quotedMessage.content || 'Photo'}</span>
        </div>
      );
    }

    if (quotedMessage.type === 'video' || attachment?.type === 'video') {
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          {attachment?.thumbnailUrl ? (
            <img src={attachment.thumbnailUrl} alt="quoted video" className="w-6 h-6 object-cover rounded-md border border-white/30 shrink-0" />
          ) : (
            <Film size={13} />
          )}
          <span className="truncate">{quotedMessage.content || 'Video'}</span>
        </div>
      );
    }

    if (quotedMessage.type === 'voice' || attachment?.type === 'voice') {
      return (
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <Mic size={13} />
          <span>Voice Note ({attachment?.duration || 0}s)</span>
        </div>
      );
    }

    if (quotedMessage.type === 'file' || attachment?.type === 'file') {
      return (
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <FileText size={13} />
          <span className="truncate">{attachment?.fileName || quotedMessage.content || 'Document'}</span>
        </div>
      );
    }

    if (quotedMessage.type === 'location') {
      return (
        <div className="flex items-center gap-1.5 text-[11px]">
          <MapPin size={13} />
          <span className="truncate">{quotedMessage.content || 'Location'}</span>
        </div>
      );
    }

    return (
      <p className="text-[10.5px] line-clamp-2 break-words opacity-90 leading-snug">
        {quotedMessage.content}
      </p>
    );
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (quotedMessage.id && onJumpToMessage) {
          onJumpToMessage(quotedMessage.id);
        }
      }}
      className={`p-1 px-2 rounded-lg mb-1 cursor-pointer transition-all hover:brightness-105 active:scale-[0.99] flex items-center gap-1.5 border-l-2 ${
        isMine
          ? 'bg-white/15 border-white/90 text-white shadow-xs'
          : 'bg-slate-100/90 dark:bg-slate-800/80 border-blue-600 text-slate-800 dark:text-slate-100 shadow-xs'
      }`}
      title="Click to view original message"
    >
      <CornerUpLeft size={11} className={`shrink-0 ${isMine ? 'text-white/80' : 'text-blue-600'}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] font-bold truncate ${isMine ? 'text-cyan-200' : 'text-blue-600 dark:text-blue-400'}`}>
          {quotedMessage.senderName}
        </div>
        {renderContentPreview()}
      </div>
    </div>
  );
};
