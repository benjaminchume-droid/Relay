import React, { useState } from 'react';
import { Search, Star, Clock, Plus, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sticker, StickerPack } from './types';
import { PRESET_STICKER_PACKS } from './stickerData';
import { StickerCreatorModal } from './StickerCreatorModal';

export interface StickerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: Sticker) => void;
}

export const StickerPickerModal: React.FC<StickerPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectSticker,
}) => {
  const [activeTab, setActiveTab] = useState<string>('preset');
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteStickerIds, setFavoriteStickerIds] = useState<Set<string>>(new Set());
  const [customStickers, setCustomStickers] = useState<Sticker[]>([]);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  if (!isOpen) return null;

  const allPresetStickers = PRESET_STICKER_PACKS.flatMap((p) => p.stickers);
  const allStickers = [...allPresetStickers, ...customStickers];

  const filteredStickers = allStickers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.keywords.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleFavorite = (stickerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteStickerIds((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          className="w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/40 dark:border-white/10 rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl text-slate-800 dark:text-white space-y-3 max-h-[80vh] flex flex-col overflow-hidden"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2 shrink-0">
            <span className="font-extrabold text-sm flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              Sticker Store & Picker
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCreatorOpen(true)}
                className="px-2.5 py-1 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center gap-1 shadow-md hover:bg-blue-500 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Custom</span>
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search stickers by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-medium focus:outline-none"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0 text-xs font-bold">
            <button
              onClick={() => setActiveTab('preset')}
              className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'preset' ? 'bg-white dark:bg-slate-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              Preset Packs
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`flex-1 py-1 rounded-lg transition-all cursor-pointer ${
                activeTab === 'custom' ? 'bg-white dark:bg-slate-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              My Stickers ({customStickers.length})
            </button>
          </div>

          {/* Sticker Grid */}
          <div className="flex-1 overflow-y-auto p-1">
            {searchQuery ? (
              <div className="grid grid-cols-4 gap-3">
                {filteredStickers.map((sticker) => (
                  <button
                    key={sticker.id}
                    onClick={() => {
                      onSelectSticker(sticker);
                      onClose();
                    }}
                    className="group relative p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center hover:scale-110 cursor-pointer"
                  >
                    <img src={sticker.url} alt={sticker.name} className="w-16 h-16 object-contain" />
                  </button>
                ))}
              </div>
            ) : activeTab === 'custom' ? (
              customStickers.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 font-medium">
                  No custom stickers yet. Click "+ Create Custom" to build your first sticker!
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {customStickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      onClick={() => {
                        onSelectSticker(sticker);
                        onClose();
                      }}
                      className="group relative p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center hover:scale-110 cursor-pointer"
                    >
                      <img src={sticker.url} alt={sticker.name} className="w-16 h-16 object-contain drop-shadow-md" />
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                {PRESET_STICKER_PACKS.map((pack) => (
                  <div key={pack.id} className="space-y-2">
                    <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      {pack.name}
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      {pack.stickers.map((sticker) => (
                        <button
                          key={sticker.id}
                          onClick={() => {
                            onSelectSticker(sticker);
                            onClose();
                          }}
                          className="group relative p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center hover:scale-110 cursor-pointer"
                        >
                          <img src={sticker.url} alt={sticker.name} className="w-16 h-16 object-contain" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <StickerCreatorModal
        isOpen={isCreatorOpen}
        onClose={() => setIsCreatorOpen(false)}
        onStickerCreated={(newSticker) => {
          setCustomStickers((prev) => [newSticker, ...prev]);
        }}
      />
    </>
  );
};
