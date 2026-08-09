/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Send, Paperclip, Smile, MoreVertical, MoreHorizontal,
  Reply, CornerUpRight, Trash2, Edit3, Pin, Copy, Info, Star, Plus,
  Play, Pause, ShieldAlert, ShieldOff, CheckCheck, X, FileText, Download,
  Check, Mic, Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useThemeStore, ACCENT_COLOR_CONFIG } from '../store/themeStore';
import { useContactsStore } from '../store/contactsStore';
import { Message, MessageAttachment } from '../types';
import { apiService } from '../services/apiService';
import { formatChatTimestamp, formatHandle } from '../lib/utils';
import { getLetterAvatar } from '../lib/avatar';
import { ContactProfileScreen } from './ContactProfileScreen';
import { GroupProfileScreen } from './GroupProfileScreen';
import { VoiceRecorderUI } from '../modules/voice/VoiceRecorderUI';
import { VoiceNoteBubble } from '../modules/voice/VoiceNoteBubble';
import { voiceStorageService } from '../modules/voice/voiceStorageService';
import { VoiceNoteData } from '../modules/voice/types';
import { ReplyPreviewComposer } from './ReplyPreviewComposer';
import { QuotedReplyBubble } from './QuotedReplyBubble';
import { SwipeableMessageItem } from './SwipeableMessageItem';
import { AmbientLiquidBackground } from './GlassUI';
import { RelayCameraModal } from '../modules/camera/RelayCameraModal';
import { CapturedMediaResult } from '../modules/camera/types';
import { MediaViewerModal } from './MediaViewerModal';
import { StickerPickerModal } from '../modules/stickers/StickerPickerModal';
import { Sticker } from '../modules/stickers/types';
import { useRelayRealtime } from '../services/realtime/useRelayRealtime';

export const ChatScreen: React.FC<{
  chatId: string;
  onBack: () => void;
}> = ({ chatId, onBack }) => {
  const [text, setText] = useState('');
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showProfileScreen, setShowProfileScreen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [attachmentDrafts, setAttachmentDrafts] = useState<MessageAttachment[]>([]);
  
  // Interactive UI & Long Press Popover State
  const [activeContextMenuMsg, setActiveContextMenuMsg] = useState<Message | null>(null);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [showInfoModal, setShowInfoModal] = useState<Message | null>(null);
  const [starredMsgIds, setStarredMsgIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeMediaViewerMsg, setActiveMediaViewerMsg] = useState<Message | null>(null);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);

  const handleStickerSelected = async (sticker: Sticker) => {
    setIsStickerPickerOpen(false);
    try {
      await sendMessage({
        content: sticker.name,
        type: 'image',
        attachments: [{
          id: sticker.id,
          type: 'image',
          url: sticker.url,
          fileName: `Sticker_${sticker.name}`
        }]
      });
      triggerToast('Sticker sent');
    } catch (err) {
      console.error('Failed to send sticker:', err);
    }
  };

  const handleCameraMediaCaptured = async (media: CapturedMediaResult) => {
    setIsCameraOpen(false);
    try {
      const fileName = `Camera_${Date.now()}.${media.type === 'video' ? 'webm' : 'jpg'}`;
      const mimeType = media.type === 'video' ? 'video/webm' : 'image/jpeg';
      const { url } = await apiService.uploadFile(media.dataUrl, fileName, mimeType);

      await sendMessage({
        content: media.caption || '',
        type: media.type,
        attachments: [{
          id: media.id,
          type: media.type,
          url,
          fileName
        }]
      });
    } catch (err) {
      console.error('Failed to upload captured camera media:', err);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<any>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const toggleSelectMsg = (msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const { currentUser } = useAuthStore();
  const { 
    chats, messages, activeTyping, replyingToMessage, 
    sendMessage, retryMessage, editMessage, deleteMessage, reactToMessage, 
    togglePinMessage, sendTypingSignal, pollUpdates, 
    setReplyingToMessage, setForwardingMessage 
  } = useChatStore();

  const { customization } = useThemeStore();
  const { openReportModal } = useContactsStore();
  const { toggleBlockUser } = useAuthStore();
  const { subscriptions } = useRelayRealtime();

  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];
  const chat = chats.find((c) => c.id === chatId);
  const chatMsgs = messages[chatId] || [];
  const activeTypingUsers = activeTyping[chatId] || [];

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleJumpToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-blue-500', 'bg-blue-500/20', 'rounded-2xl', 'transition-all');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-500/20', 'rounded-2xl');
      }, 1500);
    } else {
      triggerToast('Original message not found in conversation');
    }
  };

  // Subscribe to Realtime messages & conversation events
  useEffect(() => {
    subscriptions.subscribeToMessages(chatId);
    subscriptions.subscribeToConversation(chatId);
    return () => {
      subscriptions.unsubscribeFromConversation(chatId);
    };
  }, [chatId]);

  // Fallback poll for message updates every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      pollUpdates();
    }, 5000);
    return () => clearInterval(interval);
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, activeTypingUsers]);

  // Voice recording timer
  useEffect(() => {
    let interval: any;
    if (isRecordingVoice) {
      interval = setInterval(() => setVoiceSeconds((s) => s + 1), 1000);
    } else {
      setVoiceSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingVoice]);

  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());

  const toggleExpandMsg = (msgId: string) => {
    setExpandedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  if (!chat) return null;

  // Render Full Contact / Group Profile Screen when user taps header/name
  if (showProfileScreen) {
    if (chat.type === 'group') {
      return (
        <GroupProfileScreen 
          chatId={chat.id}
          onBack={() => setShowProfileScreen(false)}
        />
      );
    }
    const targetUserId = chat.participants?.find((p) => p !== currentUser?.id) || chat.id;
    return (
      <ContactProfileScreen 
        targetUserId={targetUserId}
        onBack={() => setShowProfileScreen(false)}
        onStartChat={() => setShowProfileScreen(false)}
      />
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    sendTypingSignal(chatId);
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() && attachmentDrafts.length === 0) return;

    if (editingMsgId) {
      await editMessage(editingMsgId, text.trim());
      setEditingMsgId(null);
    } else {
      await sendMessage({
        content: text.trim(),
        type: attachmentDrafts.length > 0 ? (attachmentDrafts[0].type === 'image' ? 'image' : 'file') : 'text',
        attachments: attachmentDrafts.length > 0 ? attachmentDrafts : undefined
      });
    }

    setText('');
    setAttachmentDrafts([]);
  };

  const handleVoiceNoteRecorded = async (voiceNote: VoiceNoteData) => {
    setIsRecordingVoice(false);
    try {
      const { url } = await voiceStorageService.uploadVoiceNote(voiceNote);
      await sendMessage({
        content: 'Voice note',
        type: 'voice',
        attachments: [{
          id: 'att_vn_' + Date.now(),
          type: 'voice',
          url,
          duration: voiceNote.duration,
          fileName: voiceNote.fileName,
          waveformData: voiceNote.waveformData
        }]
      });
    } catch (err) {
      console.error('Failed to upload or send voice note:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const { url } = await apiService.uploadFile(base64, file.name, file.type);
        const attachment: MessageAttachment = {
          id: 'att_' + Date.now(),
          type: file.type.startsWith('image/') ? 'image' : 'file',
          url,
          fileName: file.name,
          fileSize: `${(file.size / 1024).toFixed(1)} KB`
        };
        setAttachmentDrafts((prev) => [...prev, attachment]);
      } catch (err) {
        console.error("Upload failed", err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Long press handler for touch & desktop + swipe right to reply
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
    if ('touches' in e && e.touches[0]) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      toggleSelectMsg(msg.id);
      setActiveContextMenuMsg(msg);
    }, 380);
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (touchStartPos.current && 'changedTouches' in e && e.changedTouches?.[0]) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - touchStartPos.current.x;
      const deltaY = Math.abs(endY - touchStartPos.current.y);

      // Swipe right gesture to reply
      if (deltaX > 40 && deltaY < 30) {
        setReplyingToMessage(msg);
        triggerToast('Replying to message');
      }
    }
    touchStartPos.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    toggleSelectMsg(msg.id);
    setActiveContextMenuMsg(msg);
  };

  const pinnedMsg = chat.pinnedMessageId ? chatMsgs.find((m) => m.id === chat.pinnedMessageId) : null;

  const currentWallpaper = customization.perChatThemes?.[chat.id]?.wallpaper || customization.chatWallpaper || 'glass-gradient';

  return (
    <div className="w-full h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative overflow-hidden select-none">
      
      {/* Real Dynamic Viewport Wallpaper with Ambient Balls of Accent Color */}
      <AmbientLiquidBackground />

      {/* Grounded Edge-to-Edge Pinned Header */}
      <header className="w-full sticky top-0 left-0 right-0 z-30 h-[56px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 px-4 flex items-center justify-between shadow-xs shrink-0 text-slate-800 dark:text-slate-100">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button 
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer border border-slate-200 shrink-0"
            title="Back to chats"
          >
            <ArrowLeft size={18} />
          </button>

          <div 
            onClick={() => setShowProfileScreen(true)}
            className="flex items-center gap-2.5 cursor-pointer min-w-0 group flex-1"
            title="View Contact Profile"
          >
            <div className="relative shrink-0">
              <img 
                src={chat.avatarUrl || getLetterAvatar(chat.name)} 
                alt={chat.name}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs" 
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>

            <div className="text-left min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900 leading-tight truncate group-hover:text-blue-600 transition-colors">
                {chat.name}
              </h2>
              <span className="text-[11px] text-slate-500 font-medium block truncate">
                {activeTypingUsers.length > 0 ? 'Typing...' : formatHandle((chat as any).username || (chat as any).handle) || 'Tap for contact info'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button 
            onClick={() => setShowProfileScreen(true)}
            className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-all cursor-pointer border border-transparent hover:border-slate-200"
            title="More Options"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </header>

      {/* Pinned Message Banner */}
      {pinnedMsg && (
        <div className="mx-4 my-1.5 px-4 py-2 rounded-xl bg-white/85 backdrop-blur-xl border border-slate-200/80 shadow-xs flex items-center justify-between text-xs font-medium z-10 shrink-0 text-slate-800">
          <div className="flex items-center gap-2 text-slate-800 min-w-0">
            <Pin size={13} className="text-blue-600 shrink-0 fill-blue-600" />
            <span className="truncate"><b>Pinned Message:</b> {pinnedMsg.content}</span>
          </div>
          <button onClick={() => togglePinMessage(pinnedMsg.id)} className="text-blue-600 hover:underline text-[10px] font-bold shrink-0">
            Unpin
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 md:px-6 space-y-2 max-w-4xl w-full mx-auto">

        {chatMsgs.map((msg) => {
          const isMine = currentUser && msg.senderId === currentUser.id;
          const isStarred = starredMsgIds.has(msg.id);
          const deliveryState = msg.deliveryState || 'read';

          return (
            <SwipeableMessageItem
              key={msg.id}
              messageId={msg.id}
              onSwipeToReply={() => setReplyingToMessage(msg)}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group relative`}
            >
              {/* Forwarded Header */}
              {msg.isForwarded && (
                <div className="text-[9px] font-mono font-bold text-slate-400 mb-0.5 uppercase tracking-wider flex items-center gap-1">
                  <CornerUpRight size={10} /> Forwarded
                </div>
              )}

              {/* Edge-to-Edge Chat Bubble Container */}
              <div className="flex items-end gap-1.5 max-w-[85%] sm:max-w-[80%] min-w-0">
                
                {/* Incoming Avatar */}
                {!isMine && (
                  <img 
                    src={msg.senderAvatar || chat.avatarUrl || getLetterAvatar(msg.senderName || chat.name)} 
                    alt={msg.senderName}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200 shadow-xs shrink-0 mb-0.5" 
                  />
                )}

                {/* Grounded Edge-to-Edge Message Bubble */}
                <div 
                  onTouchStart={(e) => handleTouchStart(e, msg)}
                  onTouchEnd={(e) => handleTouchEnd(e, msg)}
                  onMouseDown={(e) => handleTouchStart(e, msg)}
                  onMouseUp={(e) => handleTouchEnd(e, msg)}
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                  style={isMine ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : {}}
                  className={`px-3.5 py-2.5 rounded-2xl text-[12.5px] font-medium leading-relaxed relative text-left transition-all cursor-pointer shadow-xs w-fit max-w-full [overflow-wrap:anywhere] [word-break:break-word] break-words break-all ${
                    selectedMsgIds.has(msg.id) ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                  } ${
                    isMine 
                      ? 'text-white rounded-br-xs shadow-xs' 
                      : 'bg-white/95 dark:bg-slate-800/95 border border-slate-200/90 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 rounded-bl-xs shadow-xs'
                  }`}
                >
                  {/* Quoted Reply Banner */}
                  {(msg.replyToId || msg.replyToMessage) && (
                    <QuotedReplyBubble
                      quotedMessage={msg.replyToMessage || {
                        id: msg.replyToId || '',
                        senderName: 'User',
                        content: 'Quoted message'
                      }}
                      isMine={isMine}
                      onJumpToMessage={handleJumpToMessage}
                    />
                  )}

                  {/* Sender Name in Groups */}
                  {!isMine && chat.type === 'group' && (
                    <span className="block text-[10px] font-bold text-blue-600 mb-0.5">
                      {msg.senderName}
                    </span>
                  )}

                  {/* Message Content */}
                  {msg.isDeleted ? (
                    <span className="italic opacity-60">This message was deleted</span>
                  ) : (
                    <div className="inline">
                      {msg.type === 'text' && (
                        <div>
                          <span className={`[overflow-wrap:anywhere] [word-break:break-word] break-words break-all block whitespace-pre-wrap ${!expandedMsgIds.has(msg.id) && msg.content.length > 280 ? 'line-clamp-4' : ''}`}>
                            {msg.content}
                          </span>
                          {msg.content.length > 280 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpandMsg(msg.id);
                              }}
                              className={`text-[10px] font-bold block mt-1 hover:underline cursor-pointer ${isMine ? 'text-cyan-200' : 'text-blue-600'}`}
                            >
                              {expandedMsgIds.has(msg.id) ? 'Read less' : 'Read more...'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Voice Note */}
                      {msg.type === 'voice' && (
                        <VoiceNoteBubble
                          audioUrl={msg.attachments?.[0]?.url || ''}
                          duration={msg.attachments?.[0]?.duration || 10}
                          waveformData={msg.attachments?.[0]?.waveformData}
                          fileName={msg.attachments?.[0]?.fileName}
                          isMine={isMine}
                        />
                      )}

                      {/* Image Attachment */}
                      {msg.type === 'image' && msg.attachments?.[0] && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMediaViewerMsg(msg);
                          }}
                          className="space-y-2 cursor-pointer group/img"
                        >
                          <img 
                            src={msg.attachments[0].url} 
                            alt="attachment" 
                            className="rounded-2xl max-h-60 w-full object-cover shadow-xs border border-white/40 group-hover/img:brightness-105 transition-all"
                          />
                          {msg.content && <p className="text-[11.5px]">{msg.content}</p>}
                        </div>
                      )}

                      {/* File Attachment */}
                      {msg.type === 'file' && msg.attachments?.[0] && (
                        <div className="flex items-center gap-3 p-2 bg-slate-100/50 rounded-xl">
                          <FileText size={18} className="text-blue-600" />
                          <div className="min-w-0 flex-1">
                            <span className="block text-[11px] font-bold truncate">{msg.attachments[0].fileName}</span>
                            <span className="text-[9px] text-slate-500 font-mono">{msg.attachments[0].fileSize}</span>
                          </div>
                          <a href={msg.attachments[0].url} download target="_blank" rel="noreferrer" className="p-1 text-slate-600 hover:text-slate-900">
                            <Download size={13} />
                          </a>
                        </div>
                      )}

                      {/* Inline Timestamp, Star & 1 tick, 2 tick, colored tick status */}
                      <span className="inline-flex items-center gap-1 text-[9px] opacity-80 font-mono float-right ml-2 mt-1 select-none">
                        {isStarred && <Star size={9} className="fill-amber-400 text-amber-400" />}
                        {msg.isEdited && <span>(edited)</span>}
                        <span>{formatChatTimestamp(msg.timestamp)}</span>
                        {isMine && (
                          deliveryState === 'sending' ? (
                            <span className="w-2.5 h-2.5 rounded-full border-2 border-white/70 border-t-transparent animate-spin inline-block ml-0.5" title="Sending message..." />
                          ) : deliveryState === 'failed' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                retryMessage(msg.id);
                              }}
                              className="inline-flex items-center gap-0.5 bg-red-500/80 hover:bg-red-600 px-1.5 py-0.5 rounded-md text-white text-[9px] font-bold cursor-pointer transition-colors ml-1 shadow-xs"
                              title="Tap to retry sending message"
                            >
                              <span>Retry</span>
                            </button>
                          ) : deliveryState === 'read' ? (
                            <CheckCheck size={13} className="text-cyan-200 fill-cyan-200" />
                          ) : deliveryState === 'delivered' ? (
                            <CheckCheck size={13} className="text-white/70" />
                          ) : (
                            <Check size={13} className="text-white/70" />
                          )
                        )}
                      </span>
                    </div>
                  )}

                  {/* Message Reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="absolute -bottom-2.5 right-2 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] shadow-xs border border-white flex items-center gap-1 text-slate-800">
                      {msg.reactions.map((r, i) => (
                        <span key={i}>{r.emoji}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </SwipeableMessageItem>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Replying Preview Composer */}
      <AnimatePresence>
        {replyingToMessage && (
          <div className="max-w-4xl w-full mx-auto px-3">
            <ReplyPreviewComposer
              message={replyingToMessage}
              onCancel={() => setReplyingToMessage(null)}
              onJumpToMessage={handleJumpToMessage}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Editing Banner */}
      {editingMsgId && (
        <div className="mx-4 my-1 px-4 py-2 bg-amber-50/90 backdrop-blur-md border border-amber-200/80 rounded-2xl flex items-center justify-between text-xs font-semibold text-amber-900 shadow-xs">
          <div className="flex items-center gap-2">
            <Edit3 size={14} className="text-amber-600 shrink-0" />
            <span>Editing message</span>
          </div>
          <button onClick={() => { setEditingMsgId(null); setText(''); }} className="p-1 text-amber-700 hover:text-amber-950">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment Drafts Preview */}
      {attachmentDrafts.length > 0 && (
        <div className="mx-4 my-1 px-4 py-2 bg-white/90 backdrop-blur-md border border-white/90 rounded-2xl flex items-center gap-2 overflow-x-auto shadow-xs">
          {attachmentDrafts.map((att, i) => (
            <div key={i} className="relative p-2 bg-slate-100 rounded-xl text-xs flex items-center gap-2 border border-slate-200">
              <span className="truncate max-w-[120px] font-bold">{att.fileName}</span>
              <button onClick={() => setAttachmentDrafts((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-slate-700">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Grounded Edge-to-Edge Bottom Input Dock */}
      <footer className="w-full sticky bottom-0 left-0 right-0 z-30 border-t border-slate-200/80 bg-white/75 backdrop-blur-xl p-2.5 sm:p-3 shadow-lg shrink-0">
        <div className="max-w-4xl mx-auto w-full space-y-2">
          
          {/* Attached Reply Preview Banner */}
          <AnimatePresence>
            {replyingToMessage && (
              <ReplyPreviewComposer
                message={replyingToMessage}
                onCancel={() => setReplyingToMessage(null)}
                onJumpToMessage={handleJumpToMessage}
              />
            )}
          </AnimatePresence>

          {/* Attached Editing Banner */}
          {editingMsgId && (
            <div className="px-3 py-1.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between text-xs font-semibold text-amber-900 shadow-xs">
              <div className="flex items-center gap-2">
                <Edit3 size={14} className="text-amber-600 shrink-0" />
                <span>Editing message</span>
              </div>
              <button onClick={() => { setEditingMsgId(null); setText(''); }} className="p-1 text-amber-700 hover:text-amber-950">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Attached Attachment Drafts */}
          {attachmentDrafts.length > 0 && (
            <div className="px-3 py-1.5 bg-slate-100/90 border border-slate-200 rounded-xl flex items-center gap-2 overflow-x-auto shadow-xs">
              {attachmentDrafts.map((att, i) => (
                <div key={i} className="relative p-1.5 bg-white rounded-lg text-xs flex items-center gap-2 border border-slate-200">
                  <span className="truncate max-w-[120px] font-bold text-slate-800">{att.fileName}</span>
                  <button onClick={() => setAttachmentDrafts((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-slate-700">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {currentUser?.blockedUsers?.includes(chat.participants?.find((p) => p !== currentUser?.id) || chat.id) ? (
            <div className="w-full p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <ShieldOff size={16} />
                <span>You blocked this contact. Unblock to send messages.</span>
              </div>
              <button
                onClick={() => {
                  const targetId = chat.participants?.find((p) => p !== currentUser?.id) || chat.id;
                  toggleBlockUser(targetId);
                  triggerToast('Unblocked contact');
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs"
              >
                Unblock
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendText} className="flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />

              {/* Attach '+' Button */}
              {!isRecordingVoice && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200/90 transition-all cursor-pointer shrink-0 shadow-xs"
                  title="Attach File or Photo"
                >
                  <Plus size={18} />
                </button>
              )}

              {/* In-App Camera Button */}
              {!isRecordingVoice && (
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200/90 transition-all cursor-pointer shrink-0 shadow-xs"
                  title="Open In-App Camera"
                >
                  <Camera size={17} />
                </button>
              )}

              {isRecordingVoice ? (
                <VoiceRecorderUI
                  onSendVoiceNote={handleVoiceNoteRecorded}
                  onCancel={() => setIsRecordingVoice(false)}
                  className="flex-1"
                />
              ) : (
                <>
                  <div className="flex-1 relative flex items-center">
                    <input 
                      type="text"
                      placeholder="Type a message..."
                      value={text}
                      onChange={handleInputChange}
                      className="w-full py-2 pl-4 pr-10 rounded-full bg-white/90 border border-slate-300/80 text-xs text-slate-900 placeholder-slate-400 font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/30 transition-all shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setIsStickerPickerOpen(true)}
                      className="absolute right-2 text-slate-400 hover:text-slate-700 p-1 rounded-full transition-colors cursor-pointer"
                      title="Open Sticker Store"
                    >
                      <Smile size={18} />
                    </button>
                  </div>

                  {text.trim() || attachmentDrafts.length > 0 ? (
                    <button
                      type="submit"
                      style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                      className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow-md cursor-pointer hover:scale-105 active:scale-95 transition-all shrink-0 border border-white/20"
                    >
                      <Send size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsRecordingVoice(true)}
                      className="w-9 h-9 rounded-full bg-slate-100/90 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200/90 transition-all cursor-pointer shrink-0 shadow-xs"
                      title="Tap to record voice note"
                    >
                      <Mic size={17} />
                    </button>
                  )}
                </>
              )}
            </form>
          )}
        </div>
      </footer>

      {/* Long-press Context Menu & Reaction Modal */}
      <AnimatePresence>
        {activeContextMenuMsg && (
          <div 
            onClick={() => setActiveContextMenuMsg(null)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
          >
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="flex flex-col items-center gap-3 max-w-sm w-full"
            >
              {/* 1. Floating Emoji Reaction Bar */}
              <motion.div 
                initial={{ scale: 0.8, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.8, y: 10, opacity: 0 }}
                className="px-3 py-2 rounded-full liquid-popover flex items-center justify-between gap-2 shadow-2xl border border-white"
              >
                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      reactToMessage(activeContextMenuMsg.id, emoji);
                      setActiveContextMenuMsg(null);
                    }}
                    className="hover:scale-130 transition-transform text-xl p-1 cursor-pointer active:scale-95"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>

              {/* 2. Highlighted Message Preview Bubble */}
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`p-3.5 rounded-3xl max-w-xs w-full text-[11.5px] font-medium shadow-2xl border border-white/90 ${
                  currentUser && activeContextMenuMsg.senderId === currentUser.id
                    ? 'glass-bubble-mine text-white'
                    : 'glass-bubble-other text-slate-800'
                }`}
              >
                {activeContextMenuMsg.type === 'text' && <p>{activeContextMenuMsg.content}</p>}
                {activeContextMenuMsg.type === 'image' && activeContextMenuMsg.attachments?.[0] && (
                  <img src={activeContextMenuMsg.attachments[0].url} alt="preview" className="rounded-2xl max-h-48 w-full object-cover" />
                )}
                {activeContextMenuMsg.type === 'voice' && (
                  <p className="italic">🎤 Voice Note ({activeContextMenuMsg.attachments?.[0]?.duration || 12}s)</p>
                )}
                <div className="mt-1 text-[9px] opacity-75 font-mono text-right flex items-center justify-end gap-1">
                  <span>{formatChatTimestamp(activeContextMenuMsg.timestamp)}</span>
                  {currentUser && activeContextMenuMsg.senderId === currentUser.id && <CheckCheck size={12} />}
                </div>
              </motion.div>

              {/* 3. Liquid Glass Context Menu Card */}
              <motion.div 
                initial={{ scale: 0.9, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 10, opacity: 0 }}
                className="w-56 liquid-popover rounded-3xl p-2 shadow-2xl border border-white/90 divide-y divide-slate-200/50 text-left"
              >
                <div className="py-1 space-y-0.5">
                  <button 
                    onClick={() => {
                      setReplyingToMessage(activeContextMenuMsg);
                      setActiveContextMenuMsg(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-2xl hover:bg-white/80 text-xs font-semibold text-slate-800 flex items-center gap-3 transition-all cursor-pointer"
                  >
                    <Reply size={15} className="text-slate-500" />
                    <span>Reply</span>
                  </button>

                  <button 
                    onClick={() => {
                      setForwardingMessage(activeContextMenuMsg);
                      setActiveContextMenuMsg(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-2xl hover:bg-white/80 text-xs font-semibold text-slate-800 flex items-center gap-3 transition-all cursor-pointer"
                  >
                    <CornerUpRight size={15} className="text-slate-500" />
                    <span>Forward</span>
                  </button>

                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(activeContextMenuMsg.content);
                      triggerToast('Message copied to clipboard');
                      setActiveContextMenuMsg(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-2xl hover:bg-white/80 text-xs font-semibold text-slate-800 flex items-center gap-3 transition-all cursor-pointer"
                  >
                    <Copy size={15} className="text-slate-500" />
                    <span>Copy</span>
                  </button>

                  <button 
                    onClick={() => {
                      setShowInfoModal(activeContextMenuMsg);
                      setActiveContextMenuMsg(null);
                    }}
                    className="w-full px-3.5 py-2 rounded-2xl hover:bg-white/80 text-xs font-semibold text-slate-800 flex items-center gap-3 transition-all cursor-pointer"
                  >
                    <Info size={15} className="text-slate-500" />
                    <span>Info</span>
                  </button>
                </div>

                {currentUser && activeContextMenuMsg.senderId === currentUser.id && (
                  <div className="py-1 space-y-0.5">
                    <button 
                      onClick={() => {
                        setEditingMsgId(activeContextMenuMsg.id);
                        setText(activeContextMenuMsg.content);
                        setActiveContextMenuMsg(null);
                      }}
                      className="w-full px-3.5 py-2 rounded-2xl hover:bg-white/80 text-xs font-semibold text-slate-800 flex items-center gap-3 transition-all cursor-pointer"
                    >
                      <Edit3 size={15} className="text-blue-600" />
                      <span>Edit</span>
                    </button>

                    <button 
                      onClick={() => {
                        deleteMessage(activeContextMenuMsg.id);
                        triggerToast('Message deleted');
                        setActiveContextMenuMsg(null);
                      }}
                      className="w-full px-3.5 py-2 rounded-2xl hover:bg-red-50 text-xs font-semibold text-red-600 flex items-center gap-3 transition-all cursor-pointer"
                    >
                      <Trash2 size={15} className="text-red-600" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </motion.div>

            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Message Info Modal */}
      <AnimatePresence>
        {showInfoModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 border border-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-left"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Message Info</h3>
                <button onClick={() => setShowInfoModal(null)} className="text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-100/70 border border-slate-200/60 font-medium text-slate-800">
                  "{showInfoModal.content}"
                </div>

                <div className="space-y-2 font-medium text-slate-600">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-400">Sent</span>
                    <span className="font-mono text-[11px]">{formatChatTimestamp(showInfoModal.timestamp)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-400">Delivered</span>
                    <span className="font-mono text-[11px] text-emerald-600 flex items-center gap-1">
                      <CheckCheck size={14} /> Delivered
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Read Status</span>
                    <span className="font-mono text-[11px] text-blue-600 flex items-center gap-1">
                      <CheckCheck size={14} /> Read by recipient
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-2xl backdrop-blur-md border border-white/20 flex items-center gap-2 pointer-events-none"
          >
            <Check size={14} className="text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Built-in Relay Camera Modal */}
      <RelayCameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onMediaCaptured={handleCameraMediaCaptured}
      />

      {/* Full Screen Immersive Media Viewer */}
      <MediaViewerModal
        isOpen={!!activeMediaViewerMsg}
        activeMessage={activeMediaViewerMsg}
        allChatMessages={chatMsgs}
        onClose={() => setActiveMediaViewerMsg(null)}
        onStarMessage={(msgId) => {
          setStarredMsgIds((prev) => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
          });
          triggerToast('Media starred');
        }}
        onForwardMessage={(msg) => {
          setForwardingMessage(msg);
          setActiveMediaViewerMsg(null);
        }}
        onDeleteMessage={(msgId) => {
          deleteMessage(msgId);
          setActiveMediaViewerMsg(null);
          triggerToast('Media deleted');
        }}
        onReactMessage={(msgId, emoji) => {
          reactToMessage(msgId, emoji);
          triggerToast(`Reacted with ${emoji}`);
        }}
        onSendReply={async (replyToId, text) => {
          await sendMessage({
            content: text,
            type: 'text',
            replyToId
          });
          triggerToast('Reply sent');
        }}
      />

      {/* Sticker Store & Custom Sticker Creator Modal */}
      <StickerPickerModal
        isOpen={isStickerPickerOpen}
        onClose={() => setIsStickerPickerOpen(false)}
        onSelectSticker={handleStickerSelected}
      />

    </div>
  );
};
