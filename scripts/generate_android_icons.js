import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const RES_DIR = path.resolve('./android/app/src/main/res');

// SVG templates
const squareSvg = `<svg width="512" height="512" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="relayGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect x="5" y="5" width="90" height="90" rx="26" fill="url(#relayGlow)" />
  <path d="M32 32 C 32 32, 68 32, 68 32 C 68 50, 50 68, 32 68 Z" fill="white" fill-opacity="0.88" />
  <circle cx="64" cy="64" r="8" fill="white" />
</svg>`;

const roundSvg = `<svg width="512" height="512" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="relayGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#relayGlow)" />
  <path d="M32 32 C 32 32, 68 32, 68 32 C 68 50, 50 68, 32 68 Z" fill="white" fill-opacity="0.88" />
  <circle cx="64" cy="64" r="8" fill="white" />
</svg>`;

const densities = [
  { folder: 'mipmap-mdpi', iconSize: 48 },
  { folder: 'mipmap-hdpi', iconSize: 72 },
  { folder: 'mipmap-xhdpi', iconSize: 96 },
  { folder: 'mipmap-xxhdpi', iconSize: 144 },
  { folder: 'mipmap-xxxhdpi', iconSize: 192 }
];

async function renderCleanPng(svgBuf, width, height) {
  return await sharp(svgBuf)
    .resize(width, height)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function generateIcons() {
  for (const { folder, iconSize } of densities) {
    const dir = path.join(RES_DIR, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const squareBuf = Buffer.from(squareSvg);
    const roundBuf = Buffer.from(roundSvg);

    // ic_launcher.png
    const iconBuf = await renderCleanPng(squareBuf, iconSize, iconSize);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), iconBuf);

    // ic_launcher_round.png
    const roundIconBuf = await renderCleanPng(roundBuf, iconSize, iconSize);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), roundIconBuf);

    console.log(`Generated clean AAPT2 icons in ${folder}`);
  }
}

generateIcons().catch(err => {
  console.error(err);
  process.exit(1);
});

