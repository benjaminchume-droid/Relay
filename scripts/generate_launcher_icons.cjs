const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DENSITIES = {
  'mipmap-mdpi': { icon: 48 },
  'mipmap-hdpi': { icon: 72 },
  'mipmap-xhdpi': { icon: 96 },
  'mipmap-xxhdpi': { icon: 144 },
  'mipmap-xxxhdpi': { icon: 192 },
};

const RES_DIR = path.resolve(__dirname, '../android/app/src/main/res');

// SVG Templates
const getSquareSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="108" height="108" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <clipPath id="squircle">
      <rect x="0" y="0" width="108" height="108" rx="22" ry="22" />
    </clipPath>
  </defs>
  <rect width="108" height="108" fill="url(#bg)" clip-path="url(#squircle)" />
  <path fill="#FFFFFF" fill-opacity="0.88" d="M36,36 C36,36 72,36 72,36 C72,54 54,72 36,72 Z" clip-path="url(#squircle)" />
  <circle cx="68" cy="68" r="8" fill="#FFFFFF" clip-path="url(#squircle)" />
</svg>`;

const getRoundSvg = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="108" height="108" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <clipPath id="circle">
      <circle cx="54" cy="54" r="54" />
    </clipPath>
  </defs>
  <rect width="108" height="108" fill="url(#bg)" clip-path="url(#circle)" />
  <path fill="#FFFFFF" fill-opacity="0.88" d="M36,36 C36,36 72,36 72,36 C72,54 54,72 36,72 Z" clip-path="url(#circle)" />
  <circle cx="68" cy="68" r="8" fill="#FFFFFF" clip-path="url(#circle)" />
</svg>`;

async function renderCleanPng(svgBuf, width, height) {
  return await sharp(svgBuf)
    .resize(width, height)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function generateAllIcons() {
  console.log('Generating Android launcher icons for all density buckets...');

  const squareBuf = Buffer.from(getSquareSvg());
  const roundBuf = Buffer.from(getRoundSvg());

  for (const [folder, sizes] of Object.entries(DENSITIES)) {
    const targetDir = path.join(RES_DIR, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. ic_launcher.png
    const iconBuf = await renderCleanPng(squareBuf, sizes.icon, sizes.icon);
    fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), iconBuf);

    // 2. ic_launcher_round.png
    const roundIconBuf = await renderCleanPng(roundBuf, sizes.icon, sizes.icon);
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundIconBuf);

    console.log(`✓ ${folder}: ic_launcher (${sizes.icon}x${sizes.icon}), ic_launcher_round (${sizes.icon}x${sizes.icon})`);
  }

  console.log('All Android launcher icons generated successfully!');
}

generateAllIcons().catch((err) => {
  console.error('Error generating launcher icons:', err);
  process.exit(1);
});

