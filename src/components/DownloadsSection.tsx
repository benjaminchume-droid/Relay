/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Cpu, Smartphone, Monitor, Layers, Check, Loader2, ShieldCheck } from 'lucide-react';
import { GlassCard } from './GlassUI';

/**
 * Settings → Downloads (website only).
 *
 * Real, working downloads of the signed official builds straight from the
 * Relay GitHub releases:
 *  · Platform — Android / Windows (auto-detected, switchable)
 *  · CPU architecture — arm64-v8a / armeabi-v7a / x86_64 / universal
 *  · Build flavor — Flutter (native client) or Compiler (web shell)
 *
 * Release manifests are fetched live from the GitHub API so new releases
 * appear without touching the website; hardcoded fallbacks keep the tab
 * functional even if the API is unreachable.
 */

type Platform = 'android' | 'windows';
type Arch = 'arm64-v8a' | 'armeabi-v7a' | 'x86_64' | 'universal';
type Flavor = 'flutter' | 'compiler';

interface RelAsset { name: string; url: string; size: number }
interface RelInfo { tag: string; assets: Record<string, RelAsset> }

const FALLBACK_FLUTTER: RelInfo = {
  tag: 'v1.0.8',
  assets: {
    'arm64-v8a': { name: 'relay-1.0.8-android.apk', url: 'https://github.com/orubus-dev/relay-client/releases/download/v1.0.8/relay-1.0.8-android.apk', size: 26509243 },
    'armeabi-v7a': { name: 'relay-1.0.8-android-armv7.apk', url: 'https://github.com/orubus-dev/relay-client/releases/download/v1.0.8/relay-1.0.8-android-armv7.apk', size: 23853357 },
    'x86_64': { name: 'relay-1.0.8-android-x86_64.apk', url: 'https://github.com/orubus-dev/relay-client/releases/download/v1.0.8/relay-1.0.8-android-x86_64.apk', size: 28040066 },
    'universal': { name: 'relay-1.0.8-android-universal.apk', url: 'https://github.com/orubus-dev/relay-client/releases/download/v1.0.8/relay-1.0.8-android-universal.apk', size: 64905326 },
    'windows': { name: 'relay-windows.zip', url: 'https://github.com/orubus-dev/relay-client/releases/download/v1.0.8/relay-windows.zip', size: 14910243 },
  },
};

const FALLBACK_COMPILER: RelInfo = {
  tag: 'v0.5.5.0',
  assets: {
    'universal': { name: 'Relay-0.5.5.0-release.apk', url: 'https://github.com/orubus-dev/Relay/releases/download/v0.5.5.0/Relay-0.5.5.0-release.apk', size: 4770521 },
  },
};

/** Map a GitHub release's assets into our arch keys by filename pattern. */
function parseFlutterRelease(tag: string, assets: { name: string; browser_download_url: string; size: number }[]): RelInfo {
  const out: Record<string, RelAsset> = {};
  for (const a of assets) {
    const n = a.name.toLowerCase();
    if (n.endsWith('.apk') && n.includes('-android.apk')) out['arm64-v8a'] = { name: a.name, url: a.browser_download_url, size: a.size };
    else if (n.includes('-android-armv7.apk')) out['armeabi-v7a'] = { name: a.name, url: a.browser_download_url, size: a.size };
    else if (n.includes('-android-x86_64.apk')) out['x86_64'] = { name: a.name, url: a.browser_download_url, size: a.size };
    else if (n.includes('-android-universal.apk')) out['universal'] = { name: a.name, url: a.browser_download_url, size: a.size };
    else if (n === 'relay-windows.zip' || (n.endsWith('.zip') && n.includes('windows'))) out['windows'] = { name: a.name, url: a.browser_download_url, size: a.size };
  }
  return { tag, assets: out };
}

function parseCompilerRelease(tag: string, assets: { name: string; browser_download_url: string; size: number }[]): RelInfo {
  const out: Record<string, RelAsset> = {};
  for (const a of assets) {
    const n = a.name.toLowerCase();
    if (n.endsWith('.apk')) out['universal'] = { name: a.name, url: a.browser_download_url, size: a.size };
  }
  return { tag, assets: out };
}

function fmtSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return ` · ${mb >= 1 ? mb.toFixed(0) : (bytes / 1024).toFixed(0)}${mb >= 1 ? ' MB' : ' KB'}`;
}

export const DownloadsSection: React.FC = () => {
  const ua = useMemo(() => (typeof navigator !== 'undefined' ? navigator.userAgent : ''), []);
  const [platform, setPlatform] = useState<Platform>(ua.includes('Android') ? 'android' : 'windows');
  const [arch, setArch] = useState<Arch>('arm64-v8a');
  const [flavor, setFlavor] = useState<Flavor>('flutter');
  const [flutterRel, setFlutterRel] = useState<RelInfo>(FALLBACK_FLUTTER);
  const [compilerRel, setCompilerRel] = useState<RelInfo>(FALLBACK_COMPILER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        // Primary source: the same-origin release manifest (public/releases.json,
        // refreshed with each release). Same-origin = never rate-limited, always
        // cached, instant. The GitHub API is only a best-effort live refresh on
        // top — unauthenticated API quotas make it unreliable as the sole source.
        const manifest = await fetch('/releases.json?_=' + Date.now())
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!dead && manifest) {
          if (manifest.flutter?.tag && manifest.flutter?.assets) {
            setFlutterRel({ tag: manifest.flutter.tag, assets: manifest.flutter.assets });
          }
          if (manifest.compiler?.tag && manifest.compiler?.assets) {
            setCompilerRel({ tag: manifest.compiler.tag, assets: manifest.compiler.assets });
          }
        }
        const [fr, cr] = await Promise.all([
          fetch('https://api.github.com/repos/orubus-dev/relay-client/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('https://api.github.com/repos/orubus-dev/Relay/releases/latest', { headers: { Accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (dead) return;
        if (fr?.tag_name && Array.isArray(fr.assets)) setFlutterRel(parseFlutterRelease(fr.tag_name, fr.assets));
        if (cr?.tag_name && Array.isArray(cr.assets)) setCompilerRel(parseCompilerRelease(cr.tag_name, cr.assets));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  // Android on a compiler flavor only ships a universal apk — keep keys honest.
  const rel = flavor === 'flutter' ? flutterRel : compilerRel;
  const pick = (p: Platform, a: Arch, f: Flavor): RelAsset | null => {
    if (p === 'windows') return rel.assets['windows'] ?? null;
    if (f === 'compiler') return rel.assets['universal'] ?? null;
    return rel.assets[a] ?? null;
  };
  const asset = pick(platform, arch, flavor);

  const archOptions: { id: Arch; label: string; hint: string }[] = [
    { id: 'arm64-v8a', label: 'arm64-v8a', hint: 'Modern phones — recommended' },
    { id: 'armeabi-v7a', label: 'armeabi-v7a', hint: 'Older 32-bit phones' },
    { id: 'x86_64', label: 'x86_64', hint: 'Emulators & Chromebooks' },
    { id: 'universal', label: 'Universal', hint: 'All devices, larger file' },
  ];

  const chip = (active: boolean) =>
    `px-3 py-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-all ${
      active
        ? 'text-white shadow-md border-transparent'
        : 'bg-white/70 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-white/10'
    }`;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5 space-y-4">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">Get the Relay apps</span>
          <span className="block text-[11px] text-slate-500 mt-1">
            Official signed builds, straight from Relay's GitHub releases.{loading ? ' Checking the latest version…' : ` Latest: ${flutterRel.tag} (Flutter) · ${compilerRel.tag} (Compiler).`}
          </span>
        </div>

        {/* Platform */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><Smartphone size={12} /> Platform</span>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setPlatform('android')} className={chip(platform === 'android') + ' flex items-center justify-center gap-2 py-2.5'} style={platform === 'android' ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : undefined}>
              <Smartphone size={14} /> Android
            </button>
            <button onClick={() => setPlatform('windows')} className={chip(platform === 'windows') + ' flex items-center justify-center gap-2 py-2.5'} style={platform === 'windows' ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : undefined}>
              <Monitor size={14} /> Windows
            </button>
          </div>
        </div>

        {/* CPU architecture (Android only) */}
        {platform === 'android' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><Cpu size={12} /> CPU architecture</span>
            <div className="grid grid-cols-2 gap-2">
              {archOptions
                .filter((o) => flavor === 'flutter' || o.id === 'universal')
                .map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setArch(o.id)}
                    className={chip(arch === o.id) + ' text-left'}
                    style={arch === o.id ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : undefined}
                  >
                    <span className="flex items-center gap-1.5">{arch === o.id && <Check size={11} />}<span className="font-mono">{o.label}</span></span>
                    <span className={`block text-[9.5px] font-medium mt-0.5 ${arch === o.id ? 'text-white/80' : 'text-slate-400'}`}>{o.hint}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Build flavor */}
        {platform === 'android' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><Layers size={12} /> Build flavor</span>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFlavor('flutter')} className={chip(flavor === 'flutter') + ' text-left'} style={flavor === 'flutter' ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : undefined}>
                <span>Flutter</span>
                <span className={`block text-[9.5px] font-medium mt-0.5 ${flavor === 'flutter' ? 'text-white/80' : 'text-slate-400'}`}>Native client — recommended</span>
              </button>
              <button onClick={() => setFlavor('compiler')} className={chip(flavor === 'compiler') + ' text-left'} style={flavor === 'compiler' ? { backgroundColor: 'var(--primary-accent, #2563EB)' } : undefined}>
                <span>Compiler</span>
                <span className={`block text-[9.5px] font-medium mt-0.5 ${flavor === 'compiler' ? 'text-white/80' : 'text-slate-400'}`}>Web shell — same app as this site</span>
              </button>
            </div>
          </div>
        )}

        {/* Download */}
        <div className="pt-1">
          {asset ? (
            <a
              href={asset.url}
              download={asset.name}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold text-white shadow-md cursor-pointer transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ backgroundColor: 'var(--primary-accent, #2563EB)' }}
            >
              <Download size={15} />
              Download for {platform === 'windows' ? 'Windows' : 'Android'}{platform === 'android' && flavor === 'flutter' ? ` (${arch})` : ''}
              <span className="font-mono opacity-80">{fmtSize(asset.size)}</span>
            </a>
          ) : (
            <div className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold bg-slate-100 dark:bg-white/5 text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Build not published yet — check back shortly
            </div>
          )}
          {asset && <p className="text-[10px] text-slate-500 mt-2 text-center font-mono">{asset.name}</p>}
          {platform === 'android' && (
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Android will ask to allow installs from your browser (Settings → Apps → special access → install unknown apps). That warning appears because Relay ships directly — the build is signed and identical for everyone.
            </p>
          )}
        </div>
      </GlassCard>

      <GlassCard className="p-4 flex items-start gap-3">
        <ShieldCheck size={16} className="text-emerald-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Every APK is signed with the official Relay release key and built by CI from the public source. If a download prompts you to replace an existing Relay app, verify the app id — the Flutter client is <span className="font-mono">app.orubus.relay</span>, the compiler shell is <span className="font-mono">com.glassline.relay</span>.{" "}
          <a href="https://github.com/orubus-dev/relay-client/releases/latest/download/SHA256SUMS.txt" target="_blank" rel="noreferrer" className="underline font-semibold" style={{ color: "var(--primary-accent, #2563EB)" }}>Verify your download (SHA-256)</a> — if an installer reports "unsigned or corrupted", the file was truncated in transit; re-download and compare the hash.
        </p>
      </GlassCard>
    </div>
  );
};
