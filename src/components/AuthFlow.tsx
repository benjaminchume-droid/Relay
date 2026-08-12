/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck, Check, 
  Sparkles, AlertCircle, RefreshCw, Eye, EyeOff, CheckCircle2, 
  ChevronRight, MailCheck, ExternalLink, KeyRound, User
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassSlider, RelayLogoEmblem } from './GlassUI';
import { useAuthStore, OnboardingStep } from '../store/authStore';
import { AccentColor, WallpaperStyle, BubbleStyle, ThemeMode } from '../types';
import { OnboardingWizard } from './OnboardingWizard';

export const AuthFlow: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { 
    status, currentStep, setStep, signupDraft, unverifiedEmail, logout,
    signUpWithEmail, verifyOtp, resendOtp, signInWithEmail, signInWithGoogle,
    resendVerificationEmail, sendForgotPasswordLink, updateNewPassword,
    saveDisplayNameStep, saveUsernameStep, completeAppearanceStep,
    checkUsernameAvailable, isLoading, error, clearError, resendCooldown
  } = useAuthStore();

  // Form Local Inputs
  const [email, setEmail] = useState(signupDraft.email || '');
  const [password, setPassword] = useState(signupDraft.password || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 6-Digit OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Sign In Local Inputs
  const [loginInput, setLoginInput] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Forgot Password / Reset Local Inputs
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Onboarding Step Inputs
  const [displayName, setDisplayName] = useState(signupDraft.name || '');
  const [username, setUsername] = useState(signupDraft.username || '');
  const [usernameStatus, setUsernameStatus] = useState<{ valid?: boolean; message?: string }>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Keep local inputs in sync with draft without wiping user input while typing
  useEffect(() => {
    if (currentStep === 'DISPLAY_NAME' && signupDraft.name && !displayName) {
      setDisplayName(signupDraft.name);
    }
    if (currentStep === 'USERNAME' && signupDraft.username && !username) {
      setUsername(signupDraft.username);
    }
  }, [currentStep, signupDraft.name, signupDraft.username]);

  // Handle OTP digit box input
  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 6) {
      handleVerifyOtp(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setOtpDigits(newDigits);

    const focusIdx = Math.min(pastedData.length, 5);
    otpInputRefs.current[focusIdx]?.focus();

    if (pastedData.length === 6) {
      handleVerifyOtp(pastedData);
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    clearError();
    const code = codeToVerify || otpDigits.join('');
    if (!code || code.length !== 6) return;
    const ok = await verifyOtp(code);
    const st = useAuthStore.getState().status;
    if (ok && (st === 'AUTHENTICATED' || st === 'READY')) {
      onSuccess();
    }
  };

  // Appearance Customization
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [accentColor, setAccentColor] = useState<AccentColor>('liquid-azure');
  const [chatWallpaper, setChatWallpaper] = useState<WallpaperStyle>('glass-gradient');
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>('edge-glow');
  const [cornerRadius, setCornerRadius] = useState<number>(18);
  const [glassDepth, setGlassDepth] = useState<number>(40);

  // Mail App Open Notification
  const [mailAppMsg, setMailAppMsg] = useState<string | null>(null);

  // Username Availability Real-time check
  useEffect(() => {
    if (!username || currentStep !== 'USERNAME') return;
    const timer = setTimeout(async () => {
      const res = await checkUsernameAvailable(username);
      setUsernameStatus(res);
    }, 250);
    return () => clearTimeout(timer);
  }, [username, currentStep]);

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

  // Open Native Email App
  const handleOpenEmailApp = () => {
    setMailAppMsg(null);
    try {
      if (typeof window !== 'undefined') {
        window.location.href = 'mailto:';
      }
    } catch (e) {
      setMailAppMsg('Please open your mail client to verify your email address.');
    }
  };

  // Handlers
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await signUpWithEmail(email, password, confirmPassword);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await signInWithEmail(loginInput, loginPassword);
    const st = useAuthStore.getState().status;
    if (ok && (st === 'AUTHENTICATED' || st === 'READY')) {
      onSuccess();
    }
  };

  const handleSendForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await sendForgotPasswordLink(forgotEmail);
    if (ok) {
      setForgotSent(true);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await updateNewPassword(newPassword, confirmNewPassword);
    const st = useAuthStore.getState().status;
    if (ok && (st === 'AUTHENTICATED' || st === 'READY')) {
      onSuccess();
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await saveDisplayNameStep(displayName);
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await saveUsernameStep(username);
  };

  const handleCompleteAppearance = async () => {
    clearError();
    await completeAppearanceStep({
      themeMode,
      accentColor,
      chatWallpaper,
      bubbleStyle,
      cornerRadius,
      glassDepth
    });
    const st = useAuthStore.getState().status;
    if (st === 'AUTHENTICATED' || st === 'READY') {
      onSuccess();
    }
  };

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const passwordStrength = getPasswordStrength(password);

  // Render OnboardingWizard for onboarding steps
  if (status === 'NEEDS_SETUP' || status === 'ONBOARDING_REQUIRED' || ['DISPLAY_NAME', 'USERNAME', 'APPEARANCE'].includes(currentStep)) {
    return (
      <OnboardingWizard
        initialDisplayName={signupDraft.name || ''}
        initialUsername={signupDraft.username || ''}
        onComplete={onSuccess}
        onSignOut={logout}
      />
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-4 flex flex-col items-center justify-center min-h-[85vh] py-6 z-10">
      
      <AnimatePresence mode="wait">
        <motion.div 
          key={currentStep}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="w-full"
        >
          <GlassCard heavy className="w-full p-6 sm:p-8 text-center space-y-6 shadow-2xl border-white/60 relative overflow-hidden">
            
            {/* Header Branding */}
            <div className="flex flex-col items-center justify-center space-y-2">
              <RelayLogoEmblem size={52} />
              <div className="flex items-center gap-1.5 bg-blue-500/10 backdrop-blur-md px-3 py-1 rounded-full border border-blue-400/20">
                <ShieldCheck size={13} className="text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Relay Identity System</span>
              </div>
            </div>

            {/* Error Notification Banner */}
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-400/30 text-red-600 text-xs rounded-2xl text-left flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>
            )}



            {/* 1. SCREEN: CREATE_ACCOUNT */}
            {currentStep === 'CREATE_ACCOUNT' && (
              <form onSubmit={handleSignUp} className="space-y-4 text-left">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-slate-800">Create Relay Account</h2>
                  <p className="text-xs text-slate-500">Sign up with email to build your secure identity.</p>
                </div>

                <div className="space-y-3">
                  <GlassInput 
                    type="email"
                    label="Email Address"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />

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
                </div>

                <div className="pt-2 space-y-3">
                  <GlassButton 
                    type="submit" 
                    disabled={isLoading || !email || !password || !confirmPassword} 
                    variant="primary" 
                    className="w-full py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : <span>Create Account</span>}
                  </GlassButton>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400">or</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <GlassButton 
                    type="button"
                    onClick={() => signInWithGoogle()}
                    disabled={isLoading}
                    variant="secondary"
                    className="w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-slate-200"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </GlassButton>

                  <div className="text-center pt-2">
                    <button 
                      type="button"
                      onClick={() => setStep('SIGN_IN')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                    >
                      Already have an account? Sign in
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* 2. SCREEN: VERIFY_EMAIL (6-Digit OTP Verification) */}
            {currentStep === 'VERIFY_EMAIL' && (
              <div className="space-y-5 text-center py-2">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-3xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-400/20 shadow-inner">
                    <KeyRound size={32} />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-slate-800">Enter Verification Code</h2>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                    We've sent a 6-digit code to <strong className="text-slate-800 font-semibold">{unverifiedEmail || email || signupDraft.email}</strong>.
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Enter the code below to confirm your email and build your identity.
                  </p>
                </div>

                {/* 6-Digit Box Inputs */}
                <div className="flex justify-center gap-1.5 sm:gap-2 py-2">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-10 sm:w-11 h-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-mono bg-white/80 border border-slate-300/80 rounded-2xl shadow-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <div className="space-y-3 pt-2">
                  <GlassButton 
                    type="button" 
                    onClick={() => handleVerifyOtp()}
                    disabled={isLoading || otpDigits.join('').length !== 6}
                    variant="primary" 
                    className="w-full py-3 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <RefreshCw className="animate-spin mx-auto" size={16} />
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Verify Code</span>
                        <ArrowRight size={16} />
                      </div>
                    )}
                  </GlassButton>

                  <GlassButton 
                    type="button" 
                    onClick={() => resendOtp()}
                    disabled={isLoading || resendCooldown > 0}
                    variant="secondary" 
                    className="w-full py-2.5 text-xs font-medium cursor-pointer"
                  >
                    {resendCooldown > 0 ? (
                      <span>Resend Code in {resendCooldown}s</span>
                    ) : isLoading ? (
                      <RefreshCw className="animate-spin mx-auto" size={16} />
                    ) : (
                      <span>Resend Code</span>
                    )}
                  </GlassButton>

                  <button 
                    type="button"
                    onClick={() => {
                      setOtpDigits(['', '', '', '', '', '']);
                      setStep('CREATE_ACCOUNT');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-medium block mx-auto pt-1 cursor-pointer"
                  >
                    Change Email Address
                  </button>
                </div>
              </div>
            )}

            {/* 3. SCREEN: DISPLAY_NAME */}
            {currentStep === 'DISPLAY_NAME' && (
              <form onSubmit={handleSaveDisplayName} className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">What is your display name?</h3>
                  <p className="text-xs text-slate-500">This name will be visible in chats and communities.</p>
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
                  disabled={isLoading || !displayName.trim()} 
                  variant="primary" 
                  className="w-full py-3 text-xs font-bold"
                >
                  {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : (
                    <div className="flex items-center justify-center gap-2">
                      <span>Next: Choose Username</span>
                      <ArrowRight size={16} />
                    </div>
                  )}
                </GlassButton>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    Sign out / Switch account
                  </button>
                </div>
              </form>
            )}

            {/* 4. SCREEN: USERNAME */}
            {currentStep === 'USERNAME' && (
              <form onSubmit={handleSaveUsername} className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Choose your handle</h3>
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
                  <GlassButton 
                    type="button" 
                    onClick={() => setStep('DISPLAY_NAME')} 
                    variant="secondary" 
                    className="py-2.5 px-4 text-xs"
                  >
                    Back
                  </GlassButton>
                  <GlassButton 
                    type="submit" 
                    disabled={isLoading || !username || !usernameStatus.valid} 
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Next: Appearance</span>
                        <ArrowRight size={16} />
                      </div>
                    )}
                  </GlassButton>
                </div>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    Sign out / Switch account
                  </button>
                </div>
              </form>
            )}

            {/* 5. SCREEN: APPEARANCE */}
            {currentStep === 'APPEARANCE' && (
              <div className="space-y-5 text-left">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Customize Appearance</h3>
                  <p className="text-xs text-slate-500">Personalize your Relay Liquid Glass aesthetic.</p>
                </div>

                {/* Real-time Aesthetic Preview */}
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
                        <span className="text-[10px] text-slate-400">Live Appearance Preview</span>
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
                    Welcome to my custom Relay Glass workspace!
                  </div>
                </div>

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
                    <label className="font-bold text-slate-700 block mb-1">Accent Color</label>
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
                  <GlassButton 
                    type="button" 
                    onClick={() => setStep('USERNAME')} 
                    variant="secondary" 
                    className="py-2.5 px-4 text-xs"
                  >
                    Back
                  </GlassButton>
                  <GlassButton 
                    type="button"
                    onClick={handleCompleteAppearance} 
                    disabled={isLoading}
                    variant="primary" 
                    className="flex-1 py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : <span>Complete & Enter Relay</span>}
                  </GlassButton>
                </div>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-[11px] text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    Sign out / Switch account
                  </button>
                </div>
              </div>
            )}

            {/* 6. SCREEN: SIGN_IN */}
            {currentStep === 'SIGN_IN' && (
              <form onSubmit={handleSignIn} className="space-y-4 text-left">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-slate-800">Sign In to Relay</h2>
                  <p className="text-xs text-slate-500">Enter your email or handle and password.</p>
                </div>

                <div className="space-y-3">
                  <GlassInput 
                    label="Email or Username Handle"
                    placeholder="you@example.com or @handle"
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
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

                  <div className="text-right">
                    <button 
                      type="button"
                      onClick={() => setStep('FORGOT_PASSWORD')}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <GlassButton 
                    type="submit" 
                    disabled={isLoading || !loginInput || !loginPassword} 
                    variant="primary" 
                    className="w-full py-3 text-xs font-bold"
                  >
                    {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : <span>Sign In</span>}
                  </GlassButton>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400">or</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <GlassButton 
                    type="button"
                    onClick={() => signInWithGoogle()}
                    disabled={isLoading}
                    variant="secondary"
                    className="w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-slate-200"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </GlassButton>

                  <div className="text-center pt-2">
                    <button 
                      type="button"
                      onClick={() => setStep('CREATE_ACCOUNT')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                    >
                      Don't have an account? Create account
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* 7. SCREEN: FORGOT_PASSWORD */}
            {currentStep === 'FORGOT_PASSWORD' && (
              <div className="space-y-4 text-left">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-slate-800">Reset Your Password</h2>
                  <p className="text-xs text-slate-500">We'll send a password reset link to your email.</p>
                </div>

                {forgotSent ? (
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 text-center space-y-2 my-2">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                    <p className="text-xs font-bold">Password Reset Link Sent</p>
                    <p className="text-[11px] leading-relaxed text-emerald-700">
                      We've sent a password reset link to <strong className="font-bold">{forgotEmail}</strong>. Tap the link in your email to set a new password.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSendForgot} className="space-y-4">
                    <GlassInput 
                      type="email"
                      label="Account Email Address"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoFocus
                    />

                    <GlassButton 
                      type="submit" 
                      disabled={isLoading || !forgotEmail || !forgotEmail.includes('@')} 
                      variant="primary" 
                      className="w-full py-3 text-xs font-bold"
                    >
                      {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : <span>Send Reset Link</span>}
                    </GlassButton>
                  </form>
                )}

                <div className="text-center pt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setForgotSent(false);
                      setStep('SIGN_IN');
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 font-bold"
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}

            {/* 8. SCREEN: NEW_PASSWORD */}
            {currentStep === 'NEW_PASSWORD' && (
              <form onSubmit={handleUpdatePassword} className="space-y-4 text-left">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-slate-800">Set New Password</h2>
                  <p className="text-xs text-slate-500">Enter a strong new password for your Relay account.</p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <GlassInput 
                      type={showNewPassword ? 'text' : 'password'}
                      label="New Password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoFocus
                    />
                    <button 
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <GlassInput 
                    type="password"
                    label="Confirm New Password"
                    placeholder="Repeat new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </div>

                <GlassButton 
                  type="submit" 
                  disabled={isLoading || !newPassword || newPassword.length < 8 || newPassword !== confirmNewPassword} 
                  variant="primary" 
                  className="w-full py-3 text-xs font-bold"
                >
                  {isLoading ? <RefreshCw className="animate-spin mx-auto" size={16} /> : <span>Update Password</span>}
                </GlassButton>
              </form>
            )}

          </GlassCard>
        </motion.div>
      </AnimatePresence>

    </div>
  );
};
