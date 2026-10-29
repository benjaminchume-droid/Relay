import React, { useEffect, useState } from 'react';
import { joinInvite, resolveInvite, type InviteKind, type InvitePreview } from '../lib/invites';
import { isInAppWebView, notifyNativeJoined, notifyNativeSession } from '../lib/nativeBridge';
import { supabase } from '../lib/supabase/client';

type Props = { kind: InviteKind; token: string };

export function InvitePage({ kind, token }: Props) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [session, setSession] = useState(false);
  const inApp = isInAppWebView();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await resolveInvite(kind, token);
      if (!cancelled) setPreview(p);
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setSession(!!data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
      if (s) notifyNativeSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [kind, token]);

  async function onJoin() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      if (!session) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const res = await joinInvite(preview);
      if (!res.ok) throw new Error(res.error || 'Join failed');
      notifyNativeJoined({ kind: preview.kind, id: preview.targetId, name: preview.name });
      setInfo(inApp ? 'Joined. Returning to Relay…' : 'Joined. Open the Relay app to continue.');
    } catch (e: any) {
      setError(e?.message || 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-200 via-sky-100 to-blue-200">
        <p className="text-sm text-slate-600">Loading invite…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-sky-200 via-sky-100 to-blue-200">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/55 backdrop-blur-xl shadow-xl p-8 text-center">
        {preview.avatarUrl ? (
          <img src={preview.avatarUrl} alt="" className="mx-auto h-16 w-16 rounded-2xl object-cover" />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">
            {(preview.name || '?')[0]?.toUpperCase()}
          </div>
        )}
        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-blue-700">{preview.kind} invite</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{preview.name}</h1>
        {preview.description && <p className="mt-2 text-sm text-slate-600">{preview.description}</p>}
        {typeof preview.memberCount === 'number' && (
          <p className="mt-1 text-xs text-slate-500">{preview.memberCount} members</p>
        )}
        {error && <p className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm p-3 text-left">{error}</p>}
        {info && <p className="mt-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm p-3 text-left">{info}</p>}
        {!preview.valid ? (
          <p className="mt-6 text-sm text-red-600">{preview.error || 'Invalid invite'}</p>
        ) : (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onJoin()}
              className="w-full rounded-2xl bg-gradient-to-b from-sky-400 to-blue-500 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
            >
              {busy ? 'Working…' : session ? 'Join' : 'Sign in to join'}
            </button>
            {!inApp && (
              <p className="text-xs text-slate-500">Open this link in the Relay app for the best experience.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InvitePage;
