import { useState, useRef, useCallback, useEffect } from 'react';
import { VoiceRecorderStatus, VoiceNoteData } from './types';

export interface UseVoiceRecorderOptions {
  onRecordingComplete?: (voiceNote: VoiceNoteData) => void;
  maxDurationSeconds?: number;
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { onRecordingComplete, maxDurationSeconds = 300 } = options;

  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [previewNote, setPreviewNote] = useState<VoiceNoteData | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalPausedDurationRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number>(0);
  const recordedWaveformSamplesRef = useRef<number[]>([]);

  // Cleanup helper
  const stopAudioContextAndStream = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  // Update real-time waveform bars
  const updateWaveform = useCallback(() => {
    if (!analyserRef.current || status === 'paused' || status === 'idle') return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average amplitude
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const avg = sum / bufferLength;
    // Normalize to 10 - 100
    const normalized = Math.min(100, Math.max(12, Math.round((avg / 128) * 100)));

    recordedWaveformSamplesRef.current.push(normalized);

    setLiveWaveform((prev) => {
      const next = [...prev, normalized];
      return next.slice(-35); // Keep last 35 bars for UI display
    });

    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  }, [status]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setErrorMessage(null);
      setPermissionDenied(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not supported on this device/browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // Handle stream interruption (e.g. phone calls, unplugged mic)
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (status === 'recording' || status === 'paused') {
            stopRecording();
          }
        };
      });

      // AudioContext for live frequency analyser
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      // Pick supported mimeType
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordedWaveformSamplesRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100); // collect chunks every 100ms
      startTimeRef.current = Date.now();
      totalPausedDurationRef.current = 0;
      setRecordingSeconds(0);
      setLiveWaveform([]);
      setIsLocked(false);
      setStatus('recording');

      // Timer
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000
        );
        setRecordingSeconds(elapsed);

        if (elapsed >= maxDurationSeconds) {
          stopRecording();
        }
      }, 200);

      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    } catch (err: any) {
      console.error('Error starting voice recording:', err);
      stopAudioContextAndStream();
      setStatus('error');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in browser settings.');
      } else {
        setErrorMessage(err.message || 'Failed to start microphone recording.');
      }
    }
  }, [maxDurationSeconds, stopAudioContextAndStream, updateWaveform]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      pauseStartTimeRef.current = Date.now();
      setStatus('paused');

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      totalPausedDurationRef.current += Date.now() - pauseStartTimeRef.current;
      mediaRecorderRef.current.resume();
      setStatus('recording');

      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000
        );
        setRecordingSeconds(elapsed);
        if (elapsed >= maxDurationSeconds) {
          stopRecording();
        }
      }, 200);

      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    }
  }, [maxDurationSeconds, updateWaveform]);

  // Lock recording
  const lockRecording = useCallback(() => {
    setIsLocked(true);
    if (status === 'recording') {
      setStatus('locked');
    }
  }, [status]);

  // Stop recording & prepare preview / data
  const stopRecording = useCallback((): Promise<VoiceNoteData | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        stopAudioContextAndStream();
        setStatus('idle');
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const finalDuration = Math.max(
          1,
          Math.round((Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000)
        );

        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Downsample recorded waveform samples to exactly 40 bars
        const samples = recordedWaveformSamplesRef.current;
        let finalWaveform: number[] = [];
        if (samples.length > 0) {
          const step = Math.max(1, Math.floor(samples.length / 40));
          for (let i = 0; i < samples.length; i += step) {
            finalWaveform.push(samples[i]);
            if (finalWaveform.length >= 40) break;
          }
        }
        if (finalWaveform.length < 20) {
          // Generate realistic baseline waveform if samples were sparse
          finalWaveform = Array.from({ length: 35 }, () => Math.floor(Math.random() * 60) + 20);
        }

        const voiceNote: VoiceNoteData = {
          id: `vn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          blob: audioBlob,
          audioUrl,
          duration: finalDuration,
          waveformData: finalWaveform,
          fileSize: audioBlob.size,
          mimeType,
          fileName: `VoiceNote_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`,
          createdAt: new Date().toISOString(),
        };

        stopAudioContextAndStream();
        setPreviewNote(voiceNote);
        setStatus('previewing');

        if (onRecordingComplete) {
          onRecordingComplete(voiceNote);
        }

        resolve(voiceNote);
      };

      recorder.stop();
    });
  }, [onRecordingComplete, stopAudioContextAndStream]);

  // Cancel / discard recording
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    if (previewNote?.audioUrl && previewNote.audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewNote.audioUrl);
    }

    stopAudioContextAndStream();
    setPreviewNote(null);
    setRecordingSeconds(0);
    setLiveWaveform([]);
    setIsLocked(false);
    setStatus('idle');
  }, [previewNote, stopAudioContextAndStream]);

  // Clear preview
  const clearPreview = useCallback(() => {
    if (previewNote?.audioUrl && previewNote.audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewNote.audioUrl);
    }
    setPreviewNote(null);
    setStatus('idle');
    setRecordingSeconds(0);
    setLiveWaveform([]);
  }, [previewNote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioContextAndStream();
      if (previewNote?.audioUrl && previewNote.audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewNote.audioUrl);
      }
    };
  }, []);

  return {
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
  };
}
