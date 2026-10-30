import { useState, useRef, useEffect, useCallback } from 'react';

export type PlaybackSpeed = 1 | 1.25 | 1.5 | 2;

export interface UseVoicePlayerOptions {
  audioUrl: string;
  duration?: number;
  onEnded?: () => void;
}

// Global active audio reference to ensure single playback across the app
let globalActiveAudio: HTMLAudioElement | null = null;
let globalActiveStopCallback: (() => void) | null = null;

/**
 * Voice note playback.
 *
 * The Audio element is created ONCE per url and never torn down by unrelated
 * re-renders (the previous version rebuilt it whenever playbackSpeed or the
 * caller's callbacks changed identity — killing playback mid-listen). Speed
 * changes are applied to the live element; onEnded is read through a ref.
 */
export function useVoicePlayer(options: UseVoicePlayerOptions) {
  const { audioUrl, duration: expectedDuration = 0, onEnded } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(expectedDuration);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isBuffering, setIsBuffering] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speedRef = useRef<PlaybackSpeed>(1);
  const onEndedRef = useRef<(() => void) | undefined>(onEnded);
  onEndedRef.current = onEnded;

  const pausePlayback = useCallback(() => {
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
    setIsPlaying(false);
  }, []);

  // Create / swap the Audio element ONLY when the url actually changes.
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audio.playbackRate = speedRef.current;
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
      setIsBuffering(false);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (globalActiveAudio === audio) {
        globalActiveAudio = null;
        globalActiveStopCallback = null;
      }
      onEndedRef.current?.();
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      console.warn('Voice player audio error');
      setIsPlaying(false);
      setIsBuffering(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    return () => {
      try { audio.pause(); } catch { /* noop */ }
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      if (globalActiveAudio === audio) {
        globalActiveAudio = null;
        globalActiveStopCallback = null;
      }
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;

    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
      return;
    }

    // Single playback across the app — stop whatever else is playing.
    if (globalActiveStopCallback && globalActiveStopCallback !== pausePlayback) {
      globalActiveStopCallback();
    }
    globalActiveAudio = a;
    globalActiveStopCallback = pausePlayback;

    a.playbackRate = speedRef.current;
    a.play().then(() => setIsPlaying(true)).catch((err) => {
      console.warn('Playback play() rejected:', err);
      setIsPlaying(false);
    });
  }, [isPlaying, pausePlayback]);

  const seek = useCallback((timeSeconds: number) => {
    const a = audioRef.current;
    if (a && isFinite(timeSeconds)) {
      a.currentTime = Math.max(0, timeSeconds);
      setCurrentTime(a.currentTime);
    }
  }, []);

  const seekPercentage = useCallback((percentage: number) => {
    const targetDuration = duration || expectedDuration || 1;
    seek((Math.max(0, Math.min(100, percentage)) / 100) * targetDuration);
  }, [duration, expectedDuration, seek]);

  const cycleSpeed = useCallback(() => {
    const speeds: PlaybackSpeed[] = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speedRef.current) + 1) % speeds.length];
    speedRef.current = next;
    setPlaybackSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const downloadAudio = useCallback((fileName = 'VoiceNote.webm') => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [audioUrl]);

  return {
    isPlaying,
    currentTime,
    duration: duration || expectedDuration,
    playbackSpeed,
    isBuffering,
    togglePlay,
    seek,
    seekPercentage,
    cycleSpeed,
    downloadAudio,
    stopPlayback: pausePlayback,
  };
}
