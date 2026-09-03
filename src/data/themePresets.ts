/** Phase 4: ready-made look packs (Telegram-inspired variety, Relay tokens). */
export const THEME_PRESETS = [
  {
    id: "relay-glass",
    name: "Relay Glass",
    accentColor: "liquid-azure" as const,
    themeMode: "system" as const,
    chatWallpaper: "glass-gradient",
  },
  {
    id: "midnight",
    name: "Midnight",
    accentColor: "neon-violet" as const,
    themeMode: "dark" as const,
    chatWallpaper: "glass-gradient",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    accentColor: "rose-gold" as const,
    themeMode: "light" as const,
    chatWallpaper: "glass-gradient",
  },
  {
    id: "forest",
    name: "Forest",
    accentColor: "emerald-frost" as const,
    themeMode: "system" as const,
    chatWallpaper: "glass-gradient",
  },
] as const;
