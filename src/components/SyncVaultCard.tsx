/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Developer tab → Encrypted cloud sync card.
 *
 * Zero-knowledge vault: a passphrase-wrapped universal key born on this
 * device, per-space channel keys, and a fresh temporary key per record.
 * The server stores wrapped keys + ciphertext only — it can never decrypt.
 * Backend tables come from supabase/migrations/20261101120000_sync_vault.sql.
 */

import { useCallback, useEffect, useState } from 'react';
import { CloudUpload, CloudDownload, Lock, LockOpen, KeyRound, RefreshCw } from 'lucide-react';
import { GlassCard, GlassButton } from './GlassUI';
import { useThemeStore } from '../store/themeStore';
import {
  changePassphrase,
  getVaultMeta,
  isMissingTableError,
  lockVault,
  setupVault,
  unlockVault,
  vaultGet,
  vaultPut,
  type VaultMeta,
} from '../lib/sync/vault';
import type { AppearanceCustomization } from '../types';

const SETTINGS_SPACE = 'app_settings';
const APPEARANCE_RECORD = 'appearance';

export function SyncVaultCard() {
  const customization = useThemeStore((s) => s.customization);
  const updateCustomization = useThemeStore((s) => s.updateCustomization);

  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [backendNote, setBackendNote] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      setMeta(await getVaultMeta());
      setBackendNote('');
    } catch (err) {
      if (isMissingTableError(err)) {
        setMeta({ status: 'missing', createdAt: null, updatedAt: null });
        setBackendNote(
          'Sync tables are not on the backend yet — run supabase/migrations/20261101120000_sync_vault.sql in the Supabase SQL editor (or send me a management token for the Relay project and I will apply it).',
        );
      } else {
        setMeta(null);
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function hint(text: string) {
    setStatus(text);
    window.setTimeout(() => setStatus(''), 3200);
  }

  async function guarded(fn: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await fn();
      hint(done);
      await refresh();
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err ?? '');
      hint(/decrypt|auth/i.test(text) && meta?.status === 'locked'
        ? 'Wrong passphrase — try again.'
        : text);
    } finally {
      setBusy(false);
    }
  }

  const onSetup = () => {
    if (pass.length < 8) return hint('Passphrase needs at least 8 characters.');
    if (pass !== pass2) return hint('The two passphrases do not match.');
    void guarded(async () => {
      await setupVault(pass);
      await vaultPut(SETTINGS_SPACE, APPEARANCE_RECORD, customization);
      setPass(''); setPass2('');
    }, 'Encrypted sync is on — first backup uploaded.');
  };

  const onUnlock = () => {
    void guarded(async () => {
      await unlockVault(pass);
      setPass('');
    }, 'Vault unlocked.');
  };

  const onBackup = () => {
    void guarded(async () => {
      await vaultPut(SETTINGS_SPACE, APPEARANCE_RECORD, customization);
    }, 'Appearance backed up (end-to-end encrypted).');
  };

  const onRestore = () => {
    void guarded(async () => {
      const snapshot = await vaultGet<AppearanceCustomization>(SETTINGS_SPACE, APPEARANCE_RECORD);
      if (!snapshot) return hint('No appearance backup found yet — press "Back up now" first.');
      updateCustomization(snapshot);
    }, 'Appearance restored from your encrypted backup.');
  };

  const onChange = () => {
    if (newPass.length < 8) return hint('New passphrase needs at least 8 characters.');
    void guarded(async () => {
      await changePassphrase(currentPass, newPass);
      setCurrentPass(''); setNewPass(''); setShowChange(false);
    }, 'Passphrase changed — data re-wrapped in place.');
  };

  const statusLabel = !meta
    ? 'checking…'
    : meta.status === 'missing'
      ? 'not set up'
      : meta.status === 'locked'
        ? 'locked'
        : 'unlocked';

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <KeyRound size={14} /> Encrypted cloud sync (zero-knowledge)
        </p>
        <button
          onClick={() => { void refresh(); }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="Refresh vault status"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
        Your universal key is generated on this device and wrapped with your sync passphrase
        (PBKDF2-SHA-256, 650k iterations). Every record gets a fresh temporary key that only opens
        through this channel. The server stores wrapped keys + ciphertext and can read nothing.
      </p>

      <div className="space-y-1 mb-3">
        <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-200/60 dark:border-white/5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">Vault</span>
          <span className={`text-xs text-right ${meta?.status === 'unlocked' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>{statusLabel}</span>
        </div>
        {meta?.createdAt && (
          <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-200/60 dark:border-white/5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">Created</span>
            <span className="text-xs text-slate-800 dark:text-slate-100 text-right">{new Date(meta.createdAt).toLocaleString()}</span>
          </div>
        )}
        {meta?.updatedAt && (
          <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-200/60 dark:border-white/5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">Last key change</span>
            <span className="text-xs text-slate-800 dark:text-slate-100 text-right">{new Date(meta.updatedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {backendNote && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          {backendNote}
        </div>
      )}

      {status && (
        <p className="mb-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200">{status}</p>
      )}

      {meta?.status === 'missing' && !backendNote && (
        <div className="space-y-2">
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Sync passphrase (min 8 characters)"
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
          />
          <input
            type="password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            placeholder="Repeat passphrase"
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
          />
          <GlassButton disabled={busy} onClick={onSetup} className="py-2 px-3 text-xs">
            <Lock size={12} /> <span>Create vault & back up appearance</span>
          </GlassButton>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            There is no password reset by design — the passphrase is the only key. Lose it and the
            encrypted backups are unrecoverable.
          </p>
        </div>
      )}

      {meta?.status === 'locked' && (
        <div className="space-y-2">
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Sync passphrase"
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
          />
          <div className="flex flex-wrap gap-2">
            <GlassButton disabled={busy} onClick={onUnlock} className="py-2 px-3 text-xs">
              <LockOpen size={12} /> <span>Unlock</span>
            </GlassButton>
            <GlassButton variant="ghost" disabled={busy} onClick={() => setShowChange((v) => !v)} className="py-2 px-3 text-xs">
              <KeyRound size={12} /> <span>Change passphrase</span>
            </GlassButton>
          </div>
          {showChange && (
            <div className="space-y-2 pt-1">
              <input
                type="password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="Current passphrase"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
              />
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="New passphrase (min 8 characters)"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
              />
              <GlassButton disabled={busy} onClick={onChange} className="py-2 px-3 text-xs">
                <KeyRound size={12} /> <span>Save new passphrase</span>
              </GlassButton>
            </div>
          )}
        </div>
      )}

      {meta?.status === 'unlocked' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <GlassButton disabled={busy} onClick={onBackup} className="py-2 px-3 text-xs">
              <CloudUpload size={12} /> <span>Back up now</span>
            </GlassButton>
            <GlassButton variant="secondary" disabled={busy} onClick={onRestore} className="py-2 px-3 text-xs">
              <CloudDownload size={12} /> <span>Restore here</span>
            </GlassButton>
            <GlassButton variant="ghost" disabled={busy} onClick={() => { lockVault(); hint('Vault locked — keys wiped from memory.'); void refresh(); }} className="py-2 px-3 text-xs">
              <Lock size={12} /> <span>Lock</span>
            </GlassButton>
            <GlassButton variant="ghost" disabled={busy} onClick={() => setShowChange((v) => !v)} className="py-2 px-3 text-xs">
              <KeyRound size={12} /> <span>Change passphrase</span>
            </GlassButton>
          </div>
          {showChange && (
            <div className="space-y-2 pt-1">
              <input
                type="password"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="Current passphrase"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
              />
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="New passphrase (min 8 characters)"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20"
              />
              <GlassButton disabled={busy} onClick={onChange} className="py-2 px-3 text-xs">
                <KeyRound size={12} /> <span>Save new passphrase</span>
              </GlassButton>
            </div>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Space <span className="font-mono">{SETTINGS_SPACE}</span> · record <span className="font-mono">{APPEARANCE_RECORD}</span> —
            accent, bubble style, wallpapers, density, sounds & per-chat themes travel with the
            ciphertext. Sign in on another device, unlock with the passphrase, press Restore.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
