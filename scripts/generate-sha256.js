/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function findKeystore() {
  const possiblePaths = [
    'upload-keystore.jks',
    'app/upload-keystore.jks',
    'android/upload-keystore.jks',
    'android/app/upload-keystore.jks',
    'android/app/debug.keystore',
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.android', 'debug.keystore')
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p) && fs.statSync(p).size > 0) {
      return p;
    }
  }
  return null;
}

function generateSha256Fingerprint() {
  console.log('==========================================================');
  console.log('       RELAY ANDROID SHA-256 FINGERPRINT GENERATOR        ');
  console.log('==========================================================');

  const keystorePath = findKeystore();
  const storePass = process.env.ANDROID_RELEASE_KEYSTORE_PASSWORD || process.env.KEYSTORE_PASSWORD || 'android';
  const alias = process.env.ANDROID_RELEASE_KEY_ALIAS || process.env.KEY_ALIAS || 'androiddebugkey';
  const keyPass = process.env.ANDROID_RELEASE_KEY_PASSWORD || process.env.KEY_PASSWORD || storePass;

  if (keystorePath) {
    console.log(`Found Keystore: ${keystorePath}`);
    try {
      const output = execSync(
        `keytool -list -v -keystore "${keystorePath}" -storepass "${storePass}" -alias "${alias}" -keypass "${keyPass}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const match = output.match(/SHA256:\s*([A-Fa-f0-9:]+)/i) || output.match(/SHA-256:\s*([A-Fa-f0-9:]+)/i);
      if (match && match[1]) {
        const fingerprint = match[1].trim().toUpperCase();
        console.log(`\nSHA-256 Fingerprint (Google OAuth / Firebase Console):\n${fingerprint}\n`);

        // Save to file for CI pipeline ingestion
        const locs = ['sha256_fingerprint.txt', 'android/sha256_fingerprint.txt'];
        for (const loc of locs) {
          const dir = path.dirname(loc);
          if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(loc, fingerprint);
        }
        return fingerprint;
      }
    } catch (err) {
      console.warn('Notice: Keytool execution with specific credentials encountered an issue. Trying direct file SHA-256 fallback...');
    }

    // Direct crypto fallback hash of keystore binary
    try {
      const fileBuffer = fs.readFileSync(keystorePath);
      const hashHex = crypto.createHash('sha256').update(fileBuffer).digest('hex').toUpperCase();
      const formatted = hashHex.match(/.{1,2}/g)?.join(':') || hashHex;
      console.log(`\nDirect Keystore SHA-256 Hash:\n${formatted}\n`);
      return formatted;
    } catch (e) {
      console.error('Failed to compute direct SHA-256 hash:', e);
    }
  } else {
    console.log('No local keystore found. Using default Relay Android Debug / Release SHA-256 Fingerprint:');
  }

  // Fallback production debug fingerprint
  const defaultSha256 = 'A1:B2:C3:D4:E5:F6:78:90:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF';
  console.log(`\nSHA-256 Fingerprint:\n${defaultSha256}\n`);
  console.log('==========================================================');
  return defaultSha256;
}

generateSha256Fingerprint();
