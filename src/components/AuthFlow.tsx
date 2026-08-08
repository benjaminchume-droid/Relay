/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Lock, ArrowRight, ArrowLeft, ShieldCheck, Check, Camera, Upload, Globe, 
  Sparkles, Sliders, Palette, AlertCircle, RefreshCw, Eye, EyeOff, CheckCircle2, ChevronRight, Search
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassSlider, RelayLogoEmblem } from './GlassUI';
import { useAuthStore } from '../store/authStore';
import { COUNTRIES, CountryItem } from '../data/countries';
import { AccentColor, WallpaperStyle, BubbleStyle, ThemeMode, StoriesLayout } from '../types';
import { getLetterAvatar } from '../lib/avatar';

type OnboardingStep = 
  | 'SPLASH'
  | 'WELCOME'
  | 'DISPLAY_NAME'
  | 'AGE'
  | 'COUNTRY'
  | 'USERNAME'
  | 'PASSWORD'
  | 'PROFILE_PICTURE'
  | 'APPEARANCE'
  | 'LOGIN';

export const AuthFlow: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [step, setStep] = useState<OnboardingStep>('SPLASH');

  // Form Fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Registration Flow Fields
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState<number>(22);
  const [selectedCountry, setSelectedCountry] = useState<CountryItem>(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryModal, setShowCountryModal] = useState(false);

  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<{ valid?: boolean; message?: string }>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [bio, setBio] = useState('Exploring Relay.');
  const [statusMessage, setStatusMessage] = useState('Available');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const getPrevStep = (currentStep: OnboardingStep): OnboardingStep => {
    switch (currentStep) {
      case 'WELCOME': return 'SPLASH';
      case 'DISPLAY_NAME': return 'WELCOME';
      case 'AGE': return 'DISPLAY_NAME';
      case 'COUNTRY': return 'AGE';
      case 'USERNAME': return 'COUNTRY';
      case 'PASSWORD': return 'USERNAME';
      case 'PROFILE_PICTURE': return 'PASSWORD';
      case 'APPEARANCE': return 'PROFILE_PICTURE';
      case 'LOGIN': return 'SPLASH';
      default: return 'SPLASH';
    }
  };

  // Live Appearance Preferences
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [accentColor, setAccentColor] = useState<AccentColor>('liquid-azure');
  const [chatWallpaper, setChatWallpaper] = useState<WallpaperStyle>('glass-gradient');
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>('edge-glow');
  const [cornerRadius, setCornerRadius] = useState<number>(18);
  const [glassDepth, setGlassDepth] = useState<number>(40);
  const [storiesLayout, setStoriesLayout] = useState<StoriesLayout>('horizontal');

  const { 
    loginUser, checkUsernameAvailable, signupComplete, isLoading, error, clearError 
  } = useAuthStore();

  // Username validation & auto suggestions
  useEffect(() => {
    if (!username || step !== 'USERNAME') return;
    const timer = setTimeout(async () => {
      const res = await checkUsernameAvailable(username);
      setUsernameStatus(res);
    }, 250);
    return () => clearTimeout(timer);
  }, [username, step]);

  // Generate username suggestions when display name is set
  useEffect(() => {
    if (displayName) {
      const clean = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean) {
        setSuggestions([
          `${clean}_relay`,
          `${clean}_glass`,
          `${clean}_52`,
          `real_${clean}`
        ]);
      }
    }
  }, [displayName]);

  // Calculate password strength
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const passwordStrength = getPasswordStrength(password);

  // Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await loginUser(loginUsername, loginPassword);
    if (!error) onSuccess();
  };

  const handleCreateAccount = async () => {
    clearError();
    const appearancePayload = {
      themeMode,
      accentColor,
      chatWallpaper,
      bubbleStyle,
      cornerRadius,
      glassDepth,
      storiesLayout
    };

    useAuthStore.getState().updateSignupDraft({
      name: displayName,
      age,
      country: selectedCountry.name,
      username,
      password,
      avatarUrl: avatarPreview || undefined,
      bio,
      statusMessage,
      appearance: appearancePayload
    });

    await signupComplete(appearancePayload);
    onSuccess();
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const filteredCountries = COUNTRIES.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-lg mx-auto p-4 flex flex-col items-center justify-center min-h-[90vh] py-6">
      
      {/* GLOBAL BRANDING HEADER */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={step}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="w-full"
        >
          <GlassCard heavy className="w-full p-6 md:p-8 text-center space-y-6 shadow-2xl border-white/60 relative overflow-hidden">
            
            {/* Top Navigation Back Button */}
            {step !== 'SPLASH' && (
              <button 
                onClick={() => setStep(getPrevStep(step))}
                className="absolute top-5 left-5 p-2 rounded-2xl bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/80 shadow-xs cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold z-20"
                title="Go back to previous screen"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}

            {/* Header Emblem */}
            <div className="flex flex-col items-center justify-center space-y-3">
              <RelayLogoEmblem size={56} />
              <div className="flex items-center gap-1.5 bg-blue-500/10 backdrop-blur-md px-3 py-1 rounded-full border border-blue-400/20">
                <ShieldCheck size={13} className="text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Relay Identity System</span>
              </div>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-400/30 text-red-600 text-xs rounded-2xl text-left flex items-center gap-2.5">
                <AlertCircle size={16} className="shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* 1. SPLASH SCREEN */}
            {step === 'SPLASH' && (
              <div className="space-y-6 text-center py-4">
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
                  Welcome to Relay
                </h1>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Next-generation Liquid Glass communication platform engineered by Glass Line Studio.
                </p>
                <div className="pt-4 flex flex-col gap-3">
                  <GlassButton onClick={() => setStep('WELCOME')} variant="primary" className="w-full py-3 text-xs font-bold">
                    <span>Get Started</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                  <GlassButton onClick={() => setStep('LOGIN')} variant="secondary" className="w-full py-2.5 text-xs font-medium">
                    I already have an account
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 2. WELCOME / ONBOARDING CHOICE */}
            {step === 'WELCOME' && (
              <div className="space-y-6 text-center py-2">
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-slate-800">Create Identity</h2>
                  <p className="text-xs text-slate-500">
                    No corporate email or phone required. Build your secure Relay handle.
                  </p>
                </div>

                <div className="p-4 bg-white/70 rounded-2xl border border-white text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Sparkles size={14} className="text-blue-500" />
                    <span>Relay Identity Benefits</span>
                  </div>
                  <ul className="text-[11px] text-slate-500 space-y-1 list-disc list-inside">
                    <li>Unique custom handle (@username)</li>
                    <li>Full Liquid Glass visual customization</li>
                    <li>End-to-end encrypted device sessions</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <GlassButton onClick={() => setStep('SPLASH')} variant="secondary" className="py-3 px-5 text-xs font-bold">
                    Back
                  </GlassButton>
                  <GlassButton onClick={() => setStep('DISPLAY_NAME')} variant="primary" className="flex-1 py-3 text-xs font-bold">
                    <span>Begin Registration</span>
                    <ChevronRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 3. STEP: DISPLAY NAME */}
            {step === 'DISPLAY_NAME' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">What is your name?</h3>
                  <p className="text-xs text-slate-500">This display name will be shown in chats and communities.</p>
                </div>

                <GlassInput 
                  label="Display Name / Full Name"
                  placeholder="e.g. Alex Vance"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoFocus
                />

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('WELCOME')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('AGE')} 
                    disabled={!displayName.trim()} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Continue</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 4. STEP: AGE */}
            {step === 'AGE' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">How old are you?</h3>
                  <p className="text-xs text-slate-500">Used to verify age requirements for Relay features.</p>
                </div>

                <div className="p-6 bg-white/80 rounded-2xl border border-white text-center space-y-4">
                  <span className="text-4xl font-extrabold text-blue-600 font-mono">{age}</span>
                  <p className="text-xs text-slate-500">years old</p>
                  <GlassSlider 
                    value={age}
                    min={13}
                    max={99}
                    step={1}
                    onChange={(val) => setAge(val)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('DISPLAY_NAME')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('COUNTRY')} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Next: Country</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 5. STEP: COUNTRY PICKER */}
            {step === 'COUNTRY' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Select Country</h3>
                  <p className="text-xs text-slate-500">Helps localize time, regional feeds, and server routes.</p>
                </div>

                {/* Selected Country Card */}
                <div 
                  onClick={() => setShowCountryModal(true)}
                  className="p-4 bg-white/90 rounded-2xl border border-white cursor-pointer hover:bg-slate-50 transition-all flex items-center justify-between shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedCountry.flag}</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{selectedCountry.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">ISO: {selectedCountry.code} ({selectedCountry.dialCode})</span>
                    </div>
                  </div>
                  <Globe size={18} className="text-slate-400" />
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('AGE')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('USERNAME')} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Next: Username</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 6. STEP: USERNAME */}
            {step === 'USERNAME' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Choose Username</h3>
                  <p className="text-xs text-slate-500">Your unique handle on Relay (@username).</p>
                </div>

                <div className="space-y-2">
                  <GlassInput 
                    label="Username Handle"
                    placeholder="e.g. alex_vance"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    autoFocus
                  />

                  {username && usernameStatus.valid !== undefined && (
                    <div className={`text-[11px] font-medium flex items-center gap-1.5 ${usernameStatus.valid ? 'text-emerald-600' : 'text-red-500'}`}>
                      {usernameStatus.valid ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      <span>{usernameStatus.message}</span>
                    </div>
                  )}

                  {/* Suggestions list */}
                  {suggestions.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Suggested handles</span>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setUsername(s)}
                            className="py-1 px-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 text-[11px] font-mono rounded-xl border border-blue-400/20 transition-all cursor-pointer"
                          >
                            @{s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('COUNTRY')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('PASSWORD')} 
                    disabled={!username || !usernameStatus.valid} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Next: Password</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 7. STEP: PASSWORD */}
            {step === 'PASSWORD' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Set Security Password</h3>
                  <p className="text-xs text-slate-500">Protects your account and device sessions.</p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <GlassInput 
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Strength</span>
                        <span className="font-bold text-slate-700">
                          {passwordStrength <= 25 ? 'Weak' : passwordStrength <= 75 ? 'Moderate' : 'Strong'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            passwordStrength <= 25 ? 'bg-red-500' : passwordStrength <= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${passwordStrength}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <GlassInput 
                    type="password"
                    label="Confirm Password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <span className="text-[10px] text-red-500 font-medium block">Passwords do not match</span>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('USERNAME')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('PROFILE_PICTURE')} 
                    disabled={!password || password.length < 8 || password !== confirmPassword} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Next: Avatar</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 8. STEP: PROFILE PICTURE */}
            {step === 'PROFILE_PICTURE' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Profile Picture</h3>
                  <p className="text-xs text-slate-500">Pick a preset letter avatar or upload your custom image.</p>
                </div>

                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="relative">
                    <img 
                      src={avatarPreview || getLetterAvatar(displayName || username || 'User', 200)} 
                      alt="Avatar Preview" 
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                    />
                    <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 shadow-md">
                      <Camera size={16} />
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </label>
                  </div>

                  {/* Dynamic Letter Preset Avatars */}
                  <div className="space-y-1.5 text-center">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Or select letter avatar style</span>
                    <div className="flex gap-2 justify-center">
                      {[
                        getLetterAvatar(displayName || 'User', 120),
                        getLetterAvatar((displayName || 'Relay') + ' Vance', 120),
                        getLetterAvatar('Glass Studio', 120),
                        getLetterAvatar('Pro Relay', 120),
                        getLetterAvatar('Nexus Identity', 120)
                      ].map((presetUrl, idx) => (
                        <img 
                          key={idx}
                          src={presetUrl}
                          alt="Preset"
                          onClick={() => setAvatarPreview(presetUrl)}
                          className={`w-10 h-10 rounded-full object-cover cursor-pointer border-2 transition-all ${
                            avatarPreview === presetUrl ? 'border-blue-600 scale-110 shadow-sm' : 'border-white opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <GlassInput 
                  label="Bio / Status"
                  placeholder="e.g. Exploring Relay Liquid Glass"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('PASSWORD')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={() => setStep('APPEARANCE')} 
                    variant="primary" 
                    className="flex-1 py-2.5 text-xs font-bold"
                  >
                    <span>Next: Appearance</span>
                    <ArrowRight size={16} />
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 9. STEP: APPEARANCE SETUP */}
            {step === 'APPEARANCE' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Customize Appearance</h3>
                  <p className="text-xs text-slate-500">Set your preferred Relay Liquid Glass aesthetics.</p>
                </div>

                {/* Realtime Live Preview Card */}
                <div 
                  className="p-4 rounded-2xl border border-white/60 shadow-inner space-y-2 text-xs transition-all duration-300"
                  style={{
                    backgroundColor: themeMode === 'dark' ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: `blur(${glassDepth / 2}px)`,
                    borderRadius: `${cornerRadius}px`
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-xs">
                        {displayName ? displayName[0] : 'U'}
                      </div>
                      <div>
                        <span className="font-bold block text-slate-800">@{username || 'handle'}</span>
                        <span className="text-[10px] text-slate-400">Live Aesthetics Preview</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-600 rounded-full text-[9px] font-bold">
                      {accentColor}
                    </span>
                  </div>

                  <div 
                    className="p-3 text-white text-[11px] font-medium shadow-xs"
                    style={{
                      borderRadius: `${cornerRadius - 4}px`,
                      backgroundColor: accentColor === 'emerald-frost' ? '#10B981' : accentColor === 'neon-violet' ? '#8B5CF6' : accentColor === 'rose-gold' ? '#F43F5E' : '#2563EB'
                    }}
                  >
                    Welcome to my custom Relay Glass UI!
                  </div>
                </div>

                {/* Controls */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Theme Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['light', 'dark', 'glass'] as ThemeMode[]).map((tm) => (
                        <button
                          key={tm}
                          type="button"
                          onClick={() => setThemeMode(tm)}
                          className={`py-1.5 capitalize rounded-xl font-bold border transition-all cursor-pointer ${
                            themeMode === tm ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/80 text-slate-700 border-white'
                          }`}
                        >
                          {tm}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Accent Palette</label>
                    <div className="flex gap-2">
                      {[
                        { id: 'liquid-azure', color: '#2563EB' },
                        { id: 'emerald-frost', color: '#10B981' },
                        { id: 'neon-violet', color: '#8B5CF6' },
                        { id: 'rose-gold', color: '#F43F5E' }
                      ].map((ac) => (
                        <button
                          key={ac.id}
                          type="button"
                          onClick={() => setAccentColor(ac.id as AccentColor)}
                          className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-all ${
                            accentColor === ac.id ? 'border-slate-800 scale-110 shadow-sm' : 'border-white'
                          }`}
                          style={{ backgroundColor: ac.color }}
                        />
                      ))}
                    </div>
                  </div>

                  <GlassSlider 
                    label={`Glass Corner Radius (${cornerRadius}px)`}
                    value={cornerRadius}
                    min={4}
                    max={32}
                    step={1}
                    onChange={(v) => setCornerRadius(v)}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton onClick={() => setStep('PROFILE_PICTURE')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Back
                  </GlassButton>
                  <GlassButton 
                    onClick={handleCreateAccount} 
                    disabled={isLoading}
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <span>Create Account & Enter Relay</span>}
                  </GlassButton>
                </div>
              </div>
            )}

            {/* 10. LOGIN MODE */}
            {step === 'LOGIN' && (
              <form onSubmit={handleLoginSubmit} className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Sign in to Relay</h3>
                  <p className="text-xs text-slate-500">Enter your handle and password.</p>
                </div>

                <div className="space-y-3">
                  <GlassInput 
                    label="Username Handle"
                    placeholder="e.g. alex_vance"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    autoFocus
                  />

                  <div className="relative">
                    <GlassInput 
                      type={showLoginPassword ? 'text' : 'password'}
                      label="Password"
                      placeholder="Your account password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button 
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton type="button" onClick={() => setStep('SPLASH')} variant="secondary" className="py-2.5 px-4 text-xs">
                    Cancel
                  </GlassButton>
                  <GlassButton 
                    type="submit" 
                    disabled={isLoading || !loginUsername || !loginPassword} 
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin" size={16} /> : <span>Enter Relay</span>}
                  </GlassButton>
                </div>
              </form>
            )}

          </GlassCard>
        </motion.div>
      </AnimatePresence>

      {/* SEARCHABLE COUNTRY SELECTOR MODAL */}
      {showCountryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md max-h-[80vh] flex flex-col p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Select Country</span>
              <button 
                onClick={() => setShowCountryModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Close
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Search country name or code..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/80 rounded-xl border border-white text-xs focus:outline-none"
              />
            </div>

            <div className="overflow-y-auto space-y-1.5 max-h-[50vh] pr-1">
              {filteredCountries.map((c) => (
                <div 
                  key={c.code}
                  onClick={() => {
                    setSelectedCountry(c);
                    setShowCountryModal(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-all ${
                    selectedCountry.code === c.code ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold' : 'bg-white/70 border-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{c.flag}</span>
                    <span>{c.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{c.code}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

    </div>
  );
};
