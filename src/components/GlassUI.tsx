/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { useThemeStore, ACCENT_COLOR_CONFIG } from '../store/themeStore';

export const RelayLogoEmblem: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => {
  const { customization } = useThemeStore();
  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="relayGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent.primary} />
          <stop offset="100%" stopColor={accent.hover} />
        </linearGradient>
        <filter id="liquidShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={accent.primary} floodOpacity="0.35" />
        </filter>
      </defs>
      {/* Outer superellipse ring */}
      <rect 
        x="10" 
        y="10" 
        width="80" 
        height="80" 
        rx="26" 
        fill="url(#relayGlow)" 
        filter="url(#liquidShadow)"
      />
      {/* Liquid glass diagonal slash emblem */}
      <path 
        d="M32 32 C 32 32, 68 32, 68 32 C 68 50, 50 68, 32 68 Z" 
        fill="white" 
        fillOpacity="0.88" 
      />
      <circle cx="64" cy="64" r="8" fill="white" />
    </svg>
  );
};

export const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  heavy?: boolean;
}> = ({ children, className = '', onClick, heavy = false }) => {
  const { customization } = useThemeStore();

  const style: React.CSSProperties = {
    borderRadius: `${customization.cornerRadius}px`,
    backdropFilter: `blur(${heavy ? customization.blurIntensity * 1.4 : customization.blurIntensity}px) saturate(140%)`,
    WebkitBackdropFilter: `blur(${heavy ? customization.blurIntensity * 1.4 : customization.blurIntensity}px) saturate(140%)`,
  };

  return (
    <motion.div
      onClick={onClick}
      style={style}
      whileHover={onClick ? { y: -2, transition: { duration: 0.2 } } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      className={`${heavy ? 'glass-panel-heavy' : 'glass-panel'} ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </motion.div>
  );
};

export const GlassButton: React.FC<{
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}> = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }) => {
  const { customization } = useThemeStore();
  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  let bgStyle: React.CSSProperties = {
    borderRadius: `${Math.max(12, customization.cornerRadius - 4)}px`,
  };

  if (variant === 'primary') {
    bgStyle = {
      ...bgStyle,
      backgroundColor: accent.primary,
      boxShadow: `0 8px 24px ${accent.ring}, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
    };
  }

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={bgStyle}
      whileHover={!disabled ? { scale: 1.02, y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${
        variant === 'primary' 
          ? 'text-white border border-white/20' 
          : variant === 'secondary' 
          ? 'glass-button-secondary text-slate-800' 
          : variant === 'danger'
          ? 'bg-red-500 text-white shadow-red-500/20 shadow-lg'
          : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
      } ${className}`}
    >
      {children}
    </motion.button>
  );
};

export const GlassInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string; icon?: React.ReactNode }> = ({
  label,
  icon,
  className = '',
  ...props
}) => {
  const { customization } = useThemeStore();

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && <label className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase px-1">{label}</label>}
      <div className="relative flex items-center">
        {icon && <div className="absolute left-3.5 text-slate-400 pointer-events-none">{icon}</div>}
        <input
          {...props}
          style={{ borderRadius: `${Math.max(10, customization.cornerRadius - 6)}px` }}
          className={`w-full py-2.5 ${icon ? 'pl-10' : 'pl-3.5'} pr-3.5 text-xs text-slate-800 placeholder-slate-400 glass-input transition-all ${className}`}
        />
      </div>
    </div>
  );
};

export const GlassSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step = 1, unit = '', onChange }) => {
  const { customization } = useThemeStore();
  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  return (
    <div className="w-full space-y-2 text-left">
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-mono text-slate-500 text-[11px] font-bold">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: accent.primary }}
        className="w-full h-2 bg-slate-200/60 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
};

export const SuperellipseBadge: React.FC<{ children: React.ReactNode; active?: boolean; onClick?: () => void }> = ({
  children,
  active = false,
  onClick
}) => {
  const { customization } = useThemeStore();
  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: `${customization.cornerRadius}px`,
        backgroundColor: active ? accent.primary : 'rgba(255, 255, 255, 0.45)',
        color: active ? '#ffffff' : '#475569',
        borderColor: active ? accent.primary : 'rgba(255, 255, 255, 0.6)'
      }}
      className={`px-3 py-1.5 text-xs font-semibold border transition-all cursor-pointer backdrop-blur-md shadow-sm ${
        active ? 'shadow-md scale-105' : 'hover:bg-white/70'
      }`}
    >
      {children}
    </button>
  );
};

export const AmbientLiquidBackground: React.FC = () => {
  const { customization } = useThemeStore();
  const accent = ACCENT_COLOR_CONFIG[customization.accentColor] || ACCENT_COLOR_CONFIG['liquid-azure'];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div 
        className="liquid-bg-particle w-[500px] h-[500px] -top-32 -left-32"
        style={{ backgroundColor: accent.primary }}
      />
      <div 
        className="liquid-bg-particle w-[450px] h-[450px] top-1/2 -right-32"
        style={{ backgroundColor: accent.hover }}
      />
      <div 
        className="liquid-bg-particle w-[400px] h-[400px] -bottom-32 left-1/3"
        style={{ backgroundColor: accent.tint === '#EFF6FF' ? '#93C5FD' : accent.primary }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Liquid Glass with real refraction — an SVG displacement map bends whatever
// renders behind the panel (Chromium), with graceful blur-only fallback.
// ---------------------------------------------------------------------------
const REFRACT_FILTER_ID = 'relay-refract';

export const LiquidRefractionDefs: React.FC = () => {
  const { customization } = useThemeStore();
  const scale = Math.max(0, Math.min(100, customization.refraction ?? 30)) * 0.6;
  return (
    <svg aria-hidden className="fixed w-0 h-0 pointer-events-none" style={{ width: 0, height: 0 }}>
      <defs>
        <filter id={REFRACT_FILTER_ID} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
};

let refractSupport: boolean | null = null;
function supportsBackdropRefraction(): boolean {
  if (refractSupport !== null) return refractSupport;
  try {
    refractSupport =
      typeof CSS !== 'undefined' &&
      (CSS.supports('backdrop-filter', 'url(#relay-refract)') || CSS.supports('-webkit-backdrop-filter', 'url(#relay-refract)'));
  } catch {
    refractSupport = false;
  }
  return refractSupport;
}

export const LiquidPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
  blur?: number;
  style?: React.CSSProperties;
  as?: 'div' | 'header' | 'form' | 'aside';
  heavy?: boolean;
  onSubmit?: (e: React.FormEvent) => void;
}> = ({ children, className = '', blur, style, as = 'div', heavy = false, onSubmit }) => {
  const { customization } = useThemeStore();
  const Tag = as as any;
  const blurPx = blur ?? customization.blurIntensity ?? 24;
  const chain = supportsBackdropRefraction()
    ? `blur(${blurPx}px) saturate(165%) url(#${REFRACT_FILTER_ID})`
    : `blur(${Math.max(10, blurPx)}px) saturate(160%)`;
  return (
    <Tag
      onSubmit={onSubmit}
      className={`liquid-panel ${heavy ? 'liquid-panel-heavy' : ''} ${className}`}
      style={{
        backdropFilter: chain,
        WebkitBackdropFilter: chain,
        borderRadius: `${customization.cornerRadius}px`,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
};
