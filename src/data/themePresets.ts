/** Simplified appearance packs — Theme + Accent only (no Forest/Sunrise stacks). */
export const THEME_PRESETS = [
  {
    id: "system",
    name: "System",
    accentColor: "liquid-azure" as const,
    themeMode: "system" as const,
    chatWallpaper: "glass-gradient",
  },
  {
    id: "light",
    name: "Light",
    accentColor: "liquid-azure" as const,
    themeMode: "light" as const,
    chatWallpaper: "glass-gradient",
  },
  {
    id: "dark",
    name: "Dark",
    accentColor: "liquid-azure" as const,
    themeMode: "dark" as const,
    chatWallpaper: "dark-aurora",
  },
  {
    id: "pure-black",
    name: "Pure Black",
    accentColor: "midnight" as const,
    themeMode: "pure-black" as const,
    chatWallpaper: "pure-slate",
  },
] as const;
