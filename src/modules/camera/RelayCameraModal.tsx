import React, { useState, useRef } from 'react';
import { 
  X, 
  Zap, 
  ZapOff, 
  Clock, 
  Grid, 
  Moon, 
  RefreshCw, 
  Camera, 
  Video as VideoIcon, 
  Image as ImageIcon,
  Check,
  AlertTriangle,
  Upload,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRelayCamera } from './useRelayCamera';
import { CameraMode, CapturedMediaResult } from './types';
import { RelayMediaEditor } from '../media/RelayMediaEditor';

export interface RelayCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaCaptured: (media: CapturedMediaResult) => void;
}

export const RelayCameraModal: React.FC<RelayCameraModalProps> = ({
  isOpen,
  onClose,
  onMediaCaptured,
}) => {
  const [galleryItems, setGalleryItems] = useState<Array<{ id: string; url: string; type: 'image' | 'video' }>>([]);
  const {
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
    cameraError,
    availableZooms,
    toggleFacing,
    setZoom,
    handleTapToFocus,
    capturePhoto,
    captureBurst,
    startVideoRecording,
    stopVideoRecording,
  } = useRelayCamera();

  const [capturedMediaForEditor, setCapturedMediaForEditor] = useState<CapturedMediaResult | null>(null);
  const [isHD, setIsHD] = useState(true);
  const [activeMode, setActiveMode] = useState<'video' | 'photo' | 'video_note'>('photo');
  const galleryFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleShutterClick = async () => {
    if (activeMode === 'photo') {
      const result = await capturePhoto();
      if (result) {
        setCapturedMediaForEditor(result);
      }
    } else if (activeMode === 'video' || activeMode === 'video_note') {
      if (isRecordingVideo) {
        const videoResult = await stopVideoRecording();
        if (videoResult) {
          setCapturedMediaForEditor(videoResult);
        }
      } else {
        startVideoRecording();
      }
    }
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    (Array.from(files) as File[]).forEach((file: File, index: number) => {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const newItem = {
          id: `gallery_${Date.now()}_${index}`,
          type: isVideo ? ('video' as const) : ('image' as const),
          url
        };
        setGalleryItems((prev) => [newItem, ...prev.filter(p => p.url !== url)]);
        if (index === 0) {
          setCapturedMediaForEditor({
            id: newItem.id,
            type: newItem.type,
            dataUrl: url,
            timestamp: Date.now()
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSelectRecent = (url: string) => {
    setCapturedMediaForEditor({
      id: `recent_${Date.now()}`,
      type: 'image',
      dataUrl: url,
      timestamp: Date.now()
    });
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden select-none">
      <input 
        type="file" 
        ref={galleryFileInputRef} 
        onChange={handleGalleryUpload} 
        accept="image/*,video/*" 
        className="hidden" 
      />

      {/* If captured media exists, show Relay Media Editor */}
      {capturedMediaForEditor ? (
        <RelayMediaEditor
          media={capturedMediaForEditor}
          onClose={() => setCapturedMediaForEditor(null)}
          onSaveAndSend={(finalMedia) => {
            onMediaCaptured(finalMedia);
            setCapturedMediaForEditor(null);
            onClose();
          }}
        />
      ) : (
        <>
          {/* Top Control Bar: Close (X), Flash Toggle, HD Toggle */}
          <div className="w-full p-4 flex items-center justify-between text-white z-20 bg-gradient-to-b from-black/80 to-transparent">
            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer backdrop-blur-md"
              title="Close Camera"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              {/* Flash Button */}
              <button
                onClick={() =>
                  setSettings((p) => ({
                    ...p,
                    flash: p.flash === 'off' ? 'on' : p.flash === 'on' ? 'auto' : 'off',
                  }))
                }
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer backdrop-blur-md flex items-center gap-1 text-xs font-bold"
                title="Toggle Flash"
              >
                {settings.flash === 'off' ? (
                  <ZapOff size={18} />
                ) : (
                  <Zap size={18} className="text-amber-400 fill-amber-400" />
                )}
                {settings.flash !== 'off' && <span className="uppercase">{settings.flash}</span>}
              </button>

              {/* HD Toggle */}
              <button
                onClick={() => setIsHD(!isHD)}
                className={`px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-black transition-all cursor-pointer border ${
                  isHD 
                    ? 'bg-amber-400 text-black border-amber-300 shadow-md' 
                    : 'bg-white/10 text-white/80 border-white/20'
                }`}
                title="Toggle HD Quality"
              >
                HD
              </button>

              {/* Timer Button */}
              <button
                onClick={() =>
                  setSettings((p) => ({
                    ...p,
                    timerSeconds: p.timerSeconds === 0 ? 3 : p.timerSeconds === 3 ? 10 : 0,
                  }))
                }
                className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                  settings.timerSeconds > 0
                    ? 'bg-amber-500 text-black shadow-lg'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Clock size={18} />
                {settings.timerSeconds > 0 && <span>{settings.timerSeconds}s</span>}
              </button>
            </div>
          </div>

          {/* Full-Bleed Camera Viewfinder */}
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleTapToFocus(e.clientX - rect.left, e.clientY - rect.top);
            }}
            className="flex-1 relative w-full h-full flex items-center justify-center bg-black overflow-hidden"
          >
            {cameraError ? (
              <div className="p-6 text-center text-red-400 flex flex-col items-center gap-3">
                <AlertTriangle size={36} />
                <span className="font-bold text-sm">{cameraError}</span>
                <span className="text-xs text-slate-400 max-w-xs">
                  Please allow camera permissions or pick an image from recents below.
                </span>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-transform ${
                  settings.facing === 'user' ? 'scale-x-[-1]' : ''
                } ${activeMode === 'video_note' ? 'aspect-square rounded-full max-w-xs mx-auto border-4 border-amber-400' : ''}`}
              />
            )}

            {/* Tap to Focus Ring */}
            {focusPoint && (
              <motion.div
                initial={{ scale: 1.8, opacity: 1 }}
                animate={{ scale: 1, opacity: 0.8 }}
                exit={{ opacity: 0 }}
                style={{ top: focusPoint.y - 30, left: focusPoint.x - 30 }}
                className="absolute w-15 h-15 border-2 border-amber-400 rounded-full pointer-events-none z-30 shadow-lg"
              />
            )}

            {/* Countdown Overlay */}
            {countdownSeconds !== null && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-40">
                <span className="text-8xl font-black text-amber-400 animate-ping">
                  {countdownSeconds}
                </span>
              </div>
            )}

            {/* Recording Timer Badge */}
            {isRecordingVideo && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2 z-30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white" />
                <span>{videoRecordingSeconds}s</span>
              </div>
            )}

            {/* Zoom Selector Pills */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 z-30">
              {availableZooms.map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    settings.zoomLevel === z
                      ? 'bg-amber-400 text-black shadow-md scale-105'
                      : 'text-white hover:bg-white/20'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Dock Container: Horizontal Recents + Custom Controls */}
          <div className="w-full flex flex-col items-center gap-3 z-20 bg-gradient-to-t from-black via-black/90 to-transparent pb-6 pt-3">
            
            {/* Horizontal Gallery Thumbnail Carousel */}
            <div className="w-full px-4 overflow-x-auto no-scrollbar flex items-center gap-2.5">
              <button
                onClick={() => galleryFileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl bg-white/10 border border-dashed border-white/30 hover:border-amber-400 flex flex-col items-center justify-center text-white/80 shrink-0 cursor-pointer transition-all hover:bg-white/20"
                title="Select photos from your device"
              >
                <Upload size={18} />
                <span className="text-[9px] font-bold mt-1">Gallery</span>
              </button>

              {galleryItems.length === 0 ? (
                <button
                  onClick={() => galleryFileInputRef.current?.click()}
                  className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-xs font-semibold flex items-center gap-2 cursor-pointer hover:bg-white/10"
                >
                  <ImageIcon size={14} />
                  <span>Tap to choose photos from your device</span>
                </button>
              ) : (
                galleryItems.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => {
                      setCapturedMediaForEditor({
                        id: rec.id,
                        type: rec.type,
                        dataUrl: rec.url,
                        timestamp: Date.now()
                      });
                    }}
                    className="w-16 h-16 rounded-xl overflow-hidden border border-white/20 hover:border-amber-400 shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95 relative group"
                  >
                    {rec.type === 'video' ? (
                      <video src={rec.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={rec.url} alt="recent" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                  </button>
                ))
              )}
            </div>

            {/* Primary Shutter & Controls Row */}
            <div className="w-full max-w-xs flex items-center justify-between px-6 pt-2">
              {/* Gallery Picker Button */}
              <button
                onClick={() => galleryFileInputRef.current?.click()}
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-all cursor-pointer active:scale-95"
                title="Pick from Gallery"
              >
                <ImageIcon size={20} />
              </button>

              {/* Central Shutter Ring Button (White for Photo, Red for Video) */}
              <button
                onClick={handleShutterClick}
                className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-2xl ${
                  isRecordingVideo ? 'bg-red-600 animate-pulse' : 'bg-white/20'
                }`}
              >
                <div
                  className={`w-full h-full rounded-full transition-all ${
                    activeMode === 'video' || activeMode === 'video_note' || isRecordingVideo ? 'bg-red-600' : 'bg-white'
                  }`}
                />
              </button>

              {/* Camera Flip Button */}
              <button
                onClick={toggleFacing}
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-transform active:rotate-180 cursor-pointer"
                title="Flip Camera"
              >
                <RefreshCw size={20} />
              </button>
            </div>

            {/* Mode Switcher Text directly under shutter: Video | Photo | Video note */}
            <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-wider pt-1">
              <button
                onClick={() => { setActiveMode('video'); setMode('video'); }}
                className={`transition-all cursor-pointer ${
                  activeMode === 'video' ? 'text-amber-400 font-extrabold text-sm border-b-2 border-amber-400 pb-0.5' : 'text-slate-400 hover:text-white'
                }`}
              >
                Video
              </button>
              <button
                onClick={() => { setActiveMode('photo'); setMode('photo'); }}
                className={`transition-all cursor-pointer ${
                  activeMode === 'photo' ? 'text-amber-400 font-extrabold text-sm border-b-2 border-amber-400 pb-0.5' : 'text-slate-400 hover:text-white'
                }`}
              >
                Photo
              </button>
              <button
                onClick={() => { setActiveMode('video_note'); setMode('video'); }}
                className={`transition-all cursor-pointer ${
                  activeMode === 'video_note' ? 'text-amber-400 font-extrabold text-sm border-b-2 border-amber-400 pb-0.5' : 'text-slate-400 hover:text-white'
                }`}
              >
                Video note
              </button>
            </div>

          </div>
        </>
      )}
    </div>
  );
};
