/**
 * Relay Messaging SDK — server helper (Node, Bun, Deno, edge runtimes).
 *
 * Your VPS or backend provider mints short-lived user tokens for the browser
 * SDK. The token is an HMAC over {appId, externalId, exp} keyed with the
 * SHA-256 of your app secret — Relay's gateway verifies it against the stored
 * hash, so nobody (us included) can mint tokens for your users without the
 * secret.
 *
 *   import { RelayServer } from '@relay/messaging-sdk/server';
 *   const relay = new RelayServer(process.env.RELAY_APP_SECRET!);
 *   app.post('/relay-token', (req, res) =>
 *     res.send(relay.userToken(req.body.externalId)));
 */

export type UserTokenPayload = { cid: string; ext: string; exp: number };

type SubtleCryptoLike = {
  importKey: (...args: unknown[]) => Promise<CryptoKey>;
  sign: (...args: unknown[]) => Promise<ArrayBuffer>;
  digest: (...args: unknown[]) => Promise<ArrayBuffer>;
};

function getSubtle(): SubtleCryptoLike {
  const s = (globalThis as { crypto?: { subtle?: SubtleCryptoLike } }).crypto?.subtle;
  if (!s) {
    throw new Error(
      'WebCrypto unavailable. Node needs >= 18 (run with --experimental-global-webcrypto on 18) — Bun, Deno and edge runtimes ship it by default.',
    );
  }
  return s;
}

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacKey(hexSecret: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(hexSecret.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return getSubtle().importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sha256Hex(input: string): Promise<string> {
  const d = await getSubtle().digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class RelayServer {
  private appId: string | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;

  /**
   * @param appSecret the rs_… client secret — keep it server-side only
   * @param appId optional: validated client_id; when given, tokens embed it
   */
  constructor(private appSecret: string, appId?: string) {
    if (!appSecret?.startsWith('rs_')) {
      throw new Error('RelayServer needs the rs_ client secret from your developer page.');
    }
    this.appId = appId ?? null;
  }

  /** Mint a user token. Default TTL 24 h, hard range 5 min to 7 days. */
  async userToken(externalId: string, ttlSeconds = 86400): Promise<string> {
    if (!this.appId) {
      throw new Error('Set appId first: relay.setAppId("rl_…") — it comes from your developer page.');
    }
    const ttl = Math.min(Math.max(ttlSeconds, 300), 7 * 86400);
    const payload: UserTokenPayload = {
      cid: this.appId,
      ext: externalId,
      exp: Math.floor(Date.now() / 1000) + ttl,
    };
    const body = b64url(enc.encode(JSON.stringify(payload)));
    if (!this.keyPromise) {
      this.keyPromise = hmacKey(await sha256Hex(this.appSecret));
    }
    const key = await this.keyPromise;
    const sig = await getSubtle().sign('HMAC', key, enc.encode(body));
    return `${body}.${b64url(sig)}`;
  }

  setAppId(appId: string): void {
    this.appId = appId;
  }

  /** Convenience: verify what a token would contain without sending it. */
  static decode(token: string): UserTokenPayload | null {
    try {
      const [body] = token.split('.');
      return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as UserTokenPayload;
    } catch {
      return null;
    }
  }
}
