/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a crisp SVG Data URL with a vibrant theme gradient background
 * and centered first-letter avatar when no custom profile image is provided.
 */
export const getLetterAvatar = (name: string = 'Relay', size = 200): string => {
  const clean = name.trim();
  const letter = (clean[0] || 'R').toUpperCase();

  // Vibrant gradient combinations matching Relay theme palettes
  const gradients = [
    { start: '#2563EB', end: '#1D4ED8' }, // Azure
    { start: '#7C3AED', end: '#6D28D9' }, // Violet
    { start: '#059669', end: '#047857' }, // Emerald
    { start: '#E11D48', end: '#BE123C' }, // Rose
    { start: '#D97706', end: '#B45309' }, // Amber
    { start: '#0891B2', end: '#0E7490' }, // Cyan
    { start: '#4F46E5', end: '#4338CA' }, // Indigo
    { start: '#DB2777', end: '#BE185D' }, // Pink
  ];

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const grad = gradients[Math.abs(hash) % gradients.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${grad.start}"/>
        <stop offset="100%" stop-color="${grad.end}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${Math.floor(size / 3)}" fill="url(#g)"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="${Math.floor(size * 0.45)}" font-weight="700" fill="#ffffff">${letter}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
