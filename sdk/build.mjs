/**
 * Bundles the SDK into single-file ES modules under public/sdk/ — the files
 * the "Download client / Download server" buttons serve.
 *
 *   node sdk/build.mjs
 *
 * Output is self-contained (@noble/curves + @noble/hashes are bundled in),
 * minified, and side-effect free at import time. AES-GCM still goes through
 * the platform WebCrypto engine (constant-time, hardware-accelerated).
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../public/sdk/", import.meta.url), { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2020",
  minify: true,
  legalComments: "inline",
  sourcemap: false,
  banner: {
    js: "/* Relay Messaging SDK — Signal-level E2EE (X3DH + Double Ratchet). https://relayid.vercel.app */",
  },
};

await build({
  ...common,
  entryPoints: [new URL("./src/index.ts", import.meta.url).pathname],
  outfile: new URL("../public/sdk/relay-sdk.mjs", import.meta.url).pathname,
});

await build({
  ...common,
  entryPoints: [new URL("./src/server.ts", import.meta.url).pathname],
  outfile: new URL("../public/sdk/relay-server.mjs", import.meta.url).pathname,
});

console.log("built public/sdk/relay-sdk.mjs + relay-server.mjs");
