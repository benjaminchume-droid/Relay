/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Palette, Shield, Lock, User, RefreshCw, LogOut, Check, Camera, Upload,
  Bell, HardDrive, HelpCircle, AlertTriangle, KeyRound, Scale, FileText, Users,
  Volume2, Vibrate, Eye, BellRing, Download, Cpu, Smartphone, Monitor, Layers
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './GlassUI';
import { supabase } from '../lib/supabase/client';
import { PermissionsView } from './PermissionsView';
import { useAuthStore } from '../store/authStore';
import { useThemeStore, ACCENT_COLOR_CONFIG, GLASS_PRESETS } from '../store/themeStore';
import { AccentColor, BubbleStyle, WallpaperStyle, ThemeMode, StoriesLayout } from '../types';
import { relayCacheManager } from '../services/cacheManager';
import { getLetterAvatar } from '../lib/avatar';
import { isInAppWebView } from '../lib/nativeBridge';
import { ThemePresetsSection } from './ThemePresetsSection';
import { DownloadsSection } from './DownloadsSection';
import { WALLPAPERS } from './chat/wallpapers';
import { RELAY_WEB_VERSION } from '../lib/version';
import { notificationService, type NotificationPrefs } from '../services/notificationService';

type LegalDoc = 'privacy' | 'guidelines' | 'terms';

/* -----------------------------------------------------------------------
 * Legal Center — plain-language, user-facing documents.
 * ----------------------------------------------------------------------- */
const LEGAL_CONTENT: Record<LegalDoc, { title: string; icon: React.FC<any>; body: React.ReactNode }> = {
  privacy: {
    title: 'Privacy Policy',
    icon: Shield,
    body: (
      <>
        <p><strong>What we collect.</strong> Relay collects the minimum needed to run the service: your account email, the display name and @handle you choose, your avatar if you upload one, and technical records (device type, app version) used to keep you signed in and deliver notifications.</p>
        <p><strong>Your conversations.</strong> Personal and group messages are end-to-end encrypted on your device. They reach our servers only as ciphertext and are stored that way — Relay cannot read them, and neither can anyone who obtains our database. Voice notes, photos and files are encrypted before upload and decrypted only on the devices of the people in that conversation.</p>
        <p><strong>What we can see.</strong> Metadata required to deliver messages — which conversations exist, who is in them, and delivery timestamps. We do not sell data, run ad trackers, or build advertising profiles. Ever.</p>
        <p><strong>Your controls.</strong> You can export or delete your account at any time from Settings. Deleting your account removes your profile, keys and message records from our systems. Read receipts and last-seen can be turned off in Privacy settings.</p>
        <p><strong>Changes.</strong> If this policy changes materially, we will notify you in-app before it takes effect.</p>
      </>
    ),
  },
  guidelines: {
    title: 'Community Guidelines',
    icon: Users,
    body: (
      <>
        <p>Relay exists so people can talk freely and safely. These rules keep it that way.</p>
        <p><strong>Be human.</strong> No harassment, hate speech, threats, or targeted abuse. Disagreement is fine; demeaning people is not.</p>
        <p><strong>No illegal content or activity.</strong> Do not use Relay to distribute unlawful material, sexual content involving minors, or to coordinate harm.</p>
        <p><strong>No spam or manipulation.</strong> No bulk unsolicited invites, scam messages, impersonation of other people or brands, or automated flooding.</p>
        <p><strong>Respect spaces.</strong> Community hosts set extra rules for their spaces. Follow them, and follow moderators' decisions within these guidelines.</p>
        <p><strong>Enforcement.</strong> Because messages are end-to-end encrypted, Relay only acts on reports about public community content, profiles, or behavior patterns we can observe — not on private conversations we cannot read. Violations can lead to content removal, suspension, or a permanent ban. Report issues to a community moderator or contact support.</p>
      </>
    ),
  },
  terms: {
    title: 'Terms of Service',
    icon: FileText,
    body: (
      <>
        <p><strong>Your account.</strong> You must provide accurate registration information and keep your credentials secure. You are responsible for activity under your account. Minimum age: 13 (or higher where local law requires).</p>
        <p><strong>The service.</strong> Relay provides end-to-end encrypted messaging, calling, stories and communities "as is." We work hard on reliability but do not guarantee uninterrupted service, and we may change or discontinue features over time.</p>
        <p><strong>Your content.</strong> You keep ownership of everything you send or post. By using Relay you grant us only the limited technical right to transmit, store (in encrypted form), and display your content within the service as you intend.</p>
        <p><strong>Acceptable use.</strong> Don't reverse-engineer the encryption, attack the infrastructure, scrape the service, or use Relay to break the law or these guidelines.</p>
        <p><strong>Termination.</strong> You can stop using Relay and delete your account whenever you like. We may suspend accounts that violate these terms, with notice when practicable.</p>
        <p><strong>Liability.</strong> To the maximum extent permitted by law, Relay is not liable for indirect or consequential damages arising from your use of the service.</p>
      </>
    ),
  },
};

const ABOUT_MISSION = `Relay started with a simple belief: private conversation is a right, not a premium feature. We build one app where your messages, calls, stories and communities are protected by end-to-end encryption by default — not as a settings toggle, not as a paid tier.

We want Relay to feel effortless. Everything sensitive stays sealed between you and the people you talk to; everything else gets out of the way. No ads, no data mining, no dark patterns — our only customer is you.

Where we're going: making encrypted communication available to everyone, on every device, with the polish of the best consumer apps in the world. Relay is built by Glassline — a small, independent company that answers to its users, not to advertisers.`;

export const ProfileView: React.FC = () => {
  const inApp = isInAppWebView();
  const [subTab, setSubTab] = useState<'PERSONAL' | 'APPEARANCE' | 'PRIVACY' | 'PERMISSIONS' | 'NOTIFICATIONS' | 'STORAGE' | 'DOWNLOADS' | 'HELP' | 'LEGAL'>('APPEARANCE');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [notifPrefs, setNotifPrefsState] = useState(notificationService.getPrefs());
  const [notifPerm, setNotifPerm] = useState(notificationService.permission());

  // password card — accounts created via email code or Google have no password yet
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  
  const { currentUser, updateProfile, uploadAvatarOrBanner, updatePrivacy, revokeSession, revokeAllOtherSessions, logout, deleteAccount, setAccountPassword } = useAuthStore();
  const { 
    customization, 
    setAccentColor, 
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

  useEffect(() => {
    setNotifPrefsState(notificationService.getPrefs());
    setNotifPerm(notificationService.permission());
  }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<{ checking: boolean; available: boolean | null; message: string }>({ checking: false, available: null, message: '' });

  // server-side username availability with debounce (edit-profile hardening)
  useEffect(() => {
    const handle = username.trim().toLowerCase().replace(/^@+/, '');
    if (!handle || handle === (currentUser?.username || '').toLowerCase()) {
      setUsernameCheck({ checking: false, available: null, message: '' });
      return;
    }
    if (handle.length < 3 || handle.length > 20 || !/^[a-z0-9_]+$/.test(handle)) {
      setUsernameCheck({ checking: false, available: false, message: '3–20 chars, letters/numbers/underscores only' });
      return;
    }
    setUsernameCheck((s) => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('username_available', { p_username: handle });
        const available = !error && data === true;
        setUsernameCheck({ checking: false, available, message: available ? 'Username is available' : 'Username taken' });
      } catch {
        setUsernameCheck({ checking: false, available: null, message: '' });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  if (!currentUser) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (usernameCheck.available === false) {
      setSaveError(usernameCheck.message || 'Username not available');
      return;
    }
    try {
      await updateProfile({
        name: displayName,
        username,
        bio,
        statusMessage
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save profile');
    }
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

  const handleEnableSystemNotifications = async () => {
    const result = await notificationService.requestPermission();
    setNotifPerm(result);
    setNotifPrefsState(notificationService.getPrefs());
  };

  const patchNotifPrefs = (patch: Partial<NotificationPrefs>) => {
    setNotifPrefsState(notificationService.setPrefs(patch));
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setPwBusy(true);
    const ok = await setAccountPassword(newPw, confirmPw);
    setPwBusy(false);
    if (ok) {
      setPwMsg({ ok: true, text: 'Password saved. You can now sign in with it on any device.' });
      setNewPw(''); setConfirmPw('');
    } else {
      setPwMsg({ ok: false, text: useAuthStore.getState().error || 'Could not set the password.' });
    }
  };

  const accentList: AccentColor[] = ['liquid-azure', 'emerald-frost', 'neon-violet', 'rose-gold', 'midnight', 'amber-glow'];
  const bubbleStyles: BubbleStyle[] = ['edge-glow', 'classic', 'gradient', 'minimal'];
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
          // Downloads live on the website only — the native apps ARE the download.
          ...(inApp ? [] : [{ id: 'DOWNLOADS', label: 'Downloads', icon: Download }]),
          { id: 'HELP', label: 'About', icon: HelpCircle },
          { id: 'LEGAL', label: 'Legal', icon: Scale }
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
                  : 'bg-white/70 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10'
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
              className="text-xs text-[var(--primary-accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <ThemePresetsSection />

          {/* Chat Style — Classic (bubbles) | Retro (plain rows) */}
          <GlassCard className="p-5 space-y-3">
            <span className="text-xs font-bold text-slate-800 block">Chat Style</span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Classic — rounded message bubbles. Retro — plain rows with sender labels, no bubbles.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                { id: 'classic', label: 'Classic', hint: 'Message bubbles' },
                { id: 'retro', label: 'Retro', hint: 'Plain rows' },
              ] as const).map((opt) => {
                const isSel = (customization.chatStyle || 'classic') === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => updateCustomization({ chatStyle: opt.id })}
                    style={isSel ? { backgroundColor: 'var(--primary-accent, #2563EB)', borderColor: 'var(--primary-accent, #2563EB)' } : {}}
                    className={`p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                      isSel
                        ? 'text-white shadow-md'
                        : 'bg-white/60 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <span className="block">{opt.label}</span>
                    <span className={`block text-[10px] font-medium mt-0.5 ${isSel ? 'text-white/80' : 'text-slate-400'}`}>{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

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
                        : 'bg-white/60 dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 border-slate-200 dark:border-white/10'
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
                        ? 'bg-[var(--primary-accent)] text-white border-[var(--primary-accent)] shadow-md' 
                        : 'bg-white/60 dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/10'
                    }`}
                  >
                    <span>{tm.label}</span>
                  </button>
                );
              })}
            </div>
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

          {/* Wallpapers — every option here actually renders in the chat viewport */}
          <GlassCard className="p-4 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 dark:text-white block">Chat Viewport Wallpaper</span>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">Snowfall pools on top of your chat bubbles; Rainfall streaks and splashes. All styles apply live.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {WALLPAPERS.map((wp) => {
                const isSel = customization.chatWallpaper === wp.id;
                return (
                  <button
                    key={wp.id}
                    onClick={() => setWallpaper(wp.id)}
                    style={{
                      backgroundColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined,
                      borderColor: isSel ? 'var(--primary-accent, #2563EB)' : undefined
                    }}
                    className={`p-1.5 rounded-xl border cursor-pointer transition-all ${
                      isSel
                        ? 'text-white shadow-md'
                        : 'bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <span
                      className="block h-10 w-full rounded-lg border border-black/5 dark:border-white/10 mb-1"
                      style={{ background: wp.swatch }}
                      aria-hidden
                    />
                    <span className="block text-[9.5px] font-bold truncate">{wp.name}</span>
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
              <div className="h-24 w-full rounded-2xl bg-slate-100 dark:bg-white/5 relative overflow-hidden border border-slate-200 dark:border-white/10 flex items-center justify-center">
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
            {usernameCheck.checking && <p className="-mt-2 px-1 text-[10px] font-semibold text-slate-400">Checking availability…</p>}
            {!usernameCheck.checking && usernameCheck.available === true && (
              <p className="-mt-2 px-1 text-[10px] font-bold text-emerald-600">✓ {usernameCheck.message}</p>
            )}
            {!usernameCheck.checking && usernameCheck.available === false && (
              <p className="-mt-2 px-1 text-[10px] font-bold text-red-500">✗ {usernameCheck.message}</p>
            )}

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
            {saveError && (
              <div className="p-2.5 bg-red-50 text-red-600 text-xs rounded-xl font-medium">
                {saveError}
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
                  className="w-4 h-4 rounded text-[var(--primary-accent)] focus:ring-0 cursor-pointer"
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
                  className="w-4 h-4 rounded text-[var(--primary-accent)] focus:ring-0 cursor-pointer"
                />
              </label>
            </div>
          </GlassCard>

          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-slate-600" />
              <span className="text-xs font-bold text-slate-800 block">Account Security</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Signed up with an email code or Google? Your account may not have a password yet.
              Set one here and you'll be able to sign in with it on any device.
            </p>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <GlassInput
                type="password"
                label="New password"
                placeholder="Minimum 8 characters"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
              />
              <GlassInput
                type="password"
                label="Confirm password"
                placeholder="Repeat password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                required
              />
              {pwMsg && (
                <div className={`p-2.5 rounded-xl text-xs font-medium ${pwMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {pwMsg.text}
                </div>
              )}
              <GlassButton type="submit" variant="primary" disabled={pwBusy || newPw.length < 8} className="py-2.5 px-5 text-xs">
                {pwBusy ? 'Saving…' : 'Save password'}
              </GlassButton>
            </form>
          </GlassCard>
        </div>
      )}

      {subTab === 'PERMISSIONS' && <PermissionsView />}

      {subTab === 'NOTIFICATIONS' && (
        <GlassCard className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BellRing size={15} style={{ color: 'var(--primary-accent, #2563EB)' }} />
            <span className="text-xs font-bold text-slate-800 block">Notification Engine</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Relay alerts you the moment a message lands — in-app banners, sound, vibration and system
            notifications. Unread badges show on the Chats tab and the browser tab title.
          </p>

          {notifPerm !== 'unsupported' && (
            <div className="p-3 bg-white/80 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-slate-800 block text-xs">System notifications</span>
                <span className="text-[10px] text-slate-500">
                  {notifPerm === 'granted' ? 'Enabled — alerts appear even when Relay is in the background'
                    : notifPerm === 'denied' ? 'Blocked in your browser settings — re-enable site notifications to use this'
                    : 'Allow Relay to notify you outside the app'}
                </span>
              </div>
              {notifPerm === 'granted' ? (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">ON</span>
              ) : (
                <GlassButton onClick={handleEnableSystemNotifications} variant="primary" className="py-2 px-3.5 text-xs" disabled={notifPerm === 'denied'}>
                  Enable
                </GlassButton>
              )}
            </div>
          )}

          {([
            { key: 'sound' as const, label: 'In-app sound', desc: 'Soft pop when a message arrives', icon: Volume2 },
            { key: 'vibration' as const, label: 'Vibration', desc: 'Short buzz on supported devices', icon: Vibrate },
            { key: 'showPreview' as const, label: 'Message previews', desc: 'Show message text in alerts', icon: Eye },
          ]).map(({ key, label, desc, icon: Icon }) => (
            <label key={key} className="flex items-center justify-between p-3 bg-white/80 rounded-2xl border border-slate-200/80 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Icon size={14} className="text-slate-500" />
                <div>
                  <span className="font-bold text-slate-800 block text-xs">{label}</span>
                  <span className="text-[10px] text-slate-500">{desc}</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifPrefs[key]}
                onChange={(e) => patchNotifPrefs({ [key]: e.target.checked })}
                className="w-4 h-4 rounded text-[var(--primary-accent)] focus:ring-0 cursor-pointer"
              />
            </label>
          ))}
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

      {subTab === 'DOWNLOADS' && !inApp && <DownloadsSection />}

      {subTab === 'HELP' && (
        <div className="space-y-4">
          <GlassCard heavy className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <img src="/relay-logo.png" alt="" className="w-12 h-12 rounded-2xl object-cover shadow-md" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div>
                <h3 className="text-lg font-bold text-slate-800">Relay</h3>
                <p className="text-[11px] text-slate-500 font-semibold">Private by default. Effortless by design.</p>
              </div>
            </div>
            <div className="space-y-3 text-[12.5px] leading-relaxed text-slate-600">
              {ABOUT_MISSION.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { icon: Lock, label: 'End-to-end encrypted' },
                { icon: Bell, label: 'No ads, ever' },
                { icon: Users, label: 'Yours, not ours' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-slate-100/90 px-2.5 py-1.5 rounded-full border border-slate-200/70">
                  <Icon size={11} /> {label}
                </span>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Version</span>
              <span className="font-mono text-slate-500">Relay {RELAY_WEB_VERSION}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-white/10">
              <span className="font-bold text-slate-800">Company</span>
              <span className="text-slate-500">Built by Glassline</span>
            </div>
          </GlassCard>

          <button
            onClick={() => setSubTab('LEGAL')}
            className="w-full text-[11px] font-semibold text-[var(--primary-accent)] hover:underline cursor-pointer"
          >
            Privacy Policy · Community Guidelines · Terms of Service →
          </button>
        </div>
      )}

      {subTab === 'LEGAL' && (
        <div className="space-y-4">
          <GlassCard className="p-5 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Scale size={15} className="text-slate-600" />
              <span className="text-xs font-bold text-slate-800">Legal Center</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">The rules and promises that keep Relay safe — written in plain language.</p>
            <div className="space-y-2">
              {(Object.keys(LEGAL_CONTENT) as LegalDoc[]).map((doc) => {
                const conf = LEGAL_CONTENT[doc];
                const Icon = conf.icon;
                return (
                  <button
                    key={doc}
                    type="button"
                    onClick={() => setLegalDoc(doc)}
                    className="w-full flex items-center justify-between p-3.5 bg-white/80 hover:bg-white rounded-2xl border border-slate-200/80 dark:border-white/10 dark:bg-slate-800/60 text-left cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <span className="p-2 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-accent, #2563EB) 10%, transparent)', color: 'var(--primary-accent, #2563EB)' }}>
                        <Icon size={15} />
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{conf.title}</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Read</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {legalDoc && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setLegalDoc(null)}>
              <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <GlassCard heavy className="max-h-[80vh] overflow-y-auto p-6 space-y-4 text-left">
                  <div className="flex items-center justify-between sticky top-0">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {React.createElement(LEGAL_CONTENT[legalDoc].icon, { size: 16 })}
                      {LEGAL_CONTENT[legalDoc].title}
                    </h3>
                    <button onClick={() => setLegalDoc(null)} className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-500 cursor-pointer font-bold" aria-label="Close">✕</button>
                  </div>
                  <div className="space-y-3 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300 [&_strong]:text-slate-800 dark:[&_strong]:text-slate-100">
                    {LEGAL_CONTENT[legalDoc].body}
                  </div>
                  <p className="text-[10px] text-slate-400">Last updated: October 31, 2026 · Relay by Glassline</p>
                </GlassCard>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-8 border-t border-slate-200/80 dark:border-white/10">
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
