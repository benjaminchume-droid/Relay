/**
 * End-to-end test of the Relay Messaging SDK against the LIVE gateway:
 * mint user tokens (server helper) → register identities → seal (WebCrypto)
 * → send through the gateway → fetch + decrypt on the recipient side.
 */
import { RelayServer } from '../sdk/dist/server.js';
import { generateIdentityKeys, publicBundle, seal, open, b64url } from '../sdk/dist/crypto.js';
import { readFile } from 'node:fs/promises';

const BASE = 'https://gobwknacvpgysmgpvzqt.supabase.co/functions/v1/gateway';
const APP = JSON.parse(await readFile('/tmp/e2e_app.json', 'utf8'));
const appId = APP.client_id;
const appSecret = APP.secret;

const relay = new RelayServer(appSecret, appId);
const [tokA, tokB] = await Promise.all([relay.userToken('alice_ext'), relay.userToken('bob_ext')]);
console.log('1. user tokens minted for alice_ext + bob_ext');

const keysA = await generateIdentityKeys();
const keysB = await generateIdentityKeys();

async function api(token, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

await api(tokA, '/identities', { method: 'POST', body: JSON.stringify({ public_key: publicBundle(keysA).identity }) });
await api(tokB, '/identities', { method: 'POST', body: JSON.stringify({ public_key: publicBundle(keysB).identity }) });
console.log('2. identities registered');

const peerB = await api(tokA, `/identities/${encodeURIComponent('bob_ext')}`);
console.log('3. alice fetched bob bundle:', typeof peerB.public_key.crv, peerB.public_key.crv);

const SECRET = 'konoha will hold the line at dawn';
const context = `${appId}:alice_ext:bob_ext`;
const envelope = await seal(keysA, { identity: peerB.public_key }, SECRET, context);
console.log('4. sealed envelope, ct bytes:', Math.floor(envelope.ct.length * 0.75));

const sent = await api(tokA, '/messages', { method: 'POST', body: JSON.stringify({ to: 'bob_ext', envelope }) });
console.log('5. gateway accepted message:', sent.id.slice(0, 8));

const inbox = await api(tokB, '/messages');
console.log('6. bob inbox count:', inbox.messages.length);
const msg = inbox.messages.find((m) => m.id === sent.id);
if (!msg) throw new Error('sent message missing from inbox');

const roundTripContext = `${appId}:alice_ext:bob_ext`;
const plaintext = await open(keysB, msg.envelope, roundTripContext);
console.log('7. decrypted:', plaintext);
if (plaintext !== SECRET) throw new Error('PLAINTEXT MISMATCH');

await api(tokB, '/messages/read', { method: 'POST', body: JSON.stringify({ ids: [sent.id] }) });
const convos = await api(tokB, '/conversations');
console.log('8. read receipts set, conversations for bob:', convos.conversations.map((c) => c.partner).join(', '));
console.log('\nE2E OK — SDK crypto + gateway + storage all work against the live backend.');
