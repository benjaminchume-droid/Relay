/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relay identity pages — /login /signin /signup /auth.
 * Liquid-glass auth surface matching the in-app design system, with:
 *  - per-button spinners (button locks while busy so it can't be double-clicked)
 *  - signup → 6-digit OTP paste flow (auto-submits when the 6th digit lands)
 *  - email-code sign-in, Google OAuth, password reset handoff, native app bridge
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound, Mail, Lock,
  ArrowRight, RefreshCw, ShieldCheck, LogOut,
} from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { notifyNativeSession, isInAppWebView } from '../lib/nativeBridge';
import { getAuthRedirectUrl, getPublicWebOrigin } from '../services/googleAuth';
import { useThemeStore, applyThemeVars } from '../store/themeStore';
import { GlassCard, GlassInput, GlassButton, AmbientLiquidBackground, RelayLogoEmblem } from '../components/GlassUI';

type Mode = 'signin' | 'signup' | 'otp-send' | 'otp-verify' | 'forgot' | 'new-password';
type BusyKey = null | 'password' | 'google' | 'otp-send' | 'otp-verify' | 'resend' | 'forgot';
type OtpType = 'signup' | 'email' | 'recovery';

const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg className={`animate-spin shrink-0 ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Loading">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-95" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

export default function WebLoginPage({ initialMode }: { initialMode?: 'signin' | 'signup' }) {
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const native = params.get('native') === '1' || isInAppWebView();
  const autoGoogle = params.get('provider') === 'google';
  const modeParam = params.get('mode');

  const [mode, setMode] = useState<Mode>(
    modeParam === 'signup' ? 'signup'
      : modeParam === 'signin' ? 'signin'
      : modeParam === 'otp' ? 'otp-send'
      : (initialMode || 'signin'),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);

  // OTP state — shared by signup confirmation, email-code sign-in AND the
  // password-reset code (the recovery email now carries a 6-digit code).
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpType, setOtpType] = useState<OtpType>('signup');
  const [resendIn, setResendIn] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [busy, setBusy] = useState<BusyKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isVerify = mode === 'otp-verify';
  const pendingEmail = useMemo(
    () => localStorage.getItem('relay_pending_auth_email') || email,
    [email, mode],
  );

  const title = useMemo(() => {
    if (mode === 'signup') return 'Create Relay Account';
    if (mode === 'otp-verify') return otpType === 'recovery' ? 'Enter Reset Code' : 'Enter Verification Code';
    if (mode === 'otp-send') return 'Sign in with email code';
    if (mode === 'forgot') return 'Reset your password';
    if (mode === 'new-password') return 'Set a new password';
    return 'Sign In to Relay';
  }, [mode, otpType]);

  const subtitle = useMemo(() => {
    if (mode === 'signup') return 'Sign up with email to build your secure identity.';
    if (mode === 'otp-verify') return otpType === 'recovery'
      ? `Paste the 6-digit reset code we emailed to ${pendingEmail || 'your email'}.`
      : `Paste the 6-digit code sent to ${pendingEmail || 'your email'}.`;
    if (mode === 'otp-send') return "We'll email you a one-time code — no password needed.";
    if (mode === 'forgot') return "We'll email you a 6-digit reset code. Enter it here to set a new password.";
    if (mode === 'new-password') return 'Choose a new password for your account (min 8 characters).';
    return 'Enter your email or handle and password.';
  }, [mode, pendingEmail, otpType]);

  // Theme boot — mirror the app's saved light/dark/accent before first paint.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('relay_theme_customization');
      if (raw) useThemeStore.getState().updateCustomization(JSON.parse(raw));
      else applyThemeVars(useThemeStore.getState().customization);
    } catch {
      applyThemeVars(useThemeStore.getState().customization);
    }
  }, []);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const startResendCooldown = () => setResendIn(60);

  // Complete OAuth / magic-link session if Supabase put tokens in the URL.
  // The client's detectSessionInUrl exchange is async — poll briefly and also
  // listen for SIGNED_IN so the redirect never dead-ends on the form.
  useEffect(() => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const check = async () => {
      if (settled) return;
      attempts += 1;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          settled = true;
          await finish(data.session.access_token, data.session.refresh_token);
          return;
        }
      } catch { /* ignore */ }
      if (attempts < 8) pollTimer = setTimeout(check, 400);
    };
    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!settled && session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        settled = true;
        void finish(session.access_token, session.refresh_token);
      }
    });

    return () => {
      settled = true;
      if (pollTimer) clearTimeout(pollTimer);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native handoff: open Google immediately when ?provider=google
  useEffect(() => {
    if (autoGoogle && !busy) {
      void onGoogle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGoogle]);

  async function finish(access_token: string, refresh_token: string) {
    try { localStorage.removeItem('relay_pending_auth_email'); } catch { /* ignore */ }
    notifyNativeSession({ access_token, refresh_token });
    if (native) {
      // Hand the session back to the app. Custom-scheme navigation can fail
      // (ERR_UNKNOWN_URL_SCHEME) when the app is not installed on this device,
      // so we NEVER hard-navigate: try it, then leave a clean, token-free
      // return screen the user can act on.
      setInfo('Signed in. Return to the Relay app — session was handed off.');
      try { window.location.replace(`relay://login#access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}`); } catch { /* ignore */ }
      return;
    }
    setInfo('Signed in. Taking you into Relay…');
    if (next.startsWith('/')) {
      window.setTimeout(() => window.location.assign(next), 400);
    }
  }

  function friendly(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('user already registered') || m.includes('already been registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (m.includes('invalid login credentials')) return 'Wrong email or password. Please try again.';
    if (m.includes('email not confirmed')) return 'Your email is not confirmed yet — enter the code we emailed you.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute.';
    if (m.includes('token has expired') || m.includes('otp expired')) return 'That code expired. Tap "Resend code" for a fresh one.';
    if (m.includes('invalid otp') || m.includes('invalid token')) return 'That code is invalid or already used. Check the latest email or resend.';
    return msg || 'Something went wrong. Please try again.';
  }

  // ------------------------------------------------------------ handlers
  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    setBusy('password');
    try {
      if (mode === 'new-password') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (password !== confirm) throw new Error('Passwords do not match.');
        const { data: upd, error: upErr } = await supabase.auth.updateUser({ password });
        if (upErr) throw upErr;
        if (upd?.user) {
          await finish(upd.user.id ? (await supabase.auth.getSession()).data.session!.access_token : '', (await supabase.auth.getSession()).data.session!.refresh_token);
        }
        return;
      }
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (password !== confirm) throw new Error('Passwords do not match.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (err) throw err;
        try { localStorage.setItem('relay_pending_auth_email', email.trim()); } catch { /* ignore */ }
        if (data.session) {
          await finish(data.session.access_token, data.session.refresh_token);
        } else {
          // Straight to the paste-the-code screen — no dead end.
          setOtpDigits(['', '', '', '', '', '']);
          setOtpType('signup');
          setMode('otp-verify');
          startResendCooldown();
          setInfo(`Account created. We emailed a 6-digit code to ${email.trim()}.`);
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          if ((err.message || '').toLowerCase().includes('email not confirmed')) {
            try { localStorage.setItem('relay_pending_auth_email', email.trim()); } catch { /* ignore */ }
            setOtpDigits(['', '', '', '', '', '']);
            setOtpType('signup');
            setMode('otp-verify');
            startResendCooldown();
            setInfo('Your email is not confirmed yet — enter the 6-digit code we sent.');
            return;
          }
          throw err;
        }
        if (!data.session) throw new Error('No session');
        await finish(data.session.access_token, data.session.refresh_token);
      }
    } catch (err: any) {
      setError(friendly(err?.message));
    } finally {
      setBusy(null);
    }
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    setBusy('otp-send');
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: getAuthRedirectUrl() },
      });
      if (err) throw err;
      try { localStorage.setItem('relay_pending_auth_email', email.trim()); } catch { /* ignore */ }
      setOtpDigits(['', '', '', '', '', '']);
      setOtpType('email');
      setMode('otp-verify');
      startResendCooldown();
      setInfo(`Check ${email.trim()} for a 6-digit code.`);
    } catch (err: any) {
      setError(friendly(err?.message));
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode(code: string) {
    if (!code || code.length !== 6) return;
    setError(null); setInfo(null);
    setBusy('otp-verify');
    try {
      const target = (pendingEmail || email).trim();
      let session: any = null;
      let lastErr: any = null;
      const types: OtpType[] = otpType === 'recovery' ? ['recovery'] : [otpType, otpType === 'signup' ? 'email' : 'signup'];
      for (const type of types) {
        const { data, error: err } = await supabase.auth.verifyOtp({ email: target, token: code, type });
        if (!err && data?.session) { session = data; break; }
        lastErr = err;
      }
      if (!session) throw lastErr || new Error('Invalid code');
      if (otpType === 'recovery') {
        // recovery code verified — session is live, now set the new password
        setMode('new-password');
        setInfo('Code verified. Choose your new password.');
        return;
      }
      await finish(session.session.access_token, session.session.refresh_token);
    } catch (err: any) {
      setError(friendly(err?.message));
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setBusy(null);
    }
  }

  async function resendCode() {
    if (resendIn > 0 || busy) return;
    setError(null); setInfo(null);
    setBusy('resend');
    try {
      const target = (pendingEmail || email).trim();
      const { error: err } = otpType === 'email'
        ? await supabase.auth.signInWithOtp({ email: target, options: { shouldCreateUser: false, emailRedirectTo: getAuthRedirectUrl() } })
        : otpType === 'recovery'
          ? await supabase.auth.resetPasswordForEmail(target, { redirectTo: `${getPublicWebOrigin()}/auth?type=recovery` })
          : await supabase.auth.resend({ type: 'signup', email: target });
      if (err) throw err;
      startResendCooldown();
      setInfo('A new code is on its way.');
    } catch (err: any) {
      setError(friendly(err?.message));
    } finally {
      setBusy(null);
    }
  }

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null);
    setBusy('forgot');
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getPublicWebOrigin()}/auth?type=recovery`,
      });
      if (err) throw err;
      try { localStorage.setItem('relay_pending_auth_email', email.trim()); } catch { /* ignore */ }
      setOtpDigits(['', '', '', '', '', '']);
      setOtpType('recovery');
      setMode('otp-verify');
      startResendCooldown();
      setInfo(`Reset code sent to ${email.trim()}. Enter the 6-digit code to set a new password.`);
    } catch (err: any) {
      setError(friendly(err?.message));
    } finally {
      setBusy(null);
    }
  }

  async function onGoogle() {
    setError(null); setInfo(null);
    setBusy('google');
    try {
      const redirectTo = `${getPublicWebOrigin()}/auth${native ? '?native=1' : ''}`;
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (err) throw err;
      if (data?.url && typeof window !== 'undefined') {
        window.location.assign(data.url);
        return; // navigating away — keep the spinner up
      }
      setBusy(null);
    } catch (err: any) {
      setError(friendly(err?.message));
      setBusy(null);
    }
  }

  // ------------------------------------------------------------ OTP input
  const handleDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const digits = [...otpDigits];
    digits[index] = digit;
    setOtpDigits(digits);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    const joined = digits.join('');
    if (joined.length === 6) void verifyCode(joined);
  };

  const handleBackspace = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const digits = ['', '', '', '', '', ''].map((_, i) => pasted[i] || '');
    setOtpDigits(digits);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) void verifyCode(pasted);
  };

  const anyBusy = busy !== null;

  // ------------------------------------------------------------ render
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <AmbientLiquidBackground />
      <GlassCard heavy className="w-full max-w-md p-7 sm:p-9 text-center space-y-5 shadow-2xl relative overflow-hidden z-10">
        {/* Branding */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <RelayLogoEmblem size={52} />
          <div className="flex items-center gap-1.5 bg-blue-500/10 backdrop-blur-md px-3 py-1 rounded-full border border-blue-400/20">
            <ShieldCheck size={13} className="text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Relay Identity System</span>
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{subtitle}</p>
        </div>

        {native && (
          <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
            Opened from the Relay app · session returns to the app after sign-in
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-600 dark:text-red-400 text-xs text-left">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{error}</span>
          </div>
        )}
        {info && (
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-700 dark:text-emerald-400 text-xs text-left">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{info}</span>
          </div>
        )}

        {/* ------------------------------------------- OTP VERIFY SCREEN */}
        {isVerify ? (
          <div className="space-y-5 pt-1">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-3xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-400/20 shadow-inner">
                <KeyRound size={30} />
              </div>
            </div>

            <div className="flex justify-center gap-1.5 sm:gap-2">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { otpRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  disabled={busy === 'otp-verify'}
                  onChange={(e) => handleDigit(index, e.target.value)}
                  onKeyDown={(e) => handleBackspace(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-10 sm:w-11 h-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-mono bg-white/80 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-600/80 rounded-2xl shadow-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all disabled:opacity-60"
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <div className="space-y-3">
              <GlassButton
                type="button"
                variant="primary"
                disabled={anyBusy || otpDigits.join('').length !== 6}
                onClick={() => void verifyCode(otpDigits.join(''))}
                className="w-full py-3 text-xs font-bold"
              >
                {busy === 'otp-verify' ? (
                  <Spinner />
                ) : (
                  <span className="flex items-center justify-center gap-2">Verify &amp; continue <ArrowRight size={15} /></span>
                )}
              </GlassButton>

              <GlassButton
                type="button"
                variant="secondary"
                disabled={anyBusy || resendIn > 0}
                onClick={() => void resendCode()}
                className="w-full py-2.5 text-xs font-semibold"
              >
                {busy === 'resend' ? (
                  <Spinner />
                ) : resendIn > 0 ? (
                  <span>Resend code in {resendIn}s</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><RefreshCw size={13} /> Resend code</span>
                )}
              </GlassButton>

              <button
                type="button"
                onClick={() => {
                  setMode(otpType === 'email' ? 'otp-send' : 'signin');
                  setError(null); setInfo(null);
                  try { localStorage.removeItem('relay_pending_auth_email'); } catch { /* ignore */ }
                }}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
              >
                <LogOut size={12} /> Use a different email / method
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ---------------------------------------- PASSWORD FORMS */}
            {mode === 'forgot' ? (
              <form onSubmit={sendResetLink} className="space-y-3.5 text-left">
                <GlassInput
                  type="email"
                  label="Account email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={15} />}
                  autoComplete="email"
                  required
                />
                <GlassButton type="submit" variant="primary" disabled={anyBusy || !email} className="w-full py-3 text-xs font-bold">
                  {busy === 'forgot' ? <Spinner /> : <span className="flex items-center justify-center gap-2">Send reset link <ArrowRight size={15} /></span>}
                </GlassButton>
                <button type="button" className="w-full text-[11px] text-slate-500 dark:text-slate-400 font-medium" onClick={() => { setMode('signin'); setError(null); setInfo(null); }}>
                  ← Back to sign in
                </button>
              </form>
            ) : mode !== 'otp-send' ? (
              <form onSubmit={onPassword} className="space-y-3.5 text-left">
                {mode !== 'new-password' && (
                  <GlassInput
                    type="email"
                    label={mode === 'signup' ? 'Email' : 'Email or @handle'}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    icon={<Mail size={15} />}
                    autoComplete="email"
                    required
                  />
                )}

                <div className="relative">
                  <GlassInput
                    type={showPw ? 'text' : 'password'}
                    label={mode === 'new-password' ? 'New password' : 'Password'}
                    placeholder={mode === 'signup' || mode === 'new-password' ? 'Minimum 8 characters' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock size={15} />}
                    autoComplete={mode === 'signup' || mode === 'new-password' ? 'new-password' : 'current-password'}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-[30px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {(mode === 'signup' || mode === 'new-password') && (
                  <GlassInput
                    type={showPw ? 'text' : 'password'}
                    label="Confirm password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    icon={<Lock size={15} />}
                    autoComplete="new-password"
                    required
                  />
                )}

                {mode === 'signin' && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <GlassButton
                  type="submit"
                  variant="primary"
                  disabled={anyBusy || !password || (mode !== 'new-password' && !email)}
                  className="w-full py-3 text-xs font-bold"
                >
                  {busy === 'password' ? (
                    <Spinner />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      {mode === 'signup' ? 'Create Account' : mode === 'new-password' ? 'Update Password' : 'Sign In'} <ArrowRight size={15} />
                    </span>
                  )}
                </GlassButton>
              </form>
            ) : (
              <form onSubmit={sendOtp} className="space-y-3.5 text-left">
                <GlassInput
                  type="email"
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={15} />}
                  autoComplete="email"
                  required
                />
                <GlassButton type="submit" variant="primary" disabled={anyBusy || !email} className="w-full py-3 text-xs font-bold">
                  {busy === 'otp-send' ? <Spinner /> : <span className="flex items-center justify-center gap-2">Send code <ArrowRight size={15} /></span>}
                </GlassButton>
                <button type="button" className="w-full text-[11px] text-slate-500 dark:text-slate-400 font-medium" onClick={() => setMode('signin')}>
                  ← Back to password sign-in
                </button>
              </form>
            )}

            {/* ---------------------------------------- DIVIDER + GOOGLE */}
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-300/60 dark:bg-slate-700" />or<span className="h-px flex-1 bg-slate-300/60 dark:bg-slate-700" />
            </div>

            <GlassButton
              type="button"
              variant="secondary"
              disabled={anyBusy}
              onClick={() => void onGoogle()}
              className="w-full py-2.5 text-xs font-bold"
            >
              {busy === 'google' ? <Spinner /> : <GoogleIcon />}
              <span>{busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </GlassButton>

            <div className="flex flex-col gap-2 pt-1">
              {mode === 'signin' && (
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => { setMode('otp-send'); setError(null); setInfo(null); }}
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Sign in with an email code instead
                </button>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {mode === 'signup' ? (
                  <>Already have an account?{' '}
                    <button type="button" disabled={anyBusy} onClick={() => { setMode('signin'); setError(null); setInfo(null); }} className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Sign in</button>
                  </>
                ) : (
                  <>Don&apos;t have an account?{' '}
                    <button type="button" disabled={anyBusy} onClick={() => { setMode('signup'); setError(null); setInfo(null); }} className="font-bold text-blue-600 dark:text-blue-400 hover:underline">Create account</button>
                  </>
                )}
              </p>
            </div>
          </>
        )}

        <p className="pt-1 text-[10px] text-slate-400 dark:text-slate-500">
          End-to-end encrypted · Powered by Supabase · <Link to="/" className="hover:underline">Home</Link>
        </p>
      </GlassCard>
    </div>
  );
}
