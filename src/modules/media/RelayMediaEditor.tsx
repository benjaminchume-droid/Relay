import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Check, 
  RotateCw, 
  Crop, 
  Edit3, 
  Type, 
  Smile, 
  Sparkles, 
  Sliders, 
  Mic, 
  Download, 
  Send, 
  MapPin, 
  AtSign, 
  EyeOff, 
  Layers,
  Square,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CapturedMediaResult } from '../camera/types';

export interface RelayMediaEditorProps {
  media: CapturedMediaResult;
  onClose: () => void;
  onSaveAndSend: (finalMedia: CapturedMediaResult) => void;
}

type TabType = 'adjust' | 'filter' | 'draw' | 'text' | 'stickers' | 'crop' | 'blur';

interface DrawLine {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  bg: string;
}

interface StickerOverlay {
  id: string;
  emojiOrUrl: string;
  x: number;
  y: number;
  scale: number;
}

export const RelayMediaEditor: React.FC<RelayMediaEditorProps> = ({
  media,
  onClose,
  onSaveAndSend,
}) => {
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [cropAspect, setCropAspect] = useState<'free' | '1:1' | '4:3' | '16:9'>('free');

  // Adjustments State
  const [adjustments, setAdjustments] = useState({
    brightness: 100, // 0-200
    contrast: 100, // 0-200
    saturation: 100, // 0-200
    warmth: 0, // -50 to 50
    blur: 0, // 0 to 10
  });

  // Selected Filter
  const [selectedFilter, setSelectedFilter] = useState<string>('normal');

  // Drawing State
  const [brushColor, setBrushColor] = useState('#2563eb');
  const [brushWidth, setBrushWidth] = useState(4);
  const [drawLines, setDrawLines] = useState<DrawLine[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentLineRef = useRef<{ x: number; y: number }[]>([]);

  // Text Overlay State
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [newText, setNewText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBg, setTextBg] = useState('#00000080');

  // Stickers State
  const [stickers, setStickers] = useState<StickerOverlay[]>([]);

  // Voice Caption State
  const [isRecordingVoiceCaption, setIsRecordingVoiceCaption] = useState(false);
  const [voiceCaptionUrl, setVoiceCaptionUrl] = useState<string | null>(null);

  // Compression Quality
  const [qualityMode, setQualityMode] = useState<'hd' | 'standard' | 'low'>('hd');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render composite image on canvas
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.save();

      // Rotation & Center
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      // Filters & Adjustments
      let filterString = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
      
      if (selectedFilter === 'noir') filterString += ' grayscale(100%)';
      else if (selectedFilter === 'vivid') filterString += ' saturate(160%) contrast(110%)';
      else if (selectedFilter === 'vintage') filterString += ' sepia(50%) hue-rotate(-10deg)';
      else if (selectedFilter === 'cyber') filterString += ' hue-rotate(90deg) contrast(120%)';
      else if (selectedFilter === 'cool') filterString += ' hue-rotate(180deg)';

      ctx.filter = filterString;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';

      // Draw Lines
      drawLines.forEach((line) => {
        if (line.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width * (canvas.width / 600);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(line.points[0].x, line.points[0].y);
        line.points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      });

      // Render Text Overlays
      textOverlays.forEach((t) => {
        ctx.font = `bold ${24 * (canvas.width / 600)}px sans-serif`;
        const metrics = ctx.measureText(t.text);
        const padding = 10 * (canvas.width / 600);

        ctx.fillStyle = t.bg;
        ctx.fillRect(
          t.x - padding,
          t.y - 24 * (canvas.width / 600),
          metrics.width + padding * 2,
          32 * (canvas.width / 600)
        );

        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      });

      // Render Stickers
      stickers.forEach((s) => {
        ctx.font = `${40 * s.scale * (canvas.width / 600)}px sans-serif`;
        ctx.fillText(s.emojiOrUrl, s.x, s.y);
      });

      ctx.restore();
    };
    img.src = media.dataUrl;
  };

  useEffect(() => {
    renderCanvas();
  }, [media, rotation, adjustments, selectedFilter, drawLines, textOverlays, stickers]);

  // Handle Freehand Mouse / Touch Draw
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'draw' && activeTab !== 'blur') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    setIsDrawing(true);
    currentLineRef.current = [{ x, y }];
  };

  const drawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || (activeTab !== 'draw' && activeTab !== 'blur')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    currentLineRef.current.push({ x, y });

    // Live preview line
    const ctx = canvas.getContext('2d');
    if (ctx && currentLineRef.current.length > 1) {
      const pts = currentLineRef.current;
      ctx.beginPath();
      ctx.strokeStyle = activeTab === 'blur' ? '#000000a0' : brushColor;
      ctx.lineWidth = (activeTab === 'blur' ? 24 : brushWidth) * (canvas.width / 600);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentLineRef.current.length > 1) {
      setDrawLines((prev) => [
        ...prev,
        {
          id: `line_${Date.now()}`,
          points: [...currentLineRef.current],
          color: activeTab === 'blur' ? '#000000c0' : brushColor,
          width: activeTab === 'blur' ? 24 : brushWidth,
        },
      ]);
    }
    currentLineRef.current = [];
  };

  // Add Text Overlay
  const handleAddText = () => {
    if (!newText.trim()) return;
    const canvas = canvasRef.current;
    setTextOverlays((prev) => [
      ...prev,
      {
        id: `txt_${Date.now()}`,
        text: newText,
        x: canvas ? canvas.width / 4 : 50,
        y: canvas ? canvas.height / 2 : 100,
        color: textColor,
        bg: textBg,
      },
    ]);
    setNewText('');
    setActiveTab(null);
  };

  // Export Final Edited Image
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let quality = 0.92;
    if (qualityMode === 'low') quality = 0.5;

    const exportedDataUrl = canvas.toDataURL('image/jpeg', quality);

    onSaveAndSend({
      ...media,
      dataUrl: exportedDataUrl,
      filterApplied: selectedFilter,
      voiceCaptionUrl: voiceCaptionUrl || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-50 flex flex-col items-center justify-between p-3 select-none">
      {/* Top Action Bar */}
      <div className="w-full max-w-2xl flex items-center justify-between text-white py-2 px-1 z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-2">
          {/* Quality Mode Picker */}
          <select
            value={qualityMode}
            onChange={(e) => setQualityMode(e.target.value as any)}
            className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-white focus:outline-none cursor-pointer"
          >
            <option value="hd" className="bg-slate-900 text-white">HD Quality</option>
            <option value="standard" className="bg-slate-900 text-white">Standard</option>
            <option value="low" className="bg-slate-900 text-white">Low Data</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg cursor-pointer transition-transform hover:scale-105 active:scale-95"
          >
            <Send size={15} />
            <span>Send</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Canvas Preview Area */}
      <div className="flex-1 w-full max-w-2xl relative flex items-center justify-center my-2 overflow-hidden rounded-3xl bg-black/40 border border-white/10 shadow-2xl">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={drawMove}
          onMouseUp={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={drawMove}
          onTouchEnd={stopDrawing}
          className="max-h-full max-w-full object-contain rounded-2xl cursor-crosshair touch-none"
        />
      </div>

      {/* Editing Toolbar Tabs */}
      <div className="w-full max-w-2xl flex flex-col gap-2 z-10">
        {/* Active Tool Subpanel */}
        <AnimatePresence>
          {activeTab === 'adjust' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-white space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span>Brightness</span>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={adjustments.brightness}
                  onChange={(e) => setAdjustments((p) => ({ ...p, brightness: Number(e.target.value) }))}
                  className="w-32 accent-blue-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Contrast</span>
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={adjustments.contrast}
                  onChange={(e) => setAdjustments((p) => ({ ...p, contrast: Number(e.target.value) }))}
                  className="w-32 accent-blue-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Saturation</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={adjustments.saturation}
                  onChange={(e) => setAdjustments((p) => ({ ...p, saturation: Number(e.target.value) }))}
                  className="w-32 accent-blue-500"
                />
              </div>
            </motion.div>
          )}

          {activeTab === 'filter' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-white flex items-center gap-3 overflow-x-auto"
            >
              {['normal', 'vivid', 'noir', 'vintage', 'cool', 'cyber'].map((f) => (
                <button
                  key={f}
                  onClick={() => setSelectedFilter(f)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold capitalize cursor-pointer shrink-0 border transition-all ${
                    selectedFilter === f
                      ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                      : 'bg-white/10 border-white/20 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {f}
                </button>
              ))}
            </motion.div>
          )}

          {activeTab === 'draw' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-white flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                {['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#ffffff', '#000000'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setBrushColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 ${
                      brushColor === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setDrawLines([])}
                className="text-xs text-red-400 hover:underline cursor-pointer font-semibold"
              >
                Clear Drawing
              </button>
            </motion.div>
          )}

          {activeTab === 'text' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-white flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Type text overlay..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none"
              />
              <button
                onClick={handleAddText}
                className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white cursor-pointer"
              >
                Add
              </button>
            </motion.div>
          )}

          {activeTab === 'stickers' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-3 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-white flex items-center gap-3 overflow-x-auto text-xl"
            >
              {['🔥', '❤️', '😂', '📍', '🎉', '💯', '✨', '⚡️', '😎', '👍'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    const canvas = canvasRef.current;
                    setStickers((prev) => [
                      ...prev,
                      {
                        id: `stk_${Date.now()}`,
                        emojiOrUrl: emoji,
                        x: canvas ? canvas.width / 2 : 100,
                        y: canvas ? canvas.height / 2 : 100,
                        scale: 1,
                      },
                    ]);
                    setActiveTab(null);
                  }}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 hover:scale-125 transition-all cursor-pointer shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Primary Tab Bar */}
        <div className="p-2 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/10 text-white flex items-center justify-around">
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px]"
            title="Rotate"
          >
            <RotateCw size={18} />
            <span>Rotate</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'filter' ? null : 'filter')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'filter' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Sparkles size={18} />
            <span>Filters</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'adjust' ? null : 'adjust')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'adjust' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Sliders size={18} />
            <span>Adjust</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'draw' ? null : 'draw')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'draw' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Edit3 size={18} />
            <span>Draw</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'blur' ? null : 'blur')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'blur' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
            title="Redact sensitive content"
          >
            <EyeOff size={18} />
            <span>Redact</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'text' ? null : 'text')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'text' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Type size={18} />
            <span>Text</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'stickers' ? null : 'stickers')}
            className={`p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer flex flex-col items-center gap-1 text-[10px] ${
              activeTab === 'stickers' ? 'text-blue-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Smile size={18} />
            <span>Stickers</span>
          </button>
        </div>
      </div>
    </div>
  );
};
