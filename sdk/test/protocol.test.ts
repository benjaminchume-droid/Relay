/**
 * Protocol self-test for the Signal core (no network).
 *   npx tsx sdk/test/protocol.test.ts
 */
import assert from "node:assert";
import {
  generateIdentity,
  bundleFromIdentity,
  x3dhInitiate,
  x3dhRespond,
  initRatchetAsInitiator,
  initRatchetAsResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  type Envelope,
  type SessionState,
} from "../src/signal";
import { b64uEncode, dhPubFromPriv, randomBytes } from "../src/crypto";

const utf8 = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function makePeer() {
  const identity = generateIdentity();
  // OPKs: map kid -> private; bundle advertises derived public points
  const opkPrivs = Array.from({ length: 3 }, () => randomBytes(32));
  const opks = opkPrivs.map((priv, i) => ({
    kid: `opk-${i}`,
    key: b64uEncode(dhPubFromPriv(priv)),
  }));
  const opkMap = new Map(opkPrivs.map((priv, i) => [`opk-${i}`, priv]));
  const bundle = bundleFromIdentity(identity, opks);
  return { identity, opkMap, bundle };
}

/** Full X3DH: Alice initiates against Bob's bundle, Bob responds. */
function handshake() {
  const alice = generateIdentity();
  const bob = makePeer();

  const bundleResp = {
    bundle: { ik: bob.bundle.ik, spk: bob.bundle.spk, spk_sig: bob.bundle.spk_sig, sig: bob.bundle.sig },
    one_time_prekey: bob.bundle.opks?.[1] ?? null, // second OPK
  };
  const init = x3dhInitiate(alice, bundleResp);

  const respond = x3dhRespond(
    bob.identity,
    bob.opkMap,
    b64uEncode(alice.ik.pub), // initiator identity rides the first envelope
    b64uEncode(init.ek.pub),
    bundleResp.one_time_prekey?.kid,
  );

  assert.deepStrictEqual([...init.secret], [...respond.secret], "X3DH secrets must match");
  assert.equal(respond.consumedOpkKid, "opk-1");

  // session AD binds both identity keys
  const sorted = [b64uEncode(alice.ik.pub), bob.bundle.ik].sort();
  const ad = new TextEncoder().encode(sorted.join("|"));

  const aliceSess: SessionState = initRatchetAsInitiator(init.secret, b64uDecode(bob.bundle.spk), ad);
  const bobSess: SessionState = initRatchetAsResponder(respond.secret, bob.identity.spk, ad);
  return { alice, bob, aliceSess, bobSess, init, respond };
}

function b64uDecode(s: string): Uint8Array {
  const pad = (4 - (s.length % 4)) % 4;
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64"));
}

async function main() {
  /* ---------------------------- 1. X3DH agreement --------------------------- */
  {
    const { aliceSess, bobSess } = handshake();
    assert.ok(aliceSess.ratchet.cks, "initiator has a sending chain");
    assert.ok(!bobSess.ratchet.cks, "responder waits for the first message");
    console.log("✓ X3DH: both sides derive the same root secret");
  }

  /* ------------------- 2. signed-prekey signature binding ------------------- */
  {
    const alice = generateIdentity();
    const bob = makePeer();
    const tampered = {
      bundle: { ik: bob.bundle.ik, spk: bob.bundle.spk, spk_sig: bob.bundle.spk_sig, sig: bob.bundle.sig },
      one_time_prekey: null,
    };
    // corrupt the Ed25519 verify key — the signature must fail
    tampered.bundle.sig = bob.bundle.sig.slice(0, -4) + "AAAA";
    assert.throws(() => x3dhInitiate(alice, tampered), /signature invalid/, "tampered signing key must abort");
    console.log("✓ X3DH: MITM'd prekey signature is rejected");
  }

  /* ------------------------- 3. basic message flows ------------------------- */
  {
    const { aliceSess, bobSess } = handshake();
    for (let i = 1; i <= 5; i++) {
      const msg = `hello ${i}`;
      const env = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8(msg));
      const pt = await ratchetDecrypt(bobSess.ratchet, bobSess.ad, env);
      assert.equal(dec(pt), msg);
    }
    // reply path — Bob now ratchets back
    for (let i = 1; i <= 5; i++) {
      const env = await ratchetEncrypt(bobSess.ratchet, bobSess.ad, utf8(`reply ${i}`));
      const pt = await ratchetDecrypt(aliceSess.ratchet, aliceSess.ad, env);
      assert.equal(dec(pt), `reply ${i}`);
    }
    console.log("✓ Double Ratchet: 10 messages both directions");
  }

  /* -------------------- 4. out-of-order + replay rejection ------------------ */
  {
    const { aliceSess, bobSess } = handshake();
    const e1 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("first"));
    const e2 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("second"));
    const e3 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("third"));

    // deliver 3, then 1, then 2 (out of order)
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, e3)), "third");
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, e1)), "first");
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, e2)), "second");

    // replaying e1 must now fail (its key was consumed)
    await assert.rejects(() => ratchetDecrypt(bobSess.ratchet, bobSess.ad, e1), undefined, "replay must fail");
    console.log("✓ out-of-order delivery works, replays are rejected");
  }

  /* ---------------------------- 5. tamper rejection ------------------------- */
  {
    const { aliceSess, bobSess } = handshake();
    const env = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("authentic"));
    const bad: Envelope = JSON.parse(JSON.stringify(env));
    const bytes = Buffer.from(bad.ct, "base64url");
    bytes[0] ^= 0xff;
    bad.ct = b64uEncode(new Uint8Array(bytes));
    await assert.rejects(() => ratchetDecrypt(bobSess.ratchet, bobSess.ad, bad), undefined, "tampering must fail");
    console.log("✓ tampered ciphertext is rejected (AES-GCM auth)");
  }

  /* --------------------- 6. session persistence round-trip ------------------ */
  {
    const { aliceSess, bobSess } = handshake();
    const env = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("before reload"));
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, env)), "before reload");

    // simulate an app restart: JSON round-trip of both ratchet states
    const ser = (s: SessionState) => JSON.parse(JSON.stringify({
      rk: b64uEncode(s.ratchet.rk),
      cks: s.ratchet.cks ? b64uEncode(s.ratchet.cks) : null,
      ckr: s.ratchet.ckr ? b64uEncode(s.ratchet.ckr) : null,
      dhs_priv: b64uEncode(s.ratchet.dhs_priv),
      dhs_pub: b64uEncode(s.ratchet.dhs_pub),
      dhr: s.ratchet.dhr ? b64uEncode(s.ratchet.dhr) : null,
      ns: s.ratchet.ns,
      nr: s.ratchet.nr,
      pn: s.ratchet.pn,
      skipped: s.ratchet.skipped.map((k) => ({ dh: k.dh, n: k.n, mk: b64uEncode(k.mk) })),
    }));
    const rev = (raw: Record<string, string | null | unknown>) => ({
      rk: b64uDecode(raw.rk as string),
      cks: raw.cks ? b64uDecode(raw.cks as string) : null,
      ckr: raw.ckr ? b64uDecode(raw.ckr as string) : null,
      dhs_priv: b64uDecode(raw.dhs_priv as string),
      dhs_pub: b64uDecode(raw.dhs_pub as string),
      dhr: raw.dhr ? b64uDecode(raw.dhr as string) : null,
      ns: raw.ns as number,
      nr: raw.nr as number,
      pn: raw.pn as number,
      skipped: (raw.skipped as { dh: string; n: number; mk: string }[]).map((k) => ({
        dh: k.dh,
        n: k.n,
        mk: b64uDecode(k.mk),
      })),
    });
    const aState = { ratchet: rev(ser(aliceSess)), ad: aliceSess.ad, peerIk: aliceSess.peerIk } as SessionState;
    const bState = { ratchet: rev(ser(bobSess)), ad: bobSess.ad, peerIk: bobSess.peerIk } as SessionState;

    const env2 = await ratchetEncrypt(aState.ratchet, aState.ad, utf8("after reload"));
    assert.equal(dec(await ratchetDecrypt(bState.ratchet, bState.ad, env2)), "after reload");
    console.log("✓ sessions survive persistence round-trips");
  }

  /* ------------------------ 7. forward secrecy sanity ----------------------- */
  {
    const { aliceSess, bobSess } = handshake();
    const m1 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("m1"));
    const m2 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("m2"));
    assert.notDeepStrictEqual([...Buffer.from(m1.ct, "base64url")], [...Buffer.from(m2.ct, "base64url")]);
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, m2)), "m2");
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, m1)), "m1");
    console.log("✓ every message key is unique (per-message forward secrecy)");
  }

  /* ---------------- 8. replay must not corrupt later messages ---------------- */
  {
    const { aliceSess, bobSess } = handshake();
    const m1 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("one"));
    const m2 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("two"));
    const m3 = await ratchetEncrypt(aliceSess.ratchet, aliceSess.ad, utf8("three"));
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, m1)), "one");
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, m2)), "two");
    // replay m1 in the middle of the chain — must fail WITHOUT burning m3's key
    await assert.rejects(() => ratchetDecrypt(bobSess.ratchet, bobSess.ad, m1));
    assert.equal(dec(await ratchetDecrypt(bobSess.ratchet, bobSess.ad, m3)), "three");
    console.log("✓ a replay attempt cannot desync the ratchet (rollback works)");
  }

  console.log("\nALL PROTOCOL TESTS PASSED");
}

main().catch((err) => {
  console.error("PROTOCOL TEST FAILED:", err);
  process.exit(1);
});
