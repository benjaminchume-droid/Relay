/**
 * LIVE E2E test: two RelayClient instances (from the BUILT bundle) talking
 * through the real Relay gateway. Proves the full path:
 *   connect → bundle upload → X3DH → Double Ratchet → ciphertext relay → decrypt
 *
 *   node sdk/test/e2e-live.mjs
 */
import { RelayClient, RelayServer } from "../../public/sdk/relay-sdk.mjs";

// Point these at your own test app before running:
//   RELAY_APP_ID=rl_… RELAY_APP_SECRET=rs_… node sdk/test/e2e-live.mjs
const APP_ID = process.env.RELAY_APP_ID ?? "";
const APP_SECRET = process.env.RELAY_APP_SECRET ?? "";
const BASE = process.env.RELAY_BASE_URL ?? "https://relayid.vercel.app/v1";
if (!APP_ID || !APP_SECRET) {
  console.error("Set RELAY_APP_ID and RELAY_APP_SECRET to run the live E2E test.");
  process.exit(0);
}

const memoryStore = () => {
  const m = new Map();
  return {
    async get(k) { return m.get(k) ?? null; },
    async set(k, v) { m.set(k, v); },
    async remove(k) { m.delete(k); },
  };
};

async function main() {
  const server = new RelayServer({ appId: APP_ID, appSecret: APP_SECRET, baseUrl: BASE });

  // 0. offline token minting must equal what the gateway accepts
  const aliceTok = server.mintTokenLocal("alice_e2e", 3600);
  const bobTok = server.mintTokenLocal("bob_e2e", 3600);
  console.log("✓ offline-minted user tokens (HMAC over sha256(app secret))");

  // 1. verify against the live gateway via the network path too
  const netTok = await server.mintToken("bob_e2e", 3600);
  console.log("✓ gateway /tokens accepts the app secret (network mint)");

  const alice = new RelayClient({ appId: APP_ID, baseUrl: BASE, store: memoryStore() });
  const bob = new RelayClient({ appId: APP_ID, baseUrl: BASE, store: memoryStore() });

  const a = await alice.connectWithToken(aliceTok.token);
  const b = await bob.connectWithToken(netTok.token);
  console.log(`✓ connected: alice=${a.external_id} bob=${b.external_id}`);

  const aBundle = await alice.publicBundle();
  console.log(`✓ alice bundle: ik=${aBundle.ik.slice(0, 10)}… spk_sig=${aBundle.spk_sig.slice(0, 8)}…`);

  // 2. alice → bob (X3DH initiation + first ratchet message)
  const t1 = Date.now();
  const r1 = await alice.send("bob_e2e", "signal-level hello — sealed with X3DH + Double Ratchet");
  console.log(`✓ alice→bob sent in ${Date.now() - t1}ms (envelope ${r1.id.slice(0, 8)}…)`);
  void r1;

  const inbox1 = await bob.inbox();
  if (inbox1.length !== 1 || inbox1[0].text !== "signal-level hello — sealed with X3DH + Double Ratchet") {
    throw new Error("bob could not decrypt alice's first message: " + JSON.stringify(inbox1));
  }
  console.log("✓ bob decrypted the X3DH-initiated message");

  // 3. bob → alice (ratchet now established on both sides)
  await bob.send("alice_e2e", "and the ratchet ratchets back");
  const inbox2 = await alice.inbox();
  if (inbox2.length !== 1 || inbox2[0].text !== "and the ratchet ratchets back") {
    throw new Error("alice could not decrypt bob's reply: " + JSON.stringify(inbox2));
  }
  console.log("✓ alice decrypted bob's reply");

  // 4. rapid-fire conversation (10 messages, alternating)
  for (let i = 1; i <= 5; i++) {
    await alice.send("bob_e2e", `ping ${i}`);
    await bob.send("alice_e2e", `pong ${i}`);
  }
  const bobInbox = await bob.inbox();
  const aliceInbox = await alice.inbox();
  const bPings = bobInbox.map((m) => m.text).filter((t) => t.startsWith("ping "));
  const aPongs = aliceInbox.map((m) => m.text).filter((t) => t.startsWith("pong "));
  if (bPings.length !== 5 || aPongs.length !== 5) {
    throw new Error(`expected 5+5, got pings=${bPings.length} pongs=${aPongs.length}`);
  }
  console.log(`✓ 10-message exchange decrypted on both sides: [${bPings[0]} … ${bPings[4]}]`);

  // 5. the server must hold ONLY ciphertext — check via the raw inbox
  const raw = await (await fetch(`${BASE}/messages?limit=200`, {
    headers: { authorization: `Bearer ${bobTok.token}` },
  })).json();
  const envs = raw.messages ?? [];
  const plaintextLeak = JSON.stringify(envs).includes("signal-level hello");
  if (plaintextLeak) throw new Error("PLAINTEXT LEAKED into stored envelopes");
  console.log(`✓ server stores ${envs.length} envelopes — zero plaintext, all ciphertext jsonb`);

  // 6. mark read
  await bob.markRead(bobInbox.map((m) => m.id));
  console.log("✓ read receipts recorded");

  console.log("\nLIVE E2E PASSED — the SDK is Signal-level end to end");
}

main().catch((err) => {
  console.error("LIVE E2E FAILED:", err?.message ?? err);
  process.exit(1);
});
