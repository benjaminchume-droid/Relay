/** Bridge between public web pages and the Relay Capacitor WebView / parent. */

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
};

export type JoinedPayload = {
  kind: 'group' | 'community' | 'channel';
  id: string;
  name?: string;
};

function post(msg: Record<string, unknown>) {
  try {
    (window as any).RelayNative?.onMessage?.(msg);
  } catch {
    /* ignore */
  }
  try {
    window.parent?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}

export function notifyNativeSession(session: AuthSessionPayload) {
  post({ type: 'relay:auth', session });
  try {
    (window as any).RelayNative?.onAuthSession?.(session);
  } catch {
    /* ignore */
  }
}

export function notifyNativeJoined(payload: JoinedPayload) {
  post({ type: 'relay:joined', ...payload });
  try {
    (window as any).RelayNative?.onJoined?.(payload);
  } catch {
    /* ignore */
  }
}

/** True when running inside app WebView (injected flag or Capacitor). */
export function isInAppWebView(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).RelayNative) return true;
  if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}
