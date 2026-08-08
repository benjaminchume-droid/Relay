import React, { useRef, useState } from 'react';
import { Play, Pause, Download, RotateCw, AlertCircle, Loader2 } from 'lucide-react';
import { useVoicePlayer } from './useVoicePlayer';

export interface VoiceNoteBubbleProps {
  audioUrl: string;
  duration?: number;
  waveformData?: number[];
  isMine?: boolean;
  uploadStatus?: 'idle' | 'uploading' | 'completed' | 'failed';
  uploadProgress?: number;
  uploadError?: string;
  onRetryUpload?: () => void;
  fileName?: string;
}

export const VoiceNoteBubble: React.FC<VoiceNoteBubbleProps> = ({
  audioUrl,
  duration = 0,
  waveformData,
  isMine = false,
  uploadStatus = 'completed',
  uploadProgress = 0,
  uploadError,
  onRetryUpload,
  fileName = 'Voice Note',
}) => {
  const {
    isPlaying,
    currentTime,
    duration: playerDuration,
    playbackSpeed,
    isBuffering,
    togglePlay,
    seekPercentage,
    cycleSpeed,
    downloadAudio,
  } = useVoicePlayer({
    audioUrl,
    duration,
  });

  const waveformRef = useRef<HTMLDivElement>(null);
  const [isHoveringWaveform, setIsHoveringWaveform] = useState(false);

  // Generate fallback waveform if none provided
  const bars = waveformData && waveformData.length >= 10
    ? waveformData
    : [30, 70, 45, 90, 60, 40, 80, 50, 65, 35, 75, 55, 85, 40, 60, 95, 70, 50, 80, 30, 65, 45, 85, 60, 40, 75];

  const totalDuration = playerDuration || duration || 1;
  const progressRatio = Math.min(1, Math.max(0, currentTime / totalDuration));

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekPercentage(ratio * 100);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={`flex flex-col gap-1.5 p-3 rounded-2xl min-w-[240px] max-w-[320px] ${
      isMine 
        ? 'bg-gradient-to-r from-blue-600/90 to-indigo-600/90 text-white shadow-md backdrop-blur-md border border-white/20' 
        : 'bg-white/70 dark:bg-slate-900/80 text-slate-900 dark:text-white shadow-sm backdrop-blur-md border border-slate-200/60 dark:border-white/10'
    }`}>
      {/* Uploading or Error Overlay */}
      {uploadStatus === 'uploading' && (
        <div className="flex items-center justify-between text-xs font-mono opacity-90 px-1 pb-1 border-b border-white/10">
          <span className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Uploading voice note...
          </span>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {uploadStatus === 'failed' && (
        <div className="flex items-center justify-between text-xs text-rose-300 font-medium px-1 pb-1 border-b border-rose-500/30">
          <span className="flex items-center gap-1 text-[11px] truncate">
            <AlertCircle size={13} className="shrink-0" />
            {uploadError || 'Upload failed'}
          </span>
          {onRetryUpload && (
            <button
              onClick={onRetryUpload}
              className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-white flex items-center gap-1 text-[10px] font-bold cursor-pointer"
            >
              <RotateCw size={10} /> Retry
            </button>
          )}
        </div>
      )}

      {/* Main Player Row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          disabled={uploadStatus === 'uploading' || uploadStatus === 'failed'}
          className={`p-2.5 rounded-full shrink-0 transition-all cursor-pointer shadow-xs ${
            isMine
              ? 'bg-white text-blue-600 hover:bg-blue-50 active:scale-95'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPlaying ? 'Pause' : 'Play voice note'}
        >
          {isBuffering ? (
            <Loader2 size={15} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={15} className="fill-current" />
          ) : (
            <Play size={15} className="fill-current ml-0.5" />
          )}
        </button>

        {/* Interactive Waveform Bar */}
        <div className="flex-1 space-y-1 min-w-0">
          <div
            ref={waveformRef}
            onClick={handleWaveformClick}
            onMouseEnter={() => setIsHoveringWaveform(true)}
            onMouseLeave={() => setIsHoveringWaveform(false)}
            className="h-7 flex items-center gap-0.5 cursor-pointer py-1 group select-none"
            title="Click or drag to seek"
          >
            {bars.map((heightPercent, index) => {
              const barRatio = (index + 1) / bars.length;
              const isPlayed = barRatio <= progressRatio;

              return (
                <div
                  key={index}
                  style={{ height: `${Math.max(15, Math.min(100, heightPercent))}%` }}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    isPlayed
                      ? isMine
                        ? 'bg-white shadow-xs'
                        : 'bg-blue-600 shadow-xs'
                      : isMine
                      ? 'bg-white/40 group-hover:bg-white/60'
                      : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-slate-400 dark:group-hover:bg-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Time & Speed Controls */}
          <div className="flex items-center justify-between text-[10px] font-mono opacity-85">
            <span>
              {isPlaying || currentTime > 0
                ? `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
                : `${formatTime(totalDuration)}`}
            </span>

            <div className="flex items-center gap-1.5">
              {/* Playback Speed Pill */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cycleSpeed();
                }}
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors cursor-pointer ${
                  isMine
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300'
                }`}
                title="Change playback speed"
              >
                {playbackSpeed}x
              </button>

              {/* Download Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadAudio(fileName);
                }}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  isMine
                    ? 'hover:bg-white/20 text-white/90'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
                title="Download voice note"
              >
                <Download size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
