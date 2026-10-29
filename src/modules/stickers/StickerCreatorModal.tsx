import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Check, Wand2, Type, Palette } from 'lucide-react';
import { motion } from 'motion/react';
import { Sticker } from './types';

export interface StickerCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStickerCreated: (sticker: Sticker) => void;
}

export const StickerCreatorModal: React.FC<StickerCreatorModalProps> = ({
  isOpen,
  onClose,
  onStickerCreated,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [stickerName, setStickerName] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const [borderGlow, setBorderGlow] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setImageSrc(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSticker = () => {
    if (!imageSrc) return;
    setIsProcessing(true);

    setTimeout(() => {
      const newSticker: Sticker = {
        id: `custom_sticker_${Date.now()}`,
        packId: 'custom_user_pack',
        name: stickerName.trim() || 'Custom Sticker',
        url: imageSrc,
        keywords: ['custom', stickerName.toLowerCase()]
      };

      onStickerCreated(newSticker);
      setIsProcessing(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-slate-900 border border-white/20 rounded-3xl p-5 text-white shadow-2xl space-y-4 select-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="font-extrabold text-sm flex items-center gap-2">
            <Wand2 size={16} className="text-blue-400" />
            Custom Sticker Creator Studio
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Upload Stage */}
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

        <div
          onClick={() => fileInputRef.current?.click()}
          className={`relative h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all overflow-hidden ${
            imageSrc ? 'border-blue-500 bg-slate-800' : 'border-white/20 hover:bg-white/5'
          }`}
        >
          {imageSrc ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={imageSrc}
                alt="sticker preview"
                className={`max-h-full max-w-full object-contain ${
                  borderGlow ? 'drop-shadow-[0_0_12px_rgba(59,130,246,0.8)]' : ''
                }`}
              />
              {overlayText && (
                <div className="absolute bottom-2 bg-black/70 px-3 py-1 rounded-full text-xs font-black text-white">
                  {overlayText}
                </div>
              )}
            </div>
          ) : (
            <>
              <Upload size={32} className="text-blue-400" />
              <span className="text-xs font-bold text-slate-300">Upload Photo or Graphic</span>
              <span className="text-[10px] text-slate-400">Auto background removal simulation</span>
            </>
          )}
        </div>

        {/* Custom Controls */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Sticker Name</label>
            <input
              type="text"
              placeholder="E.g., Funny Cat Laugh"
              value={stickerName}
              onChange={(e) => setStickerName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl p-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Overlay Caption Text</label>
            <input
              type="text"
              placeholder="Optional text overlay..."
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl p-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
            <span className="font-semibold text-slate-300">White Outline & Neon Glow</span>
            <button
              type="button"
              onClick={() => setBorderGlow(!borderGlow)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                borderGlow ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                  borderGlow ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          disabled={!imageSrc || isProcessing}
          onClick={handleSaveSticker}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <span>Processing Sticker Outline...</span>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Save to My Custom Pack</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};
