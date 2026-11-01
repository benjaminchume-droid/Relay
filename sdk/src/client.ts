/**
 * Relay Messaging SDK — browser / client entrypoint.
 *
 * Identity, key exchange and encryption are handled here; Relay's backend is
 * the hidden plumber that routes ciphertext envelopes between your users.
 *
 *   const relay = new RelayClient({ appId: 'rl_…', baseUrl: 'https://relayid.vercel.app/v1' });
 *   await relay.connectWithToken(userToken);        // token from your backend
 *   await relay.send('user_43', 'hi');              // we handle the encryption
 *   const inbox = await relay.messages();
 */

import {
  generateIdentityKeys,
  open as openEnvelope,
  publicBundle,
  seal,
  type Envelope,
  type IdentityKeys,
  type PublicBundle,
} from './crypto';

export type { Envelope, IdentityKeys, PublicBundle };

export type RelayMessage = {
  id: string;
  from: string;
  envelope: Envelope;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

export type RelayConversation = {
  partner: string;
  last_at: string;
  last_envelope: Envelope;
};

export type RelayClientOptions = {
  /** developer_apps.client_id — starts with rl_ */
  appId: string;
  /** API root, e.g. https://relayid.vercel.app/v1 */
  baseUrl?: string;
  /** storage prefix for the local identity keys (default: relay.sdk.<appId>) */
  keyPrefix?: string;
};

const DEFAULT_BASE = 'https://relayid.vercel.app/v1';

export class RelayError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'RelayError';
  }
}

export class RelayClient {
  readonly appId: string;
  readonly baseUrl: string;
  private keyPrefix: string;
  private token: string | null = null;
  private externalId: string | null = null;
  private keys: IdentityKeys | null = null;

  constructor(opts: RelayClientOptions) {
    if (!opts.appId?.startsWith('rl_')) throw new RelayError('invalid_app_id', 'appId must be the client_id from your Relay developer page.');
    this.appId = opts.appId;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
    this.keyPrefix = opts.keyPrefix ?? `relay.sdk.${opts.appId}`;
  }

  /* ------------------------------ plumbing ------------------------------- */

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init?.headers,
      },
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; error_description?: string | null };
    if (!res.ok) {
      throw new RelayError(body.error ?? 'request_failed', body.error_description ?? `Request failed (${res.status})`, res.status);
    }
    return body as T;
  }

  /* -------------------------------- keys --------------------------------- */

  private loadKeys(): IdentityKeys | null {
    try {
      const raw = localStorage.getItem(this.keyPrefix);
      return raw ? (JSON.parse(raw) as IdentityKeys) : null;
    } catch {
      return null;
    }
  }

  private saveKeys(keys: IdentityKeys): void {
    try {
      localStorage.setItem(this.keyPrefix, JSON.stringify(keys));
    } catch {
      /* private mode — keys stay in memory for this session only */
    }
  }

  /**
   * The device identity key pair. Generated on first connect; the private key
   * never leaves this device (localStorage is a convenience mirror — export
   * with exportIdentity() if you want to move a user between devices).
   */
  getIdentity(): IdentityKeys | null {
    return this.keys;
  }

  exportIdentity(): string | null {
    return this.keys ? JSON.stringify(this.keys) : null;
  }

  importIdentity(raw: string): void {
    const parsed = JSON.parse(raw) as IdentityKeys;
    if (!parsed.identity?.d) throw new RelayError('invalid_identity', 'Not a private identity export.');
    this.keys = parsed;
    this.saveKeys(parsed);
  }

  /* ------------------------------- connect ------------------------------- */

  /** Attach a user token minted by YOUR backend (see @relay/messaging-sdk/server). */
  async connectWithToken(token: string): Promise<{ externalId: string }> {
    this.token = token.replace(/^Bearer\s+/i, '');
    const [body] = token.split('.');
    let ext = '';
    try {
      ext = (JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as { ext: string }).ext;
    } catch {
      throw new RelayError('invalid_token', 'That is not a Relay user token.');
    }
    this.externalId = ext;

    if (!this.keys) this.keys = this.loadKeys();
    if (!this.keys) {
      this.keys = await generateIdentityKeys();
      this.saveKeys(this.keys);
    }

    // register / refresh our public bundle so peers can encrypt to us
    await this.fetch('/identities', {
      method: 'POST',
      body: JSON.stringify({ public_key: publicBundle(this.keys).identity, meta: { connected_at: new Date().toISOString() } }),
    });
    return { externalId: ext };
  }

  /** Look up a peer's public bundle (throws if they never connected). */
  async peerBundle(externalId: string): Promise<PublicBundle> {
    const row = await this.fetch<{ external_id: string; public_key: JsonWebKey }>(
      `/identities/${encodeURIComponent(externalId)}`,
    );
    return { identity: row.public_key };
  }

  /* -------------------------------- send --------------------------------- */

  /**
   * Encrypt `text` for `to` (their external id in YOUR app) and drop the
   * envelope with the gateway. Returns the message id.
   */
  async send(to: string, text: string): Promise<{ id: string; created_at: string }> {
    if (!this.keys) throw new RelayError('not_connected', 'Call connectWithToken() first.');
    const peer = await this.peerBundle(to);
    const context = `${this.appId}:${[this.externalId, to].sort().join(':')}`;
    const envelope = await seal(this.keys, peer, text, context);
    return this.fetch('/messages', {
      method: 'POST',
      body: JSON.stringify({ to, envelope }),
    });
  }

  /* ------------------------------ receive -------------------------------- */

  /** Ciphertext inbox. `since` accepts an ISO timestamp. */
  async messages(since?: string, limit = 100): Promise<{ messages: RelayMessage[] }> {
    const q = new URLSearchParams();
    if (since) q.set('since', since);
    q.set('limit', String(limit));
    return this.fetch(`/messages?${q.toString()}`);
  }

  /** Decrypt one inbox message locally. */
  async decrypt(message: RelayMessage): Promise<string> {
    if (!this.keys) throw new RelayError('not_connected', 'Call connectWithToken() first.');
    const context = `${this.appId}:${[message.from, this.externalId].sort().join(':')}`;
    return openEnvelope(this.keys, message.envelope, context);
  }

  async markRead(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.fetch('/messages/read', { method: 'POST', body: JSON.stringify({ ids }) });
  }

  /** Conversation list with the most recent envelope per partner. */
  async conversations(): Promise<{ conversations: RelayConversation[] }> {
    return this.fetch('/conversations');
  }
}
