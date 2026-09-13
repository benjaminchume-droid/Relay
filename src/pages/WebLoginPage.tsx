import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { notifyNativeSession, isInAppWebView } from '../lib/nativeBridge';
import { getAuthRedirectUrl, getPublicWebOrigin } from '../services/googleAuth';

type Mode = 'signin' | 'signup' | 'otp';

export default function WebLoginPage() {
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const native = params.get('native') === '1' || isInAppWebView();
  const autoGoogle = params.get('provider') === 'google';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const title = useMemo(() => {
    if (mode === 'signup') return 'Create Relay Account';
    if (mode === 'otp') return 'Sign in with email code';
    return 'Sign In to Relay';
  }, [mode]);

  // Complete OAuth / magic-link session if Supabase put tokens in the URL
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await finish(data.session.access_token, data.session.refresh_token);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Native handoff: open Google immediately when ?provider=google
  useEffect(() => {
    if (autoGoogle && !busy) {
      void onGoogle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGoogle]);

  async function finish(access_token: string, refresh_token: string) {
    notifyNativeSession({ access_token, refresh_token });
    if (native) {
      setInfo('Signed in. Return to the Relay app — session was handed off.');
      // Deep-link back into the app when possible
      try {
        window.location.href = `relay://login#access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}`;
      } catch {
        /* ignore */
      }
      return;
    }
    setInfo('Signed in. You can return to the Relay app.');
    if (next.startsWith('/')) {
      window.setTimeout(() => window.location.assign(next), 400);
    }
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        if (password !== confirm) throw new Error('Passwords do not match.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (err) throw err;
        if (data.session) await finish(data.session.access_token, data.session.refresh_token);
        else {
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (!data.session) throw new Error('No session');
        await finish(data.session.access_token, data.session.refresh_token);
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: getAuthRedirectUrl() },
      });
      if (err) throw err;
      setOtpSent(true);
      setInfo('Check your email for a 6-digit code.');
    } catch (err: any) {
      setError(err?.message || 'Could not send code');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (err) throw err;
      if (!data.session) throw new Error('Invalid code');
      await finish(data.session.access_token, data.session.refresh_token);
    } catch (err: any) {
      setError(err?.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      // skipBrowserRedirect false on pure web so Supabase navigates;
      // redirect must be HTTPS and listed in Supabase Auth → URL configuration.
      const redirectTo = `${getPublicWebOrigin()}/login${native ? '?native=1' : ''}`;
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
      }
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-sky-200 via-sky-100 to-blue-200">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/55 backdrop-blur-xl shadow-xl p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-600 shadow-lg" />
        <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700">
          Relay Identity System
        </p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {mode === 'signup'
            ? 'Sign up with email to build your secure identity.'
            : mode === 'otp'
              ? "We'll email you a one-time code."
              : 'Enter your email or handle and password.'}
        </p>
        {native && (
          <p className="mt-2 text-[11px] text-blue-700/80">Opened from the Relay app · session returns to the app after sign-in</p>
        )}

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">{error}</p>}
        {info && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-left text-sm text-emerald-700">{info}</p>}

        {mode === 'otp' ? (
          !otpSent ? (
            <form onSubmit={sendOtp} className="mt-6 space-y-3 text-left">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Email
                <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" disabled={busy} className="w-full rounded-2xl bg-gradient-to-b from-sky-400 to-blue-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? 'Sending…' : 'Send code'}
              </button>
              <button type="button" className="w-full text-sm text-blue-600" onClick={() => setMode('signin')}>Back to password</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="mt-6 space-y-3 text-left">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Code
                <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" inputMode="numeric" required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
              </label>
              <button type="submit" disabled={busy} className="w-full rounded-2xl bg-gradient-to-b from-sky-400 to-blue-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={onPassword} className="mt-6 space-y-3 text-left">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {mode === 'signup' ? 'Email' : 'Email or handle'}
              <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Password
              <div className="relative mt-1">
                <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm" type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Your password'} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500" onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            {mode === 'signup' && (
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Confirm
                <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" type={showPw ? 'text' : 'password'} required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
              </label>
            )}
            <button type="submit" disabled={busy} className="w-full rounded-2xl bg-gradient-to-b from-sky-400 to-blue-500 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>
        )}

        {mode !== 'otp' && (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
            </div>
            <button type="button" disabled={busy} onClick={() => void onGoogle()} className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-800">Continue with Google</button>
            <button type="button" className="mt-3 text-sm text-blue-600" onClick={() => { setMode('otp'); setOtpSent(false); }}>Sign in with email code instead</button>
          </>
        )}

        <p className="mt-6 text-sm text-slate-600">
          {mode === 'signup' ? (
            <>Already have an account? <button type="button" className="font-medium text-blue-600" onClick={() => setMode('signin')}>Sign in</button></>
          ) : mode === 'signin' ? (
            <>Don&apos;t have an account? <button type="button" className="font-medium text-blue-600" onClick={() => setMode('signup')}>Create account</button></>
          ) : null}
        </p>
        <p className="mt-4 text-xs text-slate-400">Powered by Supabase · <Link to="/">Home</Link></p>
      </div>
    </div>
  );
}
