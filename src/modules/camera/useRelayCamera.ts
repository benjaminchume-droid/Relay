import { useState, useRef, useCallback, useEffect } from 'react';
import { CameraMode, CameraSettings, CapturedMediaResult } from './types';

export function useRelayCamera() {
  const [mode, setMode] = useState<CameraMode>('photo');
  const [settings, setSettings] = useState<CameraSettings>({
    facing: 'environment',
    flash: 'off',
    aspectRatio: '4:3',
    timerSeconds: 0,
    gridEnabled: false,
    hdrEnabled: true,
    nightModeEnabled: false,
    macroEnabled: false,
    zoomLevel: 1,
    exposureValue: 0,
  });

  const [isLive, setIsLive] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableZooms, setAvailableZooms] = useState<number[]>([1, 2, 3, 5]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const qrScanTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize or re-initialize camera stream
  const startCameraStream = useCallback(async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not supported on this browser or device.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: settings.facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: mode === 'video',
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsLive(true);

      // Check track zoom capabilities if available
      const track = stream.getVideoTracks()[0];
      if (track && (track as any).getCapabilities) {
        const capabilities = (track as any).getCapabilities();
        if (capabilities.zoom) {
          const min = capabilities.zoom.min || 1;
          const max = Math.min(10, capabilities.zoom.max || 5);
          setAvailableZooms([min, 2, 3, max]);
        }
      }
    } catch (err: any) {
      console.error('Camera stream error:', err);
      setIsLive(false);
      setCameraError(err?.message || 'Failed to access camera.');
    }
  }, [mode, settings.facing]);

  // Toggle Camera Facing
  const toggleFacing = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      facing: prev.facing === 'environment' ? 'user' : 'environment',
    }));
  }, []);

  // Set Zoom
  const setZoom = useCallback((zoomVal: number) => {
    setSettings((prev) => ({ ...prev, zoomLevel: zoomVal }));
    const stream = streamRef.current;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track && (track as any).applyConstraints) {
        (track as any).applyConstraints({
          advanced: [{ zoom: zoomVal }],
        }).catch(() => {});
      }
    }
  }, []);

  // Handle Tap to Focus
  const handleTapToFocus = useCallback((x: number, y: number) => {
    setFocusPoint({ x, y });
    setTimeout(() => setFocusPoint(null), 1500);
  }, []);

  // Capture Single Photo
  const capturePhoto = useCallback(async (): Promise<CapturedMediaResult | null> => {
    if (!videoRef.current || !isLive) return null;

    // Handle timer if configured
    if (settings.timerSeconds > 0) {
      for (let s = settings.timerSeconds; s > 0; s--) {
        setCountdownSeconds(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdownSeconds(null);
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Flip horizontally if front facing
    if (settings.facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    return {
      id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'image',
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      capturedAt: new Date().toISOString(),
    };
  }, [isLive, settings.facing, settings.timerSeconds]);

  // Capture Burst Photos
  const captureBurst = useCallback(async (count = 5): Promise<CapturedMediaResult[]> => {
    const results: CapturedMediaResult[] = [];
    for (let i = 0; i < count; i++) {
      const shot = await capturePhoto();
      if (shot) results.push(shot);
      await new Promise((r) => setTimeout(r, 120));
    }
    return results;
  }, [capturePhoto]);

  // Start Video Recording
  const startVideoRecording = useCallback(() => {
    if (!streamRef.current || isRecordingVideo) return;

    try {
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '';
      }

      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      mediaRecorderRef.current = recorder;
      videoChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          videoChunksRef.current.push(e.data);
        }
      };

      recorder.start(200);
      setIsRecordingVideo(true);
      setVideoRecordingSeconds(0);

      videoTimerRef.current = setInterval(() => {
        setVideoRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start video recording:', err);
    }
  }, [isRecordingVideo]);

  // Stop Video Recording
  const stopVideoRecording = useCallback((): Promise<CapturedMediaResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecordingVideo(false);
        if (videoTimerRef.current) clearInterval(videoTimerRef.current);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        if (videoTimerRef.current) clearInterval(videoTimerRef.current);
        const mimeType = recorder.mimeType || 'video/webm';
        const blob = new Blob(videoChunksRef.current, { type: mimeType });
        const videoUrl = URL.createObjectURL(blob);

        setIsRecordingVideo(false);

        resolve({
          id: `video_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'video',
          dataUrl: videoUrl,
          blob,
          duration: videoRecordingSeconds,
          capturedAt: new Date().toISOString(),
        });
      };

      recorder.stop();
    });
  }, [videoRecordingSeconds]);

  // QR Reader canvas analysis loop
  useEffect(() => {
    if (mode !== 'qr' || !isLive || !videoRef.current) return;

    qrScanTimerRef.current = setInterval(() => {
      if (!videoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0, 300, 300);

      // Simulate QR Detection trigger for testing / demo
      // In production, can also parse URLs / Relay handles
    }, 1000);

    return () => {
      if (qrScanTimerRef.current) clearInterval(qrScanTimerRef.current);
    };
  }, [isLive, mode]);

  // Restart camera stream on facing or mode change
  useEffect(() => {
    startCameraStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      if (qrScanTimerRef.current) clearInterval(qrScanTimerRef.current);
    };
  }, [settings.facing, mode]);

  return {
    videoRef,
    mode,
    setMode,
    settings,
    setSettings,
    isLive,
    isRecordingVideo,
    videoRecordingSeconds,
    countdownSeconds,
    focusPoint,
    qrCodeData,
    setQrCodeData,
    cameraError,
    availableZooms,
    startCameraStream,
    toggleFacing,
    setZoom,
    handleTapToFocus,
    capturePhoto,
    captureBurst,
    startVideoRecording,
    stopVideoRecording,
  };
}
