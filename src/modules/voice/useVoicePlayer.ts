import { useState, useRef, useEffect, useCallback } from 'react';

export type PlaybackSpeed = 1 | 1.25 | 1.5 | 2;

export interface UseVoicePlayerOptions {
  audioUrl: string;
  duration?: number;
  onEnded?: () => void;
}

// Global active audio reference to ensure single playback across app
let globalActiveAudio: HTMLAudioElement | null = null;
let globalActiveStopCallback: (() => void) | null = null;

export function useVoicePlayer(options: UseVoicePlayerOptions) {
  const { audioUrl, duration: expectedDuration = 0, onEnded } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(expectedDuration);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isBuffering, setIsBuffering] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setIsBuffering(false);
  }, []);

  // Initialize HTMLAudioElement
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.playbackRate = playbackSpeed;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      } else if (expectedDuration > 0) {
        setDuration(expectedDuration);
      }
      setIsBuffering(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (globalActiveAudio === audio) {
        globalActiveAudio = null;
        globalActiveStopCallback = null;
      }
      if (onEnded) onEnded();
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = (e: Event) => {
      console.warn('Voice player audio playback error:', e);
      setIsPlaying(false);
      setIsBuffering(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('error', handleError);
      if (globalActiveAudio === audio) {
        globalActiveAudio = null;
        globalActiveStopCallback = null;
      }
      audioRef.current = null;
    };
  }, [audioUrl, expectedDuration, onEnded, playbackSpeed]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Pause any previously playing audio in the app
      if (globalActiveStopCallback && globalActiveStopCallback !== stopPlayback) {
        globalActiveStopCallback();
      }

      globalActiveAudio = audioRef.current;
      globalActiveStopCallback = stopPlayback;

      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().catch((err) => {
        console.warn('Playback play() promise rejected:', err);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  }, [isPlaying, playbackSpeed, stopPlayback]);

  const seek = useCallback((timeSeconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeSeconds;
      setCurrentTime(timeSeconds);
    }
  }, []);

  const seekPercentage = useCallback((percentage: number) => {
    const targetDuration = duration || expectedDuration || 1;
    const targetTime = (Math.max(0, Math.min(100, percentage)) / 100) * targetDuration;
    seek(targetTime);
  }, [duration, expectedDuration, seek]);

  const cycleSpeed = useCallback(() => {
    const speeds: PlaybackSpeed[] = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  }, [playbackSpeed]);

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
    stopPlayback,
  };
}
