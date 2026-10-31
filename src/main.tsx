import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WebRouter } from './WebRouter.tsx';
import { LiquidRefractionDefs } from './components/GlassUI.tsx';
import { supabase } from './lib/supabase/client.ts';
import './index.css';
import './theme-dark.css';

window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (event.reason?.message?.includes('WebSocket') ||
      event.reason?.toString?.().includes('WebSocket'))
  ) {
    event.preventDefault();
  }
});

/**
 * Google sign-in handoff (Capacitor app): the OAuth flow completes in the
 * in-app browser, which bounces back into the app via `relay://login#…` /
 * `relay://auth#…`. The Android intent filter opens the app here — this
 * listener used to be missing entirely, so the tokens arrived and died.
 * Capture them into a real supabase session and enter the app.
 */
(async () => {
  try {
    const Cap = (window as any).Capacitor;
    if (!Cap?.isNativePlatform?.()) return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('appUrlOpen', async ({ url }: { url: string }) => {
      try {
        if (!url || !url.startsWith('relay://')) return;
        const hashIdx = url.indexOf('#');
        const queryIdx = url.indexOf('?');
        const params = new URLSearchParams(
          hashIdx >= 0 ? url.slice(hashIdx + 1) : queryIdx >= 0 ? url.slice(queryIdx + 1) : '',
        );
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (!access_token || !refresh_token) return;
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        // Hard-reload into the app shell so the authenticated tree mounts.
        window.location.assign('/messaging');
      } catch (e) {
        console.warn('[auth] relay:// handoff failed', e);
        window.location.assign('/messaging');
      }
    });
  } catch {
    /* @capacitor/app unavailable (plain web) — nothing to wire */
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiquidRefractionDefs />
    <WebRouter />
  </StrictMode>,
);
