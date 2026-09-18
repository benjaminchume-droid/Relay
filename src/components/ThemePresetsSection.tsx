/**
 * Appearance packs: Theme mode shortcuts only.
 * Accent lives in the Accent grid below (not stacked as look packs).
 */
import React from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { GlassCard } from "./GlassUI";
import { THEME_PRESETS } from "../data/themePresets";
import { useThemeStore } from "../store/themeStore";

const ICONS: Record<string, React.ReactNode> = {
  system: <Monitor size={16} />,
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
  "pure-black": <Moon size={16} />,
};

export const ThemePresetsSection: React.FC = () => {
  const { customization, updateCustomization } = useThemeStore();

  return (
    <GlassCard className="p-4 space-y-3">
      <span className="text-xs font-bold text-slate-800 dark:text-white block">Theme</span>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Light is light. Dark is dark. System follows your device.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {THEME_PRESETS.map((pack) => {
          const isSel = customization.themeMode === pack.themeMode;
          return (
            <button
              key={pack.id}
              type="button"
              onClick={() =>
                updateCustomization({
                  themeMode: pack.themeMode as any,
                  chatWallpaper: pack.chatWallpaper as any,
                })
              }
              className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                isSel
                  ? "border-transparent text-white shadow-md"
                  : "bg-white/70 dark:bg-slate-800/50 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-800"
              }`}
              style={
                isSel
                  ? { backgroundColor: "var(--primary-accent, #2563EB)" }
                  : undefined
              }
            >
              <span className={isSel ? "text-white" : "text-slate-500"}>{ICONS[pack.id]}</span>
              <span className="text-xs font-semibold flex-1">{pack.name}</span>
              {isSel && <Check size={14} className="text-white shrink-0" />}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
};
