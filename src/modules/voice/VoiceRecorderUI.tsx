import React, { useEffect, useState } from 'react';
import { 
  Mic, 
  Square, 
  Pause, 
  Play, 
  Trash2, 
  Send, 
  Lock, 
  LockOpen, 
  RefreshCw, 
  AlertCircle,
  X
} from 'lucide-react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { VoiceNoteData } from './types';
import { VoiceNoteBubble } from './VoiceNoteBubble';

export interface VoiceRecorderUIProps {
  onSendVoiceNote: (voiceNote: VoiceNoteData) => void;
  onCancel?: () => void;
  className?: string;
}

export const VoiceRecorderUI: React.FC<VoiceRecorderUIProps> = ({
  onSendVoiceNote,
  onCancel,
  className = '',
}) => {
  const [swipeCancelOffset, setSwipeCancelOffset] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const {
    status,
    recordingSeconds,
    liveWaveform,
    permissionDenied,
    errorMessage,
    isLocked,
    previewNote,
    startRecording,
    pauseRecording,
    resumeRecording,
    lockRecording,
    stopRecording,
    cancelRecording,
    clearPreview,
  } = useVoiceRecorder();

  // Format timer `00:05`
  const formatSeconds = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Handle Touch Swipe to Cancel
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || status !== 'recording' || isLocked) return;
    const currentX = e.touches[0].clientX;
    const diffX = touchStartX - currentX; // distance swiped left
    if (diffX > 0) {
      setSwipeCancelOffset(Math.min(180, diffX));
      if (diffX > 140) {
        cancelRecording();
        setSwipeCancelOffset(0);
        setTouchStartX(null);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStartX(null);
    setSwipeCancelOffset(0);
  };

  const handleSendPreview = () => {
    if (previewNote) {
      onSendVoiceNote(previewNote);
      clearPreview();
    }
  };

  const handleFinishAndSend = async () => {
    const note = await stopRecording();
    if (note) {
      onSendVoiceNote(note);
      clearPreview();
    }
  };

  // If permission denied error
  if (permissionDenied || errorMessage) {
    return (
      <div className={`p-3.5 rounded-2xl bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/30 text-slate-800 dark:text-rose-100 flex items-center justify-between gap-3 animate-fade-in ${className}`}>
        <div className="flex items-center gap-2.5 text-xs font-medium min-w-0">
          <AlertCircle size={18} className="text-rose-500 shrink-0" />
          <span className="truncate">{errorMessage || 'Microphone access is disabled.'}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => startRecording()}
            className="px-2.5 py-1 text-xs font-bold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={onCancel || cancelRecording}
            className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-slate-900 dark:text-slate-400 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  // 1. Preview Mode after recording finished
  if (status === 'previewing' && previewNote) {
    return (
      <div className={`p-3 rounded-2xl bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-lg flex flex-col gap-2 animate-fade-in ${className}`}>
        <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>Voice Note Preview</span>
          <span className="text-[10px] text-slate-400 font-mono">Ready to send</span>
        </div>

        <VoiceNoteBubble
          audioUrl={previewNote.audioUrl}
          duration={previewNote.duration}
          waveformData={previewNote.waveformData}
          fileName={previewNote.fileName}
          isMine={true}
        />

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={cancelRecording}
              className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
              title="Delete recording"
            >
              <Trash2 size={15} /> Delete
            </button>
            <button
              onClick={() => {
                clearPreview();
                startRecording();
              }}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="Re-record"
            >
              <RefreshCw size={14} /> Re-record
            </button>
          </div>

          <button
            onClick={handleSendPreview}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Send size={14} /> Send Voice Note
          </button>
        </div>
      </div>
    );
  }

  // 2. Idle State
  if (status === 'idle') {
    return (
      <button
        onClick={() => startRecording()}
        className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center shrink-0"
        title="Start recording voice note"
      >
        <Mic size={18} />
      </button>
    );
  }

  // 3. Recording / Paused / Locked State
  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: `translateX(-${swipeCancelOffset}px)` }}
      className={`px-2 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-blue-500/30 shadow-md flex items-center justify-between gap-1.5 transition-transform animate-fade-in w-full min-w-0 overflow-hidden ${className}`}
    >
      {/* Live Recording Indicator & Timer */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0 pl-1">
        <div className="relative flex items-center justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping absolute opacity-75" />
          <span className="w-2 h-2 rounded-full bg-rose-600" />
        </div>
        <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-100">
          {formatSeconds(recordingSeconds)}
        </span>
      </div>

      {/* Live Waveform Bars */}
      <div className="flex-1 h-4 flex items-center justify-center gap-0.5 overflow-hidden px-1">
        {(liveWaveform.length > 0 ? liveWaveform.slice(0, 7) : [20, 40, 60, 45, 80, 50, 30]).map((amp, idx) => (
          <div
            key={idx}
            style={{ height: `${Math.max(20, Math.min(100, amp))}%` }}
            className="w-0.5 bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-100"
          />
        ))}
      </div>

      {/* Lock Button (Hands-free recording) */}
      {!isLocked && (
        <button
          onClick={lockRecording}
          className="p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          title="Lock recording"
        >
          <LockOpen size={13} />
        </button>
      )}

      {isLocked && (
        <span className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[9px] font-bold flex items-center gap-0.5 shrink-0">
          <Lock size={10} /> Locked
        </span>
      )}

      {/* Pause / Resume Button */}
      {status === 'paused' ? (
        <button
          onClick={resumeRecording}
          className="p-1.5 rounded-full bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-200 transition-colors cursor-pointer shrink-0"
          title="Resume"
        >
          <Play size={12} className="fill-current" />
        </button>
      ) : (
        <button
          onClick={pauseRecording}
          className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 transition-colors cursor-pointer shrink-0"
          title="Pause"
        >
          <Pause size={12} />
        </button>
      )}

      {/* Delete / Cancel Button */}
      <button
        onClick={cancelRecording}
        className="p-1.5 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
        title="Cancel recording"
      >
        <Trash2 size={13} />
      </button>

      {/* Finish & Send Button */}
      <button
        onClick={handleFinishAndSend}
        className="p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
        title="Send voice note"
      >
        <Send size={12} />
      </button>
    </div>
  );
};
