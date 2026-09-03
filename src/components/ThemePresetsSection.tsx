/**
 * Phase 5: one-tap look packs from THEME_PRESETS (Telegram-inspired variety).
 */
import React from "react";
import { Sparkles, Check } from "lucide-react";
import { GlassCard } from "./GlassUI";
import { THEME_PRESETS } from "../data/themePresets";
import { useThemeStore, ACCENT_COLOR_CONFIG } from "../store/themeStore";

export const ThemePresetsSection: React.FC = () => {
  const { customization, updateCustomization, setAccentColor } = useThemeStore();

  const activeId =
    THEME_PRESETS.find(
      (p) =>
        p.accentColor === customization.accentColor &&
        p.themeMode === customization.themeMode
    )?.id || null;

  return (
    <GlassCard className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-slate-600 dark:text-slate-300" />
        <span className="text-xs font-bold text-slate-800 dark:text-white block">
          Quick Look Packs
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Apply a full Relay look in one tap — accent, theme mode, and chat wallpaper.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {THEME_PRESETS.map((pack) => {
          const conf = ACCENT_COLOR_CONFIG[pack.accentColor];
          const isSel = activeId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => {
                setAccentColor(pack.accentColor);
                updateCustomization({
                  themeMode: pack.themeMode as any,
                  chatWallpaper: pack.chatWallpaper as any,
                  accentColor: pack.accentColor,
                });
              }}
              className={`relative p-3.5 rounded-2xl border text-left transition-all cursor-pointer overflow-hidden ${
                isSel
                  ? "border-transparent shadow-md scale-[1.02]"
                  : "bg-white/60 dark:bg-slate-800/50 border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-slate-800"
              }`}
              style={
                isSel
                  ? {
                      background: `linear-gradient(135deg, ${conf?.primary || "#3B82F6"} 0%, ${conf?.hover || "#2563EB"} 100%)`,
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-xs font-bold ${
                    isSel ? "text-white" : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {pack.name}
                </span>
                {isSel && <Check size={14} className="text-white shrink-0" />}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border border-white/40 shadow-sm"
                  style={{ backgroundColor: conf?.primary || "#3B82F6" }}
                />
                <span
                  className={`text-[10px] font-medium capitalize ${
                    isSel ? "text-white/85" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {pack.themeMode} · {pack.accentColor.replace("-", " ")}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
};
