/**
 * Deterministic SVG product art: a moonlit ridge in the product's hue, with a
 * category glyph. Three compositions give the gallery something to page through.
 */

const GLYPHS = {
  apparel: 'M-34 -30 L-14 -40 Q0 -30 14 -40 L34 -30 L44 -8 L28 0 L28 40 L-28 40 L-28 0 L-44 -8 Z',
  footwear: 'M-46 20 L-46 -14 L-22 -14 L-18 0 Q10 4 32 10 Q46 14 46 24 L46 30 L-46 30 Z',
  outdoor: 'M-48 36 L0 -40 L48 36 Z M-10 36 L0 14 L10 36 Z',
  home: 'M-40 -4 L0 -38 L40 -4 L40 38 L-40 38 Z M-10 38 L-10 12 L10 12 L10 38 Z',
  kitchen: 'M-44 -6 L28 -6 L28 4 Q28 34 -8 34 Q-44 34 -44 4 Z M28 -2 L52 -10 L54 -4 L30 4 Z',
  tech: 'M-28 -42 L28 -42 Q34 -42 34 -36 L34 36 Q34 42 28 42 L-28 42 Q-34 42 -34 36 L-34 -36 Q-34 -42 -28 -42 Z',
};

const escapeXml = (s) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

export function productArt({ name, hue, category }, n) {
  const sky = `hsl(${hue} 45% ${n === 2 ? 22 : 30}%)`;
  const glow = `hsl(${(hue + 40) % 360} 70% 78%)`;
  const ridgeBack = `hsl(${hue} 30% ${n === 3 ? 40 : 18}%)`;
  const ridgeFront = `hsl(${hue} 35% 12%)`;
  const glyph = GLYPHS[category?.slug] ?? GLYPHS.outdoor;
  const moonX = [0, 300, 120, 220][n] ?? 300;
  const scale = n === 3 ? 2.4 : 1.6;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${escapeXml(name)}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky}"/>
      <stop offset="1" stop-color="hsl(${hue} 40% 8%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#sky)"/>
  <circle cx="${moonX}" cy="90" r="46" fill="${glow}" opacity="0.9"/>
  <path d="M0 300 L70 210 L130 260 L210 170 L290 250 L340 200 L400 250 L400 400 L0 400 Z" fill="${ridgeBack}"/>
  <path d="M0 340 L90 280 L170 320 L260 260 L400 330 L400 400 L0 400 Z" fill="${ridgeFront}"/>
  <g transform="translate(200 230) scale(${scale})" fill="${glow}" fill-opacity="0.92">
    <path d="${glyph}" fill-rule="evenodd"/>
  </g>
</svg>`;
}
