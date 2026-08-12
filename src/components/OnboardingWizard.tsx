/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, AlertCircle, RefreshCw, ArrowRight, ArrowLeft, 
  Sparkles, Sun, Moon, Monitor, Check, ShieldCheck, User, AtSign
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, RelayLogoEmblem } from './GlassUI';
import { supabase } from '../lib/supabase/client';
import { useAuthStore, formatProfileRecord } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { ThemeMode, AccentColor } from '../types';

export interface OnboardingWizardProps {
  initialDisplayName?: string;
  initialUsername?: string;
  onComplete?: () => void;
  onSignOut?: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  initialDisplayName = '',
  initialUsername = '',
  onComplete,
  onSignOut
}) => {
  // Step State: 1 = Display Name, 2 = Unique Username, 3 = Appearance Mode
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Local Inputs (Pure local component state)
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [username, setUsername] = useState(initialUsername);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [accentColor, setAccentColor] = useState<AccentColor>('liquid-azure');

  // Username Validation State
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    valid: boolean;
    isAvailable: boolean | null;
    message: string;
  }>({
    valid: false,
    isAvailable: null,
    message: ''
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Submission / Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Generate handle suggestions based on display name
  useEffect(() => {
    if (displayName.trim()) {
      const clean = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean) {
        setSuggestions([
          `${clean}_relay`,
          `${clean}_glass`,
          `${clean}52`,
          `real_${clean}`
        ]);
      }
    } else {
      setSuggestions([]);
    }
  }, [displayName]);

  // Debounced Username Availability Query (300ms timeout hook)
  useEffect(() => {
    const cleanHandle = username.trim().toLowerCase().replace(/^@+/, '');

    if (!cleanHandle) {
      setUsernameStatus({ valid: false, isAvailable: null, message: '' });
      return;
    }

    if (cleanHandle.length < 3) {
      setUsernameStatus({ valid: false, isAvailable: false, message: 'Username must be at least 3 characters' });
      return;
    }

    if (cleanHandle.length > 20) {
      setUsernameStatus({ valid: false, isAvailable: false, message: 'Username must be under 20 characters' });
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanHandle)) {
      setUsernameStatus({ valid: false, isAvailable: false, message: 'Only letters, numbers, and underscores allowed' });
      return;
    }

    setIsCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', cleanHandle)
          .maybeSingle();

        if (error) {
          console.warn('[OnboardingWizard] Handle check error:', error);
        }

        const isAvailable = (data === null);
        setUsernameStatus({
          valid: isAvailable,
          isAvailable,
          message: isAvailable ? 'Username is available' : 'Username taken'
        });
      } catch (err) {
        console.error('[OnboardingWizard] Check exception:', err);
        setUsernameStatus({
          valid: false,
          isAvailable: false,
          message: 'Error checking username availability'
        });
      } finally {
        setIsCheckingUsername(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  // Handler: Advance from Step 1 -> Step 2
  const handleNextToUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSubmitError(null);
    setStep(2);
  };

  // Handler: Advance from Step 2 -> Step 3
  const handleNextToAppearance = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHandle = username.trim().toLowerCase().replace(/^@+/, '');
    if (!cleanHandle || isCheckingUsername || !usernameStatus.isAvailable) return;
    setSubmitError(null);
    setStep(3);
  };

  // Handler: Atomic Finalization on Step 3
  const handleFinalizeOnboarding = async () => {
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No active user session found. Please sign in again.');
      }

      const cleanHandle = username.trim().toLowerCase().replace(/^@+/, '');
      const cleanName = displayName.trim();

      // 1. Single atomic upsert to public.profiles
      const profilePayload = {
        id: user.id,
        display_name: cleanName,
        full_name: cleanName,
        username: cleanHandle,
        theme_preference: themeMode,
        onboarding_completed: true,
        email: user.email || '',
        updated_at: new Date().toISOString()
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (upsertError) {
        console.error('[OnboardingWizard] Upsert error:', upsertError);
        throw new Error(upsertError.message || 'Failed to save profile onboarding details.');
      }

      // 2. Apply selected theme immediately to root app theme
      useThemeStore.getState().updateCustomization({
        themeMode: themeMode,
        accentColor: accentColor
      });

      // 3. Update global Auth state atomically
      const formattedUser = formatProfileRecord(profilePayload, user);

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('relay_setup_completed', 'true');
        localStorage.setItem('relay_cached_user_profile', JSON.stringify(formattedUser));
      }

      useAuthStore.setState({
        currentUser: formattedUser,
        profile: formattedUser,
        status: 'READY',
        isAuthenticated: true,
        currentStep: 'APPEARANCE',
        isLoading: false,
        error: null
      });

      // 4. Call onComplete callback / navigate
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      console.error('[OnboardingWizard] Setup Exception:', err);
      setSubmitError(err?.message || 'An error occurred while finalizing setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanHandle = username.trim().toLowerCase().replace(/^@+/, '');
  const isStep2Valid = cleanHandle.length >= 3 && !isCheckingUsername && usernameStatus.isAvailable === true;

  return (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center min-h-[85vh] py-6 z-10">
      
      {/* Wizard Step Progress Header */}
      <div className="w-full max-w-sm mb-6 flex items-center justify-between px-2">
        {[
          { num: 1, label: 'Name' },
          { num: 2, label: 'Handle' },
          { num: 3, label: 'Appearance' }
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
              step === s.num 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40' 
                : step > s.num 
                ? 'bg-emerald-500 text-white' 
                : 'bg-slate-200 text-slate-500'
            }`}>
              {step > s.num ? <Check size={14} /> : s.num}
            </div>
            <span className={`text-xs font-semibold ${step === s.num ? 'text-slate-800' : 'text-slate-400'}`}>
              {s.label}
            </span>
            {s.num < 3 && <div className="w-6 h-[2px] bg-slate-200/80 rounded-full mx-1" />}
          </div>
        ))}
      </div>

      <GlassCard heavy className="w-full p-6 sm:p-8 text-center space-y-6 shadow-2xl border-white/60 relative overflow-hidden">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <RelayLogoEmblem size={48} />
          <div className="flex items-center gap-1.5 bg-blue-500/10 backdrop-blur-md px-3 py-1 rounded-full border border-blue-400/20">
            <ShieldCheck size={13} className="text-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Relay Setup Wizard</span>
          </div>
        </div>

        {/* Error Notification Banner */}
        {submitError && (
          <div className="p-3.5 bg-red-500/10 border border-red-400/30 text-red-600 text-xs rounded-2xl text-left flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{submitError}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full"
          >
            {/* STEP 1: DISPLAY NAME */}
            {step === 1 && (
              <form onSubmit={handleNextToUsername} className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">What is your display name?</h3>
                  <p className="text-xs text-slate-500">This name will be visible across chats, groups, and communities.</p>
                </div>

                <GlassInput 
                  label="Display Name"
                  placeholder="e.g. Alex Vance"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoFocus
                />

                <GlassButton 
                  type="submit" 
                  disabled={!displayName.trim()} 
                  variant="primary" 
                  className="w-full py-3 text-xs font-bold"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Next: Choose Handle</span>
                    <ArrowRight size={16} />
                  </div>
                </GlassButton>

                {onSignOut && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                    >
                      Sign out / Switch account
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* STEP 2: UNIQUE USERNAME HANDLE */}
            {step === 2 && (
              <form onSubmit={handleNextToAppearance} className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Choose your unique handle</h3>
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

                  {/* Status & Validation Message */}
                  {username.trim() && (
                    <div className="min-h-[20px] flex items-center">
                      {isCheckingUsername ? (
                        <div className="text-[11px] font-medium text-blue-600 flex items-center gap-1.5">
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Checking availability...</span>
                        </div>
                      ) : (
                        <div className={`text-[11px] font-medium flex items-center gap-1.5 ${usernameStatus.isAvailable ? 'text-emerald-600' : 'text-red-500'}`}>
                          {usernameStatus.isAvailable ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                          <span>{usernameStatus.message}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suggested Handles */}
                  {suggestions.length > 0 && (
                    <div className="pt-1 space-y-1.5">
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
                  <GlassButton 
                    type="button" 
                    onClick={() => setStep(1)} 
                    variant="secondary" 
                    className="py-2.5 px-4 text-xs cursor-pointer"
                  >
                    Back
                  </GlassButton>
                  <GlassButton 
                    type="submit" 
                    disabled={!isStep2Valid} 
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span>Next: Appearance Mode</span>
                      <ArrowRight size={16} />
                    </div>
                  </GlassButton>
                </div>

                {onSignOut && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                    >
                      Sign out / Switch account
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* STEP 3: APPEARANCE SELECTION MODE */}
            {step === 3 && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Select Appearance Mode</h3>
                  <p className="text-xs text-slate-500">Choose your preferred theme mode to personalize Relay.</p>
                </div>

                {/* Real-time Theme & Handle Preview */}
                <div 
                  className={`p-4 rounded-2xl border transition-all duration-300 shadow-inner space-y-2.5 ${
                    themeMode === 'dark' 
                      ? 'bg-slate-900 border-slate-700 text-white' 
                      : 'bg-white/80 border-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                        {displayName.trim() ? displayName.trim()[0].toUpperCase() : 'U'}
                      </div>
                      <div>
                        <span className={`font-bold block text-xs ${themeMode === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                          {displayName || 'Display Name'}
                        </span>
                        <span className="text-[11px] text-slate-400 block font-mono">
                          @{cleanHandle || 'handle'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-bold border border-blue-400/20 capitalize">
                      {themeMode} Mode
                    </span>
                  </div>

                  <div 
                    className="p-3 text-white text-[11px] font-medium rounded-xl shadow-xs"
                    style={{
                      backgroundColor: accentColor === 'emerald-frost' ? '#10B981' : accentColor === 'neon-violet' ? '#8B5CF6' : accentColor === 'rose-gold' ? '#F43F5E' : '#2563EB'
                    }}
                  >
                    Welcome to Relay Liquid Glass messaging!
                  </div>
                </div>

                {/* Theme Mode Buttons */}
                <div className="space-y-3">
                  <label className="font-bold text-xs text-slate-700 block">Theme Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'light' as ThemeMode, label: 'Light', icon: Sun },
                      { mode: 'dark' as ThemeMode, label: 'Dark', icon: Moon },
                      { mode: 'system' as ThemeMode, label: 'System', icon: Monitor }
                    ].map(({ mode, label, icon: Icon }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setThemeMode(mode)}
                        className={`py-3 px-2 rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                          themeMode === mode 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-400/40' 
                            : 'bg-white/80 hover:bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon size={16} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color Palette */}
                <div className="space-y-2">
                  <label className="font-bold text-xs text-slate-700 block">Accent Color</label>
                  <div className="flex gap-2.5">
                    {[
                      { id: 'liquid-azure', color: '#2563EB', name: 'Azure' },
                      { id: 'emerald-frost', color: '#10B981', name: 'Emerald' },
                      { id: 'neon-violet', color: '#8B5CF6', name: 'Violet' },
                      { id: 'rose-gold', color: '#F43F5E', name: 'Rose' }
                    ].map((ac) => (
                      <button
                        key={ac.id}
                        type="button"
                        onClick={() => setAccentColor(ac.id as AccentColor)}
                        className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-all ${
                          accentColor === ac.id ? 'border-slate-800 scale-110 shadow-sm' : 'border-white/80 hover:scale-105'
                        }`}
                        style={{ backgroundColor: ac.color }}
                        title={ac.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex gap-3 pt-2">
                  <GlassButton 
                    type="button" 
                    onClick={() => setStep(2)} 
                    disabled={isSubmitting}
                    variant="secondary" 
                    className="py-2.5 px-4 text-xs cursor-pointer"
                  >
                    Back
                  </GlassButton>
                  <GlassButton 
                    type="button"
                    onClick={handleFinalizeOnboarding} 
                    disabled={isSubmitting}
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="animate-spin mx-auto" size={16} />
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Get Started</span>
                        <Sparkles size={16} />
                      </div>
                    )}
                  </GlassButton>
                </div>

                {onSignOut && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                    >
                      Sign out / Switch account
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

      </GlassCard>
    </div>
  );
};
