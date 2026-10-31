/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * /u/:username — public contact link page. Replaces the old fake
 * "relay.app/u/..." share target: this page actually resolves on the deployed
 * origin, previews the profile, and offers Message (signed in) or sign-in.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Copy, Check, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { getLetterAvatar } from '../lib/avatar';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { getContactShareUrl } from '../lib/authRedirect';

type ResolvedProfile = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
};

export function ContactLinkPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { profile, currentUser } = useAuthStore();
  const createDirectChat = useChatStore((s) => s.createDirectChat);

  const [resolved, setResolved] = useState<ResolvedProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [session, setSession] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const clean = token.replace(/^@/, '').trim();
      if (!clean) { setStatus('missing'); return; }
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean);
      let query = supabase
        .from('profiles')
        .select('id, display_name, full_name, username, avatar_url, bio, status_message')
        .ilike('username', clean)
        .limit(1);
      if (isUuid) {
        // token might be a raw profile id
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, full_name, username, avatar_url, bio, status_message')
          .eq('id', clean)
          .maybeSingle();
        if (data && alive) {
          setResolved({
            id: data.id,
            name: data.display_name || data.full_name || data.username || 'User',
            username: data.username || '',
            avatarUrl: data.avatar_url || undefined,
            bio: data.bio || data.status_message || undefined,
          });
          setStatus('ready');
        }
      }
      const { data } = await query;
      if (!alive) return;
      if (data && data[0]) {
        const row = data[0];
        setResolved({
          id: row.id,
          name: row.display_name || row.full_name || row.username || 'User',
          username: row.username || '',
          avatarUrl: row.avatar_url || undefined,
          bio: row.bio || row.status_message || undefined,
        });
        setStatus('ready');
      } else if (!isUuid) {
        setStatus('missing');
      }
      const { data: s } = await supabase.auth.getSession();
      if (alive) setSession(!!s.session);
    })();
    return () => { alive = false; };
  }, [token]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getContactShareUrl(resolved?.username || token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard optional */ }
  };

  const handleMessage = async () => {
    if (!session) {
      navigate(`/login?next=${encodeURIComponent(`/u/${token}`)}`);
      return;
    }
    if (!resolved || busy) return;
    setBusy(true);
    setError(null);
    try {
      const chatId = await createDirectChat(resolved.id);
      if (chatId) navigate(`/chat/${chatId}`);
      else setError('Could not open the conversation. Try again.');
    } catch (e: any) {
      setError(e?.message || 'Could not open the conversation. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const isMe = !!resolved && !!profile && (profile as any).id === resolved.id;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-sky-200 via-sky-100 to-[color-mix(in_srgb,var(--primary-accent)_35%,transparent)]">
      <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/60 backdrop-blur-xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 size={22} className="animate-spin text-slate-500" />
            <p className="text-sm text-slate-600">Loading contact…</p>
          </div>
        )}

        {status === 'missing' && (
          <div className="py-6 space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xl">?</div>
            <h1 className="mt-3 text-xl font-bold text-slate-900">Contact not found</h1>
            <p className="text-sm text-slate-600">No Relay user matches <span className="font-mono">@{token.replace(/^@/, '')}</span>.</p>
          </div>
        )}

        {status === 'ready' && resolved && (
          <>
            <img
              src={resolved.avatarUrl || getLetterAvatar(resolved.name)}
              alt=""
              className="mx-auto w-20 h-20 rounded-3xl object-cover shadow-md ring-2 ring-white/80"
            />
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[var(--relay-accent-hover)]">Relay contact</p>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">{resolved.name}</h1>
            {resolved.username && <p className="text-sm font-mono text-slate-500">@{resolved.username}</p>}
            {resolved.bio && <p className="mt-2 text-sm text-slate-600">{resolved.bio}</p>}

            {error && <p className="mt-4 rounded-xl bg-red-50 text-red-700 text-sm p-3">{error}</p>}

            <div className="mt-6 space-y-2.5">
              {!isMe && (
                <button
                  type="button"
                  disabled={busy || session === false}
                  onClick={() => void handleMessage()}
                  className="w-full rounded-2xl bg-gradient-to-b from-sky-400 to-[var(--primary-accent)] py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : session ? <MessageCircle size={16} /> : <UserPlus size={16} />}
                  {session ? (busy ? 'Opening chat…' : 'Message') : 'Sign in to message'}
                </button>
              )}
              {isMe && (
                <p className="text-xs text-slate-500">This is your own contact link.</p>
              )}
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="w-full rounded-2xl border border-slate-200 bg-white/70 py-3 text-sm font-semibold text-slate-700 hover:bg-white flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {session
                ? `Signed in as @${(currentUser as any)?.username || (profile as any)?.username || 'you'}`
                : 'Open Relay to chat instantly.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ContactLinkPage;
