/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { 
  AppearanceCustomization, 
  AccentColor, 
  DesignLanguage, 
  BubbleStyle, 
  WallpaperStyle, 
  UIDensity, 
  AppIconVariant 
} from '../types';

export const ACCENT_COLOR_CONFIG: Record<AccentColor, { name: string; primary: string; hover: string; tint: string; ring: string }> = {
  'liquid-azure': {
    name: 'Liquid Azure',
    primary: '#3B82F6',
    hover: '#2563EB',
    tint: '#EFF6FF',
    ring: 'rgba(59, 130, 246, 0.35)'
  },
  'emerald-frost': {
    name: 'Emerald Frost',
    primary: '#10B981',
    hover: '#059669',
    tint: '#ECFDF5',
    ring: 'rgba(16, 185, 129, 0.35)'
  },
  'neon-violet': {
    name: 'Neon Violet',
    primary: '#8B5CF6',
    hover: '#7C3AED',
    tint: '#F5F3FF',
    ring: 'rgba(139, 92, 246, 0.35)'
  },
  'rose-gold': {
    name: 'Rose Gold',
    primary: '#F43F5E',
    hover: '#E11D48',
    tint: '#FFF1F2',
    ring: 'rgba(244, 63, 94, 0.35)'
  },
  'midnight': {
    name: 'Midnight Obsidian',
    primary: '#0F172A',
    hover: '#1E293B',
    tint: '#F1F5F9',
    ring: 'rgba(15, 23, 42, 0.35)'
  },
  'amber-glow': {
    name: 'Amber Glow',
    primary: '#F59E0B',
    hover: '#D97706',
    tint: '#FFFBEB',
    ring: 'rgba(245, 158, 11, 0.35)'
  }
};

export const GLASS_PRESETS: Record<string, Partial<AppearanceCustomization>> = {
  'apple-glass': {
    presetName: 'apple-glass',
    blurIntensity: 28,
    cornerRadius: 22,
    transparency: 35,
    glassDepth: 50,
    refraction: 40,
    edgeGlow: 30,
    bubbleSpacing: 10,
    uiDensity: 'comfortable',
    animationSpeed: 'smooth',
    bubbleStyle: 'edge-glow'
  },
  'bubble': {
    presetName: 'bubble',
    blurIntensity: 20,
    cornerRadius: 28,
    transparency: 45,
    glassDepth: 60,
    refraction: 50,
    edgeGlow: 40,
    bubbleSpacing: 14,
    uiDensity: 'spacious',
    animationSpeed: 'snappy',
    bubbleStyle: 'gradient'
  },
  'box': {
    presetName: 'box',
    blurIntensity: 12,
    cornerRadius: 4,
    transparency: 25,
    glassDepth: 20,
    refraction: 10,
    edgeGlow: 10,
    bubbleSpacing: 6,
    uiDensity: 'compact',
    animationSpeed: 'instant',
    bubbleStyle: 'classic'
  },
  'squircle': {
    presetName: 'squircle',
    blurIntensity: 30,
    cornerRadius: 18,
    transparency: 30,
    glassDepth: 45,
    refraction: 35,
    edgeGlow: 25,
    bubbleSpacing: 10,
    uiDensity: 'comfortable',
    animationSpeed: 'smooth',
    bubbleStyle: 'edge-glow'
  },
  'crystal': {
    presetName: 'crystal',
    blurIntensity: 36,
    cornerRadius: 20,
    transparency: 20,
    glassDepth: 80,
    refraction: 70,
    edgeGlow: 60,
    bubbleSpacing: 12,
    uiDensity: 'comfortable',
    animationSpeed: 'cinematic',
    bubbleStyle: 'edge-glow'
  },
  'minimal': {
    presetName: 'minimal',
    blurIntensity: 8,
    cornerRadius: 12,
    transparency: 15,
    glassDepth: 10,
    refraction: 5,
    edgeGlow: 5,
    bubbleSpacing: 8,
    uiDensity: 'comfortable',
    animationSpeed: 'snappy',
    bubbleStyle: 'minimal'
  }
};

const DEFAULT_CUSTOMIZATION: AppearanceCustomization = {
  themeMode: 'light',
  presetName: 'apple-glass',
  designLanguage: 'liquid-glass',
  accentColor: 'liquid-azure',
  accentMode: 'single',
  blurIntensity: 24,
  transparency: 40,
  cornerRadius: 18,
  shadowDepth: 30,
  glassDepth: 40,
  refraction: 30,
  edgeGlow: 25,
  animationSpeed: 'smooth',
  uiDensity: 'comfortable',
  chatWallpaper: 'glass-gradient',
  storiesLayout: 'horizontal',
  bubbleStyle: 'edge-glow',
  bubbleSpacing: 10,
  fontSize: 'sm',
  appIcon: 'liquid-blue',
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  perChatThemes: {}
};

interface ThemeState {
  customization: AppearanceCustomization;
  setDesignLanguage: (lang: DesignLanguage) => void;
  setAccentColor: (accent: AccentColor) => void;
  setBlurIntensity: (px: number) => void;
  setCornerRadius: (px: number) => void;
  setBubbleStyle: (style: BubbleStyle) => void;
  setWallpaper: (wallpaper: WallpaperStyle, chatId?: string) => void;
  setDensity: (density: UIDensity) => void;
  setAppIcon: (icon: AppIconVariant) => void;
  applyPreset: (presetKey: string) => void;
  resetToDefaults: () => void;
  updateCustomization: (updates: Partial<AppearanceCustomization>) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  customization: DEFAULT_CUSTOMIZATION,

  setDesignLanguage: (designLanguage) => {
    set((state) => ({ customization: { ...state.customization, designLanguage } }));
    applyThemeVars(get().customization);
  },

  setAccentColor: (accentColor) => {
    set((state) => ({ customization: { ...state.customization, accentColor } }));
    applyThemeVars(get().customization);
  },

  setBlurIntensity: (blurIntensity) => {
    set((state) => ({ customization: { ...state.customization, blurIntensity } }));
    applyThemeVars(get().customization);
  },

  setCornerRadius: (cornerRadius) => {
    set((state) => ({ customization: { ...state.customization, cornerRadius } }));
    applyThemeVars(get().customization);
  },

  setBubbleStyle: (bubbleStyle) => {
    set((state) => ({ customization: { ...state.customization, bubbleStyle } }));
    applyThemeVars(get().customization);
  },

  setWallpaper: (chatWallpaper, chatId) => {
    if (chatId) {
      set((state) => ({
        customization: {
          ...state.customization,
          perChatThemes: {
            ...state.customization.perChatThemes,
            [chatId]: {
              wallpaper: chatWallpaper,
              accent: state.customization.perChatThemes[chatId]?.accent || state.customization.accentColor
            }
          }
        }
      }));
    } else {
      set((state) => ({ customization: { ...state.customization, chatWallpaper } }));
    }
    applyThemeVars(get().customization);
  },

  setDensity: (uiDensity) => {
    set((state) => ({ customization: { ...state.customization, uiDensity } }));
    applyThemeVars(get().customization);
  },

  setAppIcon: (appIcon) => {
    set((state) => ({ customization: { ...state.customization, appIcon } }));
  },

  applyPreset: (presetKey) => {
    const preset = GLASS_PRESETS[presetKey];
    if (preset) {
      const updated = { ...get().customization, ...preset };
      set({ customization: updated });
      applyThemeVars(updated);
    }
  },

  resetToDefaults: () => {
    set({ customization: DEFAULT_CUSTOMIZATION });
    applyThemeVars(DEFAULT_CUSTOMIZATION);
  },

  updateCustomization: (updates) => {
    const updated = { ...get().customization, ...updates };
    set({ customization: updated });
    applyThemeVars(updated);
  }
}));

export function applyThemeVars(config: AppearanceCustomization) {
  const root = document.documentElement;
  const accent = ACCENT_COLOR_CONFIG[config.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  root.style.setProperty('--relay-accent-primary', accent.primary);
  root.style.setProperty('--relay-accent-hover', accent.hover);
  root.style.setProperty('--relay-accent-tint', accent.tint);
  root.style.setProperty('--relay-accent-ring', accent.ring);

  // Requirement 4: Unified CSS Global Accent System
  root.style.setProperty('--primary-accent', accent.primary);
  root.style.setProperty('--neutral-button', '#F1F5F9');
  root.style.setProperty('--danger-destructive', '#D32F2F');

  root.style.setProperty('--relay-glass-blur', `${config.blurIntensity}px`);
  root.style.setProperty('--relay-glass-radius', `${config.cornerRadius}px`);
  root.style.setProperty('--relay-bubble-spacing', `${config.bubbleSpacing}px`);

  let effectiveMode = config.themeMode;
  if (config.themeMode === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    effectiveMode = prefersDark ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme-mode', effectiveMode);
  document.body.setAttribute('data-theme-mode', effectiveMode);
  document.body.setAttribute('data-design-language', config.designLanguage);
  document.body.setAttribute('data-bubble-style', config.bubbleStyle);
  document.body.setAttribute('data-density', config.uiDensity);
  document.body.setAttribute('data-wallpaper', config.chatWallpaper || 'glass-gradient');
  document.body.setAttribute('data-stories-layout', config.storiesLayout || 'horizontal');

  if (effectiveMode === 'dark' || effectiveMode === 'pure-black') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
