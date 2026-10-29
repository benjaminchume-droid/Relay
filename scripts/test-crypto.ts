/**
 * Roundtrip test of the Relay Signal protocol implementation (Node/tsx).
 * Verifies: X3DH agreement both sides, Double Ratchet bidirectional chains,
 * out-of-order delivery via skipped keys, signature verification.
 */
import {
  generateIdentity, x3dhInitiate, x3dhRespond, initRatchetAsInitiator,
  initRatchetAsResponder, ratchetEncrypt, ratchetDecrypt, b64u, type Envelope,
} from "../src/services/crypto/signalProtocol";

async function main() {
  const alice = generateIdentity(10);
  const bob = generateIdentity(10);

  const bundle = {
    ikPub: b64u.enc(bob.ik.publicKey),
    signPub: b64u.enc(bob.sign.publicKey),
    spkPub: b64u.enc(bob.spk.publicKey),
    spkId: bob.spkId,
    spkSig: b64u.enc(bob.spkSig),
    opkPub: b64u.enc(bob.opks[0].pair.publicKey),
    opkId: bob.opks[0].id,
  };

  // Alice initiates
  const init = x3dhInitiate(alice.ik, bundle);
  const aState = initRatchetAsInitiator(init.sharedSecret, b64u.dec(bundle.spkPub), {
    ek: b64u.enc(init.ephemeralPub), spkId: bundle.spkId, opkId: init.usedOpkId,
  });

  // Bob responds (locally: same OPK he generated)
  const bobOpk = bob.opks.find((o) => o.id === init.usedOpkId) || null;
  const shared = x3dhRespond(bob.ik, bob.spk, bobOpk ? bobOpk.pair : null, alice.ik.publicKey, init.ephemeralPub);
  let bState = initRatchetAsResponder(shared, bob.spk);

  const conv = "11111111-2222-3333-4444-555555555555";
  const aliceIk = b64u.enc(alice.ik.publicKey);

  // Alice -> Bob: 3 messages
  const e1 = await ratchetEncrypt(aState, conv, aliceIk, JSON.stringify({ k: "t", t: "hello 1" }));
  const e2 = await ratchetEncrypt(aState, conv, aliceIk, JSON.stringify({ k: "t", t: "hello 2" }));
  const e3 = await ratchetEncrypt(aState, conv, aliceIk, JSON.stringify({ k: "t", t: "hello 3" }));

  // out of order: 2 then 3 then 1
  const d2 = await ratchetDecrypt(bState, conv, e2 as Envelope);
  const d3 = await ratchetDecrypt(bState, conv, e3 as Envelope);
  const d1 = await ratchetDecrypt(bState, conv, e1 as Envelope);
  console.log("bob got:", d2, "|", d3, "|", d1);
  if (d1 !== '{"k":"t","t":"hello 1"}' || d2 !== '{"k":"t","t":"hello 2"}' || d3 !== '{"k":"t","t":"hello 3"}') throw new Error("A->B roundtrip FAIL");

  // Bob -> Alice: reply (triggers Alice's first receive + DH ratchet on both sides)
  const bobIk = b64u.enc(bob.ik.publicKey);
  const r1 = await ratchetEncrypt(bState, conv, bobIk, JSON.stringify({ k: "t", t: "reply 1" }));
  const r2 = await ratchetEncrypt(bState, conv, bobIk, JSON.stringify({ k: "t", t: "reply 2" }));
  const dr1 = await ratchetDecrypt(aState, conv, r1 as Envelope);
  const dr2 = await ratchetDecrypt(aState, conv, r2 as Envelope);
  console.log("alice got:", dr1, "|", dr2);
  if (dr1 !== '{"k":"t","t":"reply 1"}' || dr2 !== '{"k":"t","t":"reply 2"}') throw new Error("B->A roundtrip FAIL");

  // one more round each way after multiple ratchet steps
  const e4 = await ratchetEncrypt(aState, conv, aliceIk, "ping 4");
  const d4 = await ratchetDecrypt(bState, conv, e4 as Envelope);
  const r3 = await ratchetEncrypt(bState, conv, bobIk, "pong 4");
  const dr3 = await ratchetDecrypt(aState, conv, r3 as Envelope);
  console.log("after ratchets:", d4, "|", dr3);
  if (d4 !== "ping 4" || dr3 !== "pong 4") throw new Error("post-ratchet roundtrip FAIL");

  // tamper test: flipped ciphertext bit must throw
  const bad = JSON.parse(JSON.stringify(e4)) as Envelope;
  const raw = atob(bad.ct.replace(/-/g, "+").replace(/_/g, "/") + "==");
  bad.ct = b64u.enc(new Uint8Array([...Buffer.from(raw, "binary")].map((x, i) => (i === 0 ? x ^ 1 : x))));
  let threw = false;
  try { await ratchetDecrypt(bState, conv, bad); } catch { threw = true; }
  if (!threw) throw new Error("tamper test FAIL — decryption of modified ciphertext succeeded");
  console.log("tamper detection: OK");

  console.log("ALL CRYPTO TESTS PASSED");
}

main().catch((e) => { console.error(e); process.exit(1); });
