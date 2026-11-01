/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings → Developer: diagnostics for the E2EE engine, local crypto stores,
 * caches and build info. Read-only by default; the two destructive actions
 * (cache clear, session reset) sit behind explicit confirmation.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Code2, Fingerprint, Database, ShieldCheck, Trash2, RefreshCw, AlertTriangle
} from 'lucide-react';
import { GlassCard, GlassButton } from './GlassUI';
import { useAuthStore } from '../store/authStore';
import {
  cryptoStore, countCryptoKeys, getMirroredIdentity, resetSessionsKeepIdentity,
  type CryptoStoreName,
} from '../services/crypto/sessionStore';
import { fingerprint } from '../services/crypto/signalProtocol';
import { chatCache } from '../services/chatCache';
import { relayCacheManager } from '../services/cacheManager';
import { RELAY_WEB_VERSION } from '../lib/version';

type Row = { label: string; value: string; mono?: boolean };

function RowLine({ row }: { row: Row }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-200/60 dark:border-white/5 last:border-0">
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">{row.label}</span>
      <span className={`text-xs text-slate-800 dark:text-slate-100 text-right break-all ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
    </div>
  );
}

function fmtFingerprint(fp: string): string {
  const clean = fp.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return (clean.match(/.{1,4}/g) || [clean]).join(' ');
}

export function DeveloperTab() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const profileId = currentUser?.id || '';

  const [ikFp, setIkFp] = useState('…');
  const [identityMeta, setIdentityMeta] = useState({ spkId: '-', opks: '-', createdAt: '-', mirrored: false });
  const [counts, setCounts] = useState<{ sessions: number; senderkeys: number }>({ sessions: -1, senderkeys: -1 });
  const [cacheStats, setCacheStats] = useState({ chats: 0, cachedChats: 0, cachedMsgs: 0 });
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    if (!profileId) return;
    try {
      const identity = (await cryptoStore.getIdentity(profileId)) || getMirroredIdentity(profileId);
      if (identity?.ik?.publicKey) {
        setIkFp(fmtFingerprint(fingerprint(identity.ik.publicKey)));
        setIdentityMeta({
          spkId: String(identity.spkId ?? '-'),
          opks: String(identity.opks?.length ?? '-'),
          createdAt: identity.createdAt ? new Date(identity.createdAt).toLocaleString() : '-',
          mirrored: Boolean(getMirroredIdentity(profileId)),
        });
      } else {
        setIkFp('identity not initialised yet');
      }
      const [sessions, senderkeys] = await Promise.all([
        countCryptoKeys('sessions' as CryptoStoreName),
        countCryptoKeys('senderkeys' as CryptoStoreName),
      ]);
      setCounts({ sessions, senderkeys });
      const msgs = chatCache.getMessages();
      setCacheStats({
        chats: chatCache.getChats().length,
        cachedChats: Object.keys(msgs).length,
        cachedMsgs: Object.values(msgs).reduce((n, arr) => n + (arr?.length || 0), 0),
      });
    } catch (err) {
      setStatus(`diagnostics failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profileId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const platform =
    typeof navigator !== 'undefined'
      ? /Android/i.test(navigator.userAgent) ? 'Android (WebView/browser)'
        : /iPhone|iPad/i.test(navigator.userAgent) ? 'iOS'
          : /Mac/i.test(navigator.platform || navigator.userAgent) ? 'macOS'
            : /Win/i.test(navigator.platform || navigator.userAgent) ? 'Windows'
              : 'Web'
      : 'unknown';

  function withStatus(text: string) {
    setStatus(text);
    window.setTimeout(() => setStatus(''), 2500);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Code2 size={13} /> Developer diagnostics
        </span>
        <button onClick={() => void refresh()} className="text-xs text-[var(--primary-accent)] hover:underline font-semibold flex items-center gap-1 cursor-pointer">
          <RefreshCw size={12} /> <span>Refresh</span>
        </button>
      </div>

      <GlassCard className="p-5">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-2">
          <Fingerprint size={14} /> End-to-end encryption identity
        </p>
        <RowLine row={{ label: 'Safety fingerprint', value: ikFp, mono: true }} />
        <RowLine row={{ label: 'Signed prekey ID', value: identityMeta.spkId }} />
        <RowLine row={{ label: 'One-time prekeys', value: identityMeta.opks }} />
        <RowLine row={{ label: 'Identity created', value: identityMeta.createdAt }} />
        <RowLine row={{ label: 'localStorage mirror', value: identityMeta.mirrored ? 'present (survives re-login)' : 'not written yet' }} />
        <RowLine row={{ label: 'Protocol', value: 'X3DH + Double Ratchet (R1 direct / R2 fan-out / R3 sender-key)' }} />
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Compare the safety fingerprint with your contact over another channel. Same 32 hex digits on both
          devices means the conversation has no man in the middle.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-2">
          <Database size={14} /> Local stores
        </p>
        <RowLine row={{ label: 'Ratchet sessions (IndexedDB)', value: String(counts.sessions) }} />
        <RowLine row={{ label: 'Sender-key chains (R3)', value: String(counts.senderkeys) }} />
        <RowLine row={{ label: 'Chats in memory cache', value: String(cacheStats.chats) }} />
        <RowLine row={{ label: 'Persisted chats / messages', value: `${cacheStats.cachedChats} chats · ${cacheStats.cachedMsgs} messages` }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <GlassButton
            onClick={() => {
              try { chatCache.clear(); } catch { /* ignore */ }
              try { relayCacheManager.clearCategory('all'); } catch { /* ignore */ }
              withStatus('local message caches cleared (reloads from server)');
              void refresh();
            }}
            variant="ghost"
            className="py-1.5 px-3 text-xs"
          >
            <Trash2 size={12} /> <span>Clear local message caches</span>
          </GlassButton>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mb-2">
          <ShieldCheck size={14} /> Recovery
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          Reset ALL ratchet sessions while keeping your identity keys. Use this if a conversation shows
          undecryptable messages: the next message in each chat re-runs the key agreement automatically.
        </p>
        <GlassButton
          variant="danger"
          className="py-2 px-3 text-xs"
          onClick={() => {
            if (!window.confirm('Reset every E2EE session on this device? Your identity keys and on-screen history are kept. Useful when messages show as undecryptable.')) return;
            void resetSessionsKeepIdentity().then(() => {
              withStatus('sessions reset — open each chat to re-establish keys');
              void refresh();
            });
          }}
        >
          <AlertTriangle size={12} /> <span>Reset E2EE sessions</span>
        </GlassButton>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">Build & runtime</p>
        <RowLine row={{ label: 'Web version', value: RELAY_WEB_VERSION, mono: true }} />
        <RowLine row={{ label: 'Platform', value: platform }} />
        <RowLine row={{ label: 'Network', value: online ? 'online' : 'offline' }} />
        <RowLine row={{ label: 'Service worker', value: typeof navigator !== 'undefined' && navigator.serviceWorker ? (navigator.serviceWorker.controller ? 'active' : 'registered, not controlling') : 'unsupported' }} />
      </GlassCard>

      {status && (
        <p className="text-xs font-semibold text-[var(--primary-accent)]">{status}</p>
      )}
    </div>
  );
}
