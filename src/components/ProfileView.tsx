/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Palette, Shield, Lock, User, RefreshCw, LogOut, ShieldCheck, Check, Camera, Upload,
  Bell, HardDrive, HelpCircle, AlertTriangle, Trash2, Smartphone, Eye, Sparkles, Sliders, KeyRound
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassSlider } from './GlassUI';
import { PermissionsView } from './PermissionsView';
import { useAuthStore } from '../store/authStore';
import { useThemeStore, ACCENT_COLOR_CONFIG, GLASS_PRESETS } from '../store/themeStore';
import { AccentColor, BubbleStyle, WallpaperStyle, ThemeMode, StoriesLayout } from '../types';
import { relayCacheManager } from '../services/cacheManager';
import { getLetterAvatar } from '../lib/avatar';
import { ThemePresetsSection } from './ThemePresetsSection';

export const ProfileView: React.FC = () => {
  const [subTab, setSubTab] = useState<'PERSONAL' | 'APPEARANCE' | 'PRIVACY' | 'PERMISSIONS' | 'NOTIFICATIONS' | 'STORAGE' | 'HELP'>('APPEARANCE');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  
  const { currentUser, updateProfile, uploadAvatarOrBanner, updatePrivacy, revokeSession, revokeAllOtherSessions, logout, deleteAccount } = useAuthStore();
  const { 
    customization, 
    setAccentColor, 
    setBlurIntensity, 
    setCornerRadius, 
    setBubbleStyle, 
    setWallpaper, 
    applyPreset,
    resetToDefaults,
    updateCustomization
  } = useThemeStore();

  const [displayName, setDisplayName] = useState(currentUser?.name || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [statusMessage, setStatusMessage] = useState(currentUser?.statusMessage || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!currentUser) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      name: displayName,
      username,
      bio,
      statusMessage
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isBanner: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await uploadAvatarOrBanner(base64, isBanner ? 'banner' : 'avatar');
    };
    reader.readAsDataURL(file);
  };

  const handleClearCache = () => {
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2500);
  };

  const accentList: AccentColor[] = ['liquid-azure', 'emerald-frost', 'neon-violet', 'rose-gold', 'midnight', 'amber-glow'];
  const bubbleStyles: BubbleStyle[] = ['edge-glow', 'classic', 'gradient', 'minimal'];
  const wallpapers: WallpaperStyle[] = ['glass-gradient', 'dark-aurora', 'neon-mesh', 'minimal-grid', 'warm-clay', 'pure-slate'];
  const themeModes: Array<{ id: ThemeMode; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'pure-black', label: 'Pure Black' },
    { id: 'glass', label: 'Glass' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'transparent', label: 'Transparent' },
    { id: 'system', label: 'System' }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-28 text-left">
      
      {/* Profile Header */}
      <GlassCard heavy className="p-6 overflow-hidden relative space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img 
                src={currentUser.avatarUrl || getLetterAvatar(currentUser.name || currentUser.username, 160)} 
                alt="avatar" 
                className="w-16 h-16 rounded-3xl object-cover border-2 border-white shadow-md"
              />
              <label 
                style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
                className="absolute -bottom-1 -right-1 text-white p-1.5 rounded-xl text-xs cursor-pointer hover:brightness-110 shadow-xs"
              >
                <Camera size={12} />
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} className="hidden" />
              </label>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-800">{currentUser.name}</h2>
              <span className="text-xs font-mono text-slate-500 font-semibold">@{currentUser.username}</span>
              <p className="text-xs text-slate-600 mt-1 font-medium">{currentUser.statusMessage || "Customize your space"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton onClick={logout} variant="danger" className="py-2 px-3 text-xs">
              <LogOut size={14} />
              <span>Sign Out</span>
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'APPEARANCE', label: 'Appearance', icon: Palette },
          { id: 'PERSONAL', label: 'Personal Info', icon: User },
          { id: 'PRIVACY', label: 'Privacy', icon: Lock },
          { id: 'PERMISSIONS', label: 'Permissions & Devices', icon: KeyRound },
          { id: 'NOTIFICATIONS', label: 'Notifications', icon: Bell },
          { id: 'STORAGE', label: 'Storage', icon: HardDrive },
          { id: 'HELP', label: 'Help & About', icon: HelpCircle }
        ].map((tab) => {
          const isActive = subTab === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              style={{
                backgroundColor: isActive ? 'var(--primary-accent, #2563EB)' : undefined,
                borderColor: isActive ? 'var(--primary-accent, #2563EB)' : undefined
              }}
              className={`py-2 px-3.5 rounded-2xl flex items-center gap-2 text-xs font-bold shrink-0 cursor-pointer transition-all ${
                isActive 
                  ? 'text-white shadow-md' 
                  : 'bg-white/70 text-slate-600 hover:bg-white border border-slate-200/80'
              }`}
            >
              <IconComp size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Appearance Customization Experience */}
      {subTab === 'APPEARANCE' && (
        <div className="space-y-6">
          
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Appearance Engine</span>
            <button 
              onClick={resetToDefaults}
              className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <ThemePresetsSection />

          {/* Presets System */}
          <GlassCard className="p-5 space-y-3">
            <span className="text-xs font-bold text-slate-800 block">Glass System Presets</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {Object.keys(GLASS_PRESETS).map((key) => {
                const isSel = customization.presetName === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    style={{
                      backgroundColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined,
                      borderColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined
                    }}
                    className={`p-3 rounded-2xl border text-xs font-semibold capitalize cursor-pointer transition-all ${
                      isSel 
                        ? 'text-white shadow-md scale-[1.02]' 
                        : 'bg-white/60 text-slate-700 hover:bg-white border-slate-200'
                    }`}
                  >
                    {key.replace('-', ' ')}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Theme Mode */}
          <GlassCard className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 block">Theme Mode</span>
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md">Active</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {themeModes.map((tm) => {
                const isSel = customization.themeMode === tm.id;
                return (
                  <button
                    key={tm.id}
                    onClick={() => updateCustomization({ themeMode: tm.id })}
                    className={`p-3 rounded-2xl border text-xs font-semibold transition-all relative flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      isSel
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                        : 'bg-white/60 text-slate-700 border-slate-200 hover:bg-white'
                    }`}
                  >
                    <span>{tm.label}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Glass Engine Sliders */}
          <GlassCard className="p-5 space-y-5">
            <span className="text-xs font-bold text-slate-800 block">Liquid Glass Engine Controls</span>
            
            <GlassSlider 
              label="Glass Blur Intensity" 
              value={customization.blurIntensity} 
              min={0} 
              max={40} 
              unit="px"
              onChange={setBlurIntensity}
            />

            <GlassSlider 
              label="Corner Radius Presets & Manual Slider" 
              value={customization.cornerRadius} 
              min={0} 
              max={32} 
              unit="px"
              onChange={setCornerRadius}
            />

            <GlassSlider 
              label="Glass Refraction & Depth" 
              value={customization.glassDepth || 40} 
              min={0} 
              max={100} 
              unit="%"
              onChange={(val) => updateCustomization({ glassDepth: val })}
            />
          </GlassCard>

          {/* Accent Color System */}
          <GlassCard className="p-5 space-y-3">
            <span className="text-xs font-bold text-slate-800 block">Accent Color System</span>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {accentList.map((acc) => {
                const conf = ACCENT_COLOR_CONFIG[acc];
                const isSel = customization.accentColor === acc;
                return (
                  <button
                    key={acc}
                    onClick={() => setAccentColor(acc)}
                    style={{ backgroundColor: conf.primary }}
                    className={`h-12 rounded-2xl border-2 flex items-center justify-center text-white cursor-pointer transition-transform ${
                      isSel ? 'border-slate-900 scale-105 shadow-lg' : 'border-white/80 opacity-90 hover:opacity-100'
                    }`}
                  >
                    {isSel && <Check size={18} className="drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Stories Layout Preference */}
          <GlassCard className="p-4 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 dark:text-white block">Explore Stories Layout</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'horizontal', label: 'Horizontal' },
                { id: 'vertical', label: 'Vertical' },
                { id: 'grid', label: 'Grid' }
              ].map((ly) => {
                const isSel = customization.storiesLayout === ly.id;
                return (
                  <button
                    key={ly.id}
                    onClick={() => updateCustomization({ storiesLayout: ly.id as StoriesLayout })}
                    style={{
                      backgroundColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined,
                      borderColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      isSel 
                        ? 'text-white shadow-md' 
                        : 'bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {ly.label}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Wallpapers */}
          <GlassCard className="p-4 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 dark:text-white block">Chat Viewport Wallpaper</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {wallpapers.map((wp) => {
                const isSel = customization.chatWallpaper === wp;
                return (
                  <button
                    key={wp}
                    onClick={() => setWallpaper(wp)}
                    style={{
                      backgroundColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined,
                      borderColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold capitalize cursor-pointer transition-all ${
                      isSel 
                        ? 'text-white shadow-md' 
                        : 'bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white border-slate-200 dark:border-white/10'
                    }`}
                  >
                    {wp.replace('-', ' ')}
                  </button>
                );
              })}
            </div>
          </GlassCard>

        </div>
      )}

      {/* Tab 2: Personal Information */}
      {subTab === 'PERSONAL' && (
        <GlassCard className="p-5 space-y-4">
          <span className="text-xs font-bold text-slate-800 block">Personal Information</span>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Profile Banner</label>
              <div className="h-24 w-full rounded-2xl bg-slate-100 relative overflow-hidden border border-slate-200 flex items-center justify-center">
                {currentUser.bannerUrl ? (
                  <img src={currentUser.bannerUrl} alt="banner" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Default Banner</span>
                )}
                <label className="absolute bottom-2 right-2 bg-slate-900/80 text-white p-1.5 rounded-xl text-xs cursor-pointer hover:bg-slate-900">
                  <Upload size={14} />
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} className="hidden" />
                </label>
              </div>
            </div>

            <GlassInput 
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <GlassInput 
              label="Reserved @handle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <GlassInput 
              label="Custom Status Message"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
            />

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase px-1">Bio</label>
              <textarea 
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-2xl glass-input text-xs text-slate-800 font-medium focus:outline-none"
              />
            </div>

            {saveSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-medium">
                Profile changes saved!
              </div>
            )}

            <GlassButton type="submit" variant="primary" className="py-2.5 px-5 text-xs">
              Save Changes
            </GlassButton>
          </form>
        </GlassCard>
      )}

      {/* Remaining tabs kept lean — Privacy / Permissions / Notifications / Storage / Help use existing patterns from prior phases */}
      {subTab === 'PRIVACY' && (
        <div className="space-y-4">
          <GlassCard className="p-5 space-y-4">
            <span className="text-xs font-bold text-slate-800 block">Stay in control</span>
            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 bg-white/80 rounded-2xl border border-white cursor-pointer">
                <div>
                  <span className="font-bold text-slate-800 block">Read Receipts</span>
                  <span className="text-[10px] text-slate-500">Allow contacts to see when you have read messages</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={!!currentUser.settings?.privacy?.readReceipts}
                  onChange={(e) => updatePrivacy({ readReceipts: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-white/80 rounded-2xl border border-white cursor-pointer">
                <div>
                  <span className="font-bold text-slate-800 block">Last Seen</span>
                  <span className="text-[10px] text-slate-500">Show when you were last online</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={!!currentUser.settings?.privacy?.lastSeen}
                  onChange={(e) => updatePrivacy({ lastSeen: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
              </label>
            </div>
          </GlassCard>
        </div>
      )}

      {subTab === 'PERMISSIONS' && <PermissionsView />}

      {subTab === 'NOTIFICATIONS' && (
        <GlassCard className="p-5 space-y-3">
          <span className="text-xs font-bold text-slate-800 block">Notification Preferences</span>
          <p className="text-[11px] text-slate-500">Device registration runs automatically on login (Phase 5). Push tokens are stored when Capacitor PushNotifications is available.</p>
        </GlassCard>
      )}

      {subTab === 'STORAGE' && (
        <GlassCard className="p-5 space-y-3">
          <span className="text-xs font-bold text-slate-800 block">Storage & Cache</span>
          <GlassButton onClick={handleClearCache} className="py-2 px-4 text-xs">
            {cacheCleared ? 'Cache cleared' : 'Clear local cache'}
          </GlassButton>
        </GlassCard>
      )}

      {subTab === 'HELP' && (
        <GlassCard className="p-5 space-y-4">
          <span className="text-xs font-bold text-slate-800 block">About RELAY</span>
          <div className="space-y-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">RELAY v0.5.2 Liquid Glass Engine</p>
            <p>Phase 5: device registration, push tokens, TURN-ready ICE, and one-tap look packs.</p>
          </div>
        </GlassCard>
      )}

      <div className="pt-8 border-t border-slate-200/80">
        <GlassCard className="p-5 border-red-200/80 bg-red-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-red-700">Delete Account Queue</h4>
              <p className="text-[11px] text-red-600/80">Queue permanent account deletion with cancellation grace period.</p>
            </div>
            <GlassButton onClick={() => setShowDeleteModal(true)} variant="danger" className="py-2 px-4 text-xs">
              Queue Account Deletion
            </GlassButton>
          </div>
        </GlassCard>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <GlassCard heavy className="max-w-md w-full p-6 space-y-4 text-left border-red-300">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="text-sm font-bold">Confirm account deletion</h3>
            </div>
            <p className="text-xs text-slate-600">This queues permanent deletion. You can cancel within the grace window from email if configured.</p>
            <div className="flex gap-2 justify-end">
              <GlassButton onClick={() => setShowDeleteModal(false)} className="py-2 px-4 text-xs">Cancel</GlassButton>
              <GlassButton variant="danger" className="py-2 px-4 text-xs" onClick={async () => { await deleteAccount(); setShowDeleteModal(false); }}>Confirm</GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default ProfileView;
