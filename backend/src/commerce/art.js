/**
 * Deterministic SVG product art, served from 'self' (CSP allows nothing else).
 *
 * Every product gets its own sticker-style illustration — a thick ink outline,
 * flat fills in the product's hue plus a complementary accent — on one of three
 * backdrops, so the gallery has something to page through:
 *   1. a moonlit ridge at night   2. a pastel close-up   3. a topo-map card
 *
 * Glyphs are drawn in a ±70 box around the origin and scaled into place.
 */

const INK = '#1b1838';
const CREAM = '#fff4d6';

const escapeXml = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/** Small seeded PRNG, so a product's stars land in the same place every time. */
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Ink outline at a given width. One attribute set, so overrides can't duplicate it. */
const s = (width = 5) =>
  `stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;
const line = (width = 5) => `fill="none" ${s(width)}`;
const S = s();
const LINE = line();

// ── Glyphs ───────────────────────────────────────────────────────────────────
// Each takes a palette { main, light, accent, dark } and returns SVG markup.

const GLYPHS = {
  // Apparel
  hoodie: (c) => `
    <path d="M-45 -35 Q-30 -58 0 -58 Q30 -58 45 -35 L70 -8 L56 12 L45 4 L45 60 L-45 60 L-45 4 L-56 12 L-70 -8 Z" fill="${c.main}" ${S}/>
    <ellipse cx="0" cy="-36" rx="20" ry="13" fill="${c.dark}" ${S}/>
    <path d="M-26 24 H26 V48 H-26 Z" fill="${c.light}" ${S}/>
    <path d="M-7 -23 V2 M7 -23 V2" ${LINE}/>`,
  tee: (c) => `
    <path d="M-30 -52 L-12 -52 Q0 -40 12 -52 L30 -52 L66 -26 L50 0 L36 -10 L36 56 L-36 56 L-36 -10 L-50 0 L-66 -26 Z" fill="${c.main}" ${S}/>
    <circle cx="0" cy="8" r="17" fill="${c.accent}" ${S}/>
    <circle cx="7" cy="2" r="13" fill="${c.main}"/>`,
  shell: (c) => `
    <path d="M-42 -40 Q-28 -60 0 -60 Q28 -60 42 -40 L68 30 L52 36 L44 10 L44 60 L-44 60 L-44 10 L-52 36 L-68 30 Z" fill="${c.main}" ${S}/>
    <path d="M0 -44 V60" ${LINE}/>
    <path d="M-32 22 H-12 M12 22 H32" ${LINE}/>
    <path d="M-20 -48 Q0 -34 20 -48" fill="${c.dark}" ${S}/>`,
  vest: (c) => `
    <path d="M-40 -52 L-16 -52 L0 -24 L16 -52 L40 -52 Q30 -20 44 0 L44 58 L-44 58 L-44 0 Q-30 -20 -40 -52 Z" fill="${c.main}" ${S}/>
    <path d="M-44 10 H44 M-44 34 H44" ${line(3)}/>
    <path d="M0 -24 V58" ${LINE}/>
    <rect x="-36" y="-14" width="22" height="12" rx="3" fill="${c.accent}" ${S}/>`,
  joggers: (c) => `
    <path d="M-36 -56 H36 L42 60 H12 L0 -12 L-12 60 H-42 Z" fill="${c.main}" ${S}/>
    <rect x="-38" y="-62" width="76" height="16" rx="5" fill="${c.accent}" ${S}/>
    <path d="M-6 -46 L-12 -30 M6 -46 L12 -30" ${line(3)}/>
    <path d="M-42 48 H-12 M12 48 H42" ${line(3)}/>`,
  beanie: (c) => `
    <circle cx="0" cy="-50" r="13" fill="${c.light}" ${S}/>
    <path d="M-50 22 Q-50 -42 0 -42 Q50 -42 50 22 Z" fill="${c.main}" ${S}/>
    <path d="M-25 -30 V18 M0 -40 V18 M25 -30 V18" ${line(3)}/>
    <rect x="-56" y="14" width="112" height="28" rx="8" fill="${c.accent}" ${S}/>`,
  flannel: (c) => `
    <path d="M-30 -52 L-12 -52 L0 -38 L12 -52 L30 -52 L66 -26 L50 0 L36 -10 L36 56 L-36 56 L-36 -10 L-50 0 L-66 -26 Z" fill="${c.main}" ${S}/>
    <path d="M-36 -10 H36 M-36 14 H36 M-36 38 H36 M-18 -46 V56 M18 -46 V56" fill="none" stroke="${c.dark}" stroke-width="5" opacity="0.55"/>
    <path d="M-12 -52 L0 -30 L12 -52" fill="${c.light}" ${S}/>
    <path d="M0 -30 V56" ${LINE}/>`,

  // Footwear
  boot: (c) => `
    <path d="M-44 -56 H-2 V-2 Q40 2 56 24 Q64 36 64 50 H-44 Z" fill="${c.main}" ${S}/>
    <rect x="-48" y="46" width="116" height="16" rx="6" fill="${c.dark}" ${S}/>
    <path d="M-2 -44 H-22 M-2 -28 H-22 M-2 -12 H-22" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>
    <path d="M-44 20 H20" ${line(3)}/>`,
  runner: (c) => `
    <path d="M-62 26 Q-62 -6 -40 -12 L-16 -18 Q4 4 34 10 Q62 16 62 34 V40 H-62 Z" fill="${c.main}" ${S}/>
    <rect x="-66" y="36" width="132" height="14" rx="7" fill="${c.light}" ${S}/>
    <path d="M-36 20 Q0 32 40 18" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>
    <path d="M-30 -8 L-22 6 M-18 -12 L-10 2" ${line(3)}/>`,
  slide: (c) => `
    <rect x="-64" y="10" width="128" height="30" rx="15" fill="${c.light}" ${S}/>
    <path d="M-30 14 Q-30 -36 10 -36 Q46 -36 46 14 Z" fill="${c.main}" ${S}/>
    <path d="M-14 -18 H30" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round"/>`,
  sock: (c) => `
    <path d="M-24 -62 H22 V2 Q22 14 34 24 L52 38 Q64 54 46 62 H-6 Q-24 60 -24 40 Z" fill="${c.main}" ${S}/>
    <path d="M-24 -48 H22 M-24 -36 H22" fill="none" stroke="${c.accent}" stroke-width="6"/>
    <path d="M-24 -62 H22 V-52 H-24 Z" fill="${c.light}" ${S}/>
    <circle cx="44" cy="50" r="7" fill="${c.accent}"/>`,
  gaiter: (c) => `
    <path d="M-34 -58 H34 L42 58 H-42 Z" fill="${c.main}" ${S}/>
    <path d="M-38 -10 H38 M-40 24 H40" ${line(3)}/>
    <rect x="-14" y="-4" width="28" height="22" rx="4" fill="${c.accent}" ${S}/>
    <path d="M-34 -58 H34 V-46 H-34 Z" fill="${c.light}" ${S}/>`,

  // Outdoor
  tent: (c) => `
    <path d="M-72 52 L0 -56 L72 52 Z" fill="${c.main}" ${S}/>
    <path d="M-22 52 L0 6 L22 52 Z" fill="${c.dark}" ${S}/>
    <path d="M0 -56 V-74" ${LINE}/>
    <path d="M0 -74 L22 -67 L0 -60 Z" fill="${c.accent}" ${S}/>
    <path d="M-36 52 L0 -2 M36 52 L0 -2" fill="none" stroke="${c.light}" stroke-width="3" opacity="0.8"/>`,
  headlamp: (c) => `
    <ellipse cx="0" cy="6" rx="62" ry="40" fill="none" stroke="${c.main}" stroke-width="14"/>
    <ellipse cx="0" cy="6" rx="62" ry="40" fill="none" ${S} opacity="0.3"/>
    <rect x="-28" y="12" width="56" height="44" rx="12" fill="${c.dark}" ${S}/>
    <circle cx="0" cy="34" r="14" fill="${CREAM}" ${S}/>
    <path d="M-24 -14 L-34 -36 M0 -18 V-44 M24 -14 L34 -36" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>`,
  pack: (c) => `
    <rect x="-44" y="-50" width="88" height="112" rx="26" fill="${c.main}" ${S}/>
    <path d="M-44 -18 Q0 -40 44 -18 V-26 Q44 -50 20 -50 H-20 Q-44 -50 -44 -26 Z" fill="${c.accent}" ${S}/>
    <rect x="-26" y="14" width="52" height="34" rx="10" fill="${c.light}" ${S}/>
    <path d="M-14 -50 Q-14 -66 0 -66 Q14 -66 14 -50" ${LINE}/>`,
  sleepingbag: (c) => `
    <g transform="rotate(-18)">
      <rect x="-30" y="-66" width="60" height="132" rx="30" fill="${c.main}" ${S}/>
      <ellipse cx="0" cy="-40" rx="20" ry="16" fill="${c.dark}" ${S}/>
      <path d="M22 -20 V54" fill="none" stroke="${c.accent}" stroke-width="5" stroke-dasharray="6 6"/>
      <path d="M-30 6 H30 M-30 32 H30" ${line(3)}/>
    </g>`,
  poles: (c) => `
    <path d="M-40 -60 L22 64 M40 -60 L-22 64" ${line(7)}/>
    <path d="M-40 -60 L22 64 M40 -60 L-22 64" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>
    <rect x="-52" y="-72" width="22" height="36" rx="8" transform="rotate(-26 -41 -54)" fill="${c.accent}" ${S}/>
    <rect x="30" y="-72" width="22" height="36" rx="8" transform="rotate(26 41 -54)" fill="${c.accent}" ${S}/>
    <ellipse cx="16" cy="50" rx="14" ry="5" fill="${c.main}" ${S}/>
    <ellipse cx="-16" cy="50" rx="14" ry="5" fill="${c.main}" ${S}/>`,
  filter: (c) => `
    <path d="M-34 -30 Q-40 60 0 60 Q40 60 34 -30 Z" fill="${c.light}" ${S}/>
    <path d="M-36 -2 Q0 8 36 -2 L36 10 Q-2 20 -37 10 Z" fill="${c.main}" opacity="0.7"/>
    <rect x="-16" y="-58" width="32" height="30" rx="6" fill="${c.main}" ${S}/>
    <rect x="-8" y="-72" width="16" height="16" rx="4" fill="${c.accent}" ${S}/>
    <path d="M-12 26 Q-4 20 0 30" ${line(3)}/>`,

  // Home
  throw: (c) => `
    <path d="M-60 -40 H60 V36 Q0 50 -60 36 Z" fill="${c.main}" ${S}/>
    <path d="M-60 -16 H60 M-60 10 H60 M-28 -40 V44 M24 -40 V44" fill="none" stroke="${c.accent}" stroke-width="6" opacity="0.85"/>
    <path d="M-60 -40 Q0 -54 60 -40 Q60 -26 0 -26 Q-60 -26 -60 -40 Z" fill="${c.light}" ${S}/>
    <path d="M-50 44 V56 M-30 47 V60 M-10 49 V62 M10 49 V62 M30 47 V60 M50 44 V56" ${line(3)}/>`,
  mug: (c) => `
    <path d="M-44 -30 H30 V40 Q30 58 12 58 H-26 Q-44 58 -44 40 Z" fill="${c.main}" ${S}/>
    <path d="M30 -14 Q58 -14 58 12 Q58 36 30 36" fill="none" ${s(9)}/>
    <path d="M30 -14 Q58 -14 58 12 Q58 36 30 36" fill="none" stroke="${c.main}" stroke-width="3"/>
    <circle cx="-8" cy="14" r="15" fill="${CREAM}" ${S}/>
    <path d="M-24 -44 Q-30 -54 -22 -62 M-4 -44 Q-10 -54 -2 -62" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>`,
  candle: (c) => `
    <rect x="-38" y="-16" width="76" height="76" rx="14" fill="${c.main}" ${S}/>
    <rect x="-30" y="10" width="60" height="26" rx="4" fill="${CREAM}" ${S}/>
    <path d="M0 -16 V-28" ${LINE}/>
    <path d="M0 -70 Q18 -48 0 -30 Q-18 -48 0 -70 Z" fill="${c.accent}" ${S}/>
    <path d="M0 -50 Q7 -42 0 -36 Q-7 -42 0 -50 Z" fill="${CREAM}"/>`,
  frame: (c) => `
    <rect x="-56" y="-56" width="112" height="112" rx="8" fill="${c.main}" ${S}/>
    <rect x="-38" y="-38" width="76" height="76" fill="${c.light}" ${S}/>
    <circle cx="16" cy="-14" r="10" fill="${c.accent}"/>
    <path d="M-38 38 L-10 2 L8 22 L22 8 L38 26 V38 Z" fill="${c.dark}" ${S}/>`,
  lamp: (c) => `
    <circle cx="0" cy="-20" r="44" fill="${CREAM}" ${S}/>
    <circle cx="-14" cy="-32" r="8" fill="${c.light}"/>
    <circle cx="16" cy="-6" r="11" fill="${c.light}"/>
    <circle cx="10" cy="-40" r="5" fill="${c.light}"/>
    <path d="M0 24 V48" ${line(8)}/>
    <rect x="-34" y="46" width="68" height="16" rx="8" fill="${c.main}" ${S}/>`,
  map: (c) => `
    <path d="M-60 -44 L-20 -56 L20 -44 L60 -56 V52 L20 64 L-20 52 L-60 64 Z" fill="${c.light}" ${S}/>
    <path d="M-20 -56 V52 M20 -44 V64" ${line(3)}/>
    <path d="M-46 40 Q-30 0 -6 10 Q20 22 30 -14" fill="none" stroke="${c.accent}" stroke-width="5" stroke-dasharray="8 7" stroke-linecap="round"/>
    <path d="M24 -26 L40 -10 M40 -26 L24 -10" fill="none" stroke="${c.dark}" stroke-width="6" stroke-linecap="round"/>`,
  doormat: (c) => `
    <rect x="-68" y="-40" width="136" height="80" rx="14" fill="${c.main}" ${S}/>
    <rect x="-56" y="-28" width="112" height="56" rx="8" fill="none" stroke="${c.dark}" stroke-width="4" stroke-dasharray="4 6"/>
    <path d="M-38 -6 L-30 10 L-22 -6 L-14 10 L-6 -6 M8 -6 V10 M8 -6 H20 M8 2 H18 M8 10 H20 M30 -6 V10 H42" fill="none" stroke="${CREAM}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Kitchen
  skillet: (c) => `
    <rect x="34" y="-10" width="40" height="18" rx="8" transform="rotate(-20 34 0)" fill="${c.dark}" ${S}/>
    <circle cx="-10" cy="8" r="52" fill="${c.dark}" ${S}/>
    <circle cx="-10" cy="8" r="38" fill="${c.main}"/>
    <ellipse cx="-22" cy="-2" rx="14" ry="10" fill="${CREAM}" ${s(3)}/>
    <circle cx="-20" cy="0" r="6" fill="${c.accent}"/>`,
  percolator: (c) => `
    <path d="M-36 -36 H36 L44 56 H-44 Z" fill="${c.main}" ${S}/>
    <path d="M36 -20 Q62 -20 60 14 Q58 36 40 40" fill="none" ${s(8)}/>
    <path d="M-36 -24 L-62 -50" ${line(9)}/>
    <path d="M-30 -36 Q0 -52 30 -36 Z" fill="${c.light}" ${S}/>
    <circle cx="0" cy="-54" r="10" fill="${c.accent}" ${S}/>`,
  spork: (c) => `
    <g transform="rotate(-30)">
      <rect x="-8" y="-6" width="16" height="74" rx="8" fill="${c.main}" ${S}/>
      <path d="M-24 -40 Q-24 -2 0 -2 Q24 -2 24 -40 L24 -62 L14 -48 L4 -62 L-4 -62 L-14 -48 L-24 -62 Z" fill="${c.main}" ${S}/>
      <circle cx="0" cy="50" r="5" fill="${c.accent}"/>
    </g>`,
  trailmix: (c) => `
    <path d="M-44 -50 H44 L40 60 H-40 Z" fill="${c.main}" ${S}/>
    <path d="M-44 -50 H44 V-36 H-44 Z" fill="${c.accent}" ${S}/>
    <ellipse cx="0" cy="14" rx="26" ry="26" fill="${CREAM}" ${S}/>
    <circle cx="-8" cy="8" r="6" fill="${c.dark}"/><circle cx="8" cy="12" r="5" fill="${c.accent}"/>
    <circle cx="-2" cy="24" r="5" fill="#b46a2a"/><circle cx="10" cy="-2" r="4" fill="#7a4a1d"/>`,
  tongs: (c) => `
    <path d="M-12 -64 L-34 58 M12 -64 L34 58" ${line(11)}/>
    <path d="M-12 -64 L-34 58 M12 -64 L34 58" fill="none" stroke="${c.light}" stroke-width="4" stroke-linecap="round"/>
    <path d="M-12 -64 Q0 -76 12 -64" ${line(8)}/>
    <rect x="-22" y="-44" width="44" height="22" rx="10" fill="${c.accent}" ${S}/>
    <path d="M-40 50 Q-34 66 -26 52 M40 50 Q34 66 26 52" ${LINE}/>`,
  dutchoven: (c) => `
    <path d="M-52 -14 H52 V36 Q52 58 30 58 H-30 Q-52 58 -52 36 Z" fill="${c.main}" ${S}/>
    <path d="M-52 -2 H-68 M52 -2 H68" ${line(9)}/>
    <path d="M-58 -14 Q0 -40 58 -14 Z" fill="${c.main}" ${S}/>
    <rect x="-12" y="-42" width="24" height="12" rx="5" fill="${c.accent}" ${S}/>
    <path d="M-52 12 H52" fill="none" stroke="${CREAM}" stroke-width="4" opacity="0.7"/>`,
  bottle: (c) => `
    <rect x="-28" y="-40" width="56" height="104" rx="18" fill="${c.main}" ${S}/>
    <rect x="-20" y="-62" width="40" height="26" rx="7" fill="${c.dark}" ${S}/>
    <path d="M-20 -54 Q-38 -54 -38 -40" ${LINE}/>
    <rect x="-28" y="4" width="56" height="20" fill="${c.accent}" ${S}/>
    <path d="M-14 -24 V-4" fill="none" stroke="${CREAM}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`,

  // Tech
  powerbank: (c) => `
    <rect x="-36" y="-60" width="72" height="120" rx="16" fill="${c.main}" ${S}/>
    <rect x="-22" y="-42" width="44" height="60" rx="6" fill="${c.dark}" ${S}/>
    <path d="M4 -34 L-10 -8 H2 L-4 12 L12 -16 H0 Z" fill="${c.accent}" ${s(3)}/>
    <circle cx="-10" cy="38" r="4" fill="${CREAM}"/><circle cx="2" cy="38" r="4" fill="${CREAM}"/><circle cx="14" cy="38" r="4" fill="${c.light}"/>`,
  speaker: (c) => `
    <rect x="-38" y="-62" width="76" height="124" rx="30" fill="${c.main}" ${S}/>
    <circle cx="0" cy="12" r="26" fill="${c.dark}" ${S}/>
    <circle cx="0" cy="12" r="10" fill="${c.accent}" ${s(3)}/>
    <circle cx="0" cy="-36" r="9" fill="${c.dark}" ${s(3)}/>
    <path d="M50 -8 Q60 12 50 32 M60 -18 Q74 12 60 42" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>`,
  solar: (c) => `
    <g transform="rotate(-10)">
      <rect x="-64" y="-46" width="128" height="80" rx="6" fill="${c.dark}" ${S}/>
      <path d="M-22 -46 V34 M22 -46 V34 M-64 -6 H64" fill="none" stroke="${c.light}" stroke-width="3"/>
      <path d="M-56 -38 L-34 -38 L-56 -16 Z" fill="${CREAM}" opacity="0.6"/>
    </g>
    <path d="M0 40 V60 M-26 60 H26" ${line(6)}/>
    <circle cx="52" cy="-58" r="12" fill="${c.accent}" ${S}/>`,
  watch: (c) => `
    <rect x="-22" y="-72" width="44" height="144" rx="12" fill="${c.main}" ${S}/>
    <circle cx="0" cy="0" r="38" fill="${c.dark}" ${S}/>
    <circle cx="0" cy="0" r="28" fill="${CREAM}" ${s(3)}/>
    <path d="M0 0 V-18 M0 0 L12 8" ${line(4)}/>
    <path d="M-20 14 L-8 0 L4 10 L20 -8" fill="none" stroke="${c.accent}" stroke-width="3" stroke-linecap="round"/>`,
  lantern: (c) => `
    <path d="M-16 -62 Q0 -76 16 -62" ${LINE}/>
    <rect x="-30" y="-58" width="60" height="16" rx="6" fill="${c.main}" ${S}/>
    <rect x="-26" y="-42" width="52" height="76" rx="12" fill="${CREAM}" ${S}/>
    <path d="M0 -24 Q14 -6 0 10 Q-14 -6 0 -24 Z" fill="${c.accent}"/>
    <rect x="-34" y="34" width="68" height="22" rx="8" fill="${c.main}" ${S}/>`,
  phone: (c) => `
    <rect x="-40" y="-68" width="80" height="136" rx="18" fill="${c.main}" ${S}/>
    <rect x="-28" y="-56" width="40" height="40" rx="10" fill="${c.dark}" ${S}/>
    <circle cx="-16" cy="-44" r="6" fill="${c.light}"/><circle cx="0" cy="-28" r="6" fill="${c.light}"/>
    <path d="M-40 30 H40" ${line(3)}/>
    <circle cx="26" cy="52" r="6" fill="none" stroke="${c.accent}" stroke-width="4"/>`,
  radio: (c) => `
    <path d="M30 -30 L54 -70" ${LINE}/>
    <rect x="-60" y="-30" width="120" height="84" rx="14" fill="${c.main}" ${S}/>
    <circle cx="-26" cy="12" r="22" fill="${c.dark}" ${S}/>
    <path d="M-36 4 H-16 M-38 12 H-14 M-36 20 H-16" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>
    <rect x="10" y="-14" width="38" height="18" rx="4" fill="${CREAM}" ${s(3)}/>
    <circle cx="29" cy="30" r="10" fill="${c.accent}" ${S}/>`,
};

/** Which illustration each seeded product gets. Unknown slugs fall back by category. */
const PRODUCT_GLYPHS = {
  'howl-hoodie': 'hoodie',
  'moonrise-tee': 'tee',
  'alpha-rain-shell': 'shell',
  'packleader-vest': 'vest',
  'den-joggers': 'joggers',
  'tundra-beanie': 'beanie',
  'scout-flannel': 'flannel',
  'ridgeline-boot': 'boot',
  'trailhead-runner': 'runner',
  'campfire-slide': 'slide',
  'urban-prowler': 'runner',
  'snowpack-boot': 'boot',
  'merino-hike-sock': 'sock',
  'gaiter-pro': 'gaiter',
  'lone-wolf-tent': 'tent',
  'pack-den-tent': 'tent',
  'nightwatch-headlamp': 'headlamp',
  'ridge-pack-45': 'pack',
  'den-sleeping-bag': 'sleepingbag',
  'trail-poles': 'poles',
  'water-filter': 'filter',
  'fireside-throw': 'throw',
  'howling-mug-set': 'mug',
  'den-candle': 'candle',
  'pack-photo-frame': 'frame',
  'moonlight-lamp': 'lamp',
  'trail-map-print': 'map',
  'den-doormat': 'doormat',
  'cast-iron-skillet': 'skillet',
  'camp-percolator': 'percolator',
  'titanium-spork': 'spork',
  'trail-mix-sampler': 'trailmix',
  'ember-grill-tongs': 'tongs',
  'den-dutch-oven': 'dutchoven',
  'insulated-bottle': 'bottle',
  'wolfpack-power-bank': 'powerbank',
  'howl-speaker': 'speaker',
  'solar-panel': 'solar',
  'trail-gps': 'watch',
  'camp-lantern': 'lantern',
  'ruggedized-case': 'phone',
  'emergency-radio': 'radio',
};

export const CATEGORY_ART = {
  apparel: { glyph: 'hoodie', hue: 262 },
  footwear: { glyph: 'boot', hue: 22 },
  outdoor: { glyph: 'tent', hue: 152 },
  home: { glyph: 'lamp', hue: 330 },
  kitchen: { glyph: 'skillet', hue: 8 },
  tech: { glyph: 'speaker', hue: 200 },
};

function palette(hue) {
  return {
    main: `hsl(${hue} 72% 62%)`,
    light: `hsl(${hue} 85% 86%)`,
    dark: `hsl(${hue} 45% 26%)`,
    accent: `hsl(${(hue + 165) % 360} 90% 62%)`,
  };
}

function stars(rand, count, maxY) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * 400);
    const y = Math.round(rand() * maxY);
    const r = (rand() * 1.6 + 0.6).toFixed(1);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${CREAM}" opacity="${(rand() * 0.6 + 0.4).toFixed(2)}"/>`;
  }
  return out;
}

function sparkle(x, y, size, fill) {
  const s = size;
  return `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z" fill="${fill}"/>`;
}

const pines = (y, color, rand) => {
  let out = '';
  for (let x = -10; x < 420; x += 26 + Math.round(rand() * 16)) {
    const h = 26 + Math.round(rand() * 22);
    out += `<path d="M${x} ${y} L${x + 11} ${y - h} L${x + 22} ${y} Z" fill="${color}"/>`;
  }
  return out;
};

/** Backdrop 1: a moonlit ridge with stars and pines. */
function nightScene(hue, rand) {
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${(hue + 230) % 360} 55% 16%)"/>
      <stop offset="1" stop-color="hsl(${hue} 55% 30%)"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${CREAM}" stop-opacity="0.55"/><stop offset="1" stop-color="${CREAM}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#sky)"/>
  ${stars(rand, 26, 220)}
  <circle cx="318" cy="78" r="70" fill="url(#glow)"/>
  <circle cx="318" cy="78" r="30" fill="${CREAM}"/>
  <circle cx="306" cy="70" r="6" fill="hsl(45 60% 85%)"/><circle cx="326" cy="90" r="4" fill="hsl(45 60% 85%)"/>
  <path d="M0 290 L70 220 L120 255 L200 190 L270 245 L330 205 L400 250 V400 H0 Z" fill="hsl(${hue} 40% 22%)"/>
  ${pines(340, `hsl(${hue} 45% 13%)`, rand)}
  <path d="M0 330 Q100 300 200 322 T400 318 V400 H0 Z" fill="hsl(${hue} 45% 13%)"/>`;
}

/** Backdrop 2: a pastel close-up with polka dots and sparkles. */
function pastelScene(hue, rand) {
  let dots = '';
  for (let y = 20; y < 400; y += 40) {
    for (let x = (y / 40) % 2 ? 20 : 40; x < 400; x += 40) {
      dots += `<circle cx="${x}" cy="${y}" r="3" fill="hsl(${hue} 60% 78%)"/>`;
    }
  }
  return `
  <rect width="400" height="400" fill="hsl(${hue} 80% 92%)"/>
  ${dots}
  <circle cx="200" cy="205" r="138" fill="hsl(${hue} 85% 96%)" stroke="${INK}" stroke-width="5"/>
  ${sparkle(70 + Math.round(rand() * 20), 80, 16, `hsl(${(hue + 165) % 360} 90% 62%)`)}
  ${sparkle(330, 320, 12, INK)}
  ${sparkle(340, 70, 9, `hsl(${(hue + 165) % 360} 90% 62%)`)}`;
}

/** Backdrop 3: a topographic-map card. */
function topoScene(hue) {
  let rings = '';
  for (let i = 1; i <= 7; i++) {
    const r = i * 34;
    rings += `<path d="M${200 - r} 200 Q${200 - r} ${200 - r * 0.8} 200 ${200 - r * 0.9} Q${200 + r * 1.1} ${200 - r} ${200 + r} 205 Q${200 + r * 0.9} ${200 + r} 200 ${200 + r * 0.85} Q${200 - r * 1.05} ${200 + r * 0.9} ${200 - r} 200 Z" fill="none" stroke="hsl(${hue} 50% 45%)" stroke-width="2" opacity="0.35"/>`;
  }
  return `
  <rect width="400" height="400" fill="hsl(${(hue + 165) % 360} 70% 88%)"/>
  <g transform="translate(-30 -20)">${rings}</g>
  <rect x="16" y="16" width="368" height="368" rx="22" fill="none" stroke="${INK}" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/>`;
}

function glyphMarkup(glyph, hue) {
  return (GLYPHS[glyph] ?? GLYPHS.tent)(palette(hue));
}

/**
 * @param {{ slug: string, name: string, hue: number, category?: { slug: string } }} product
 * @param {1|2|3} n which gallery composition
 */
export function productArt({ slug, name, hue, category }, n) {
  const glyph = PRODUCT_GLYPHS[slug] ?? CATEGORY_ART[category?.slug]?.glyph ?? 'tent';
  return renderArt({ seed: slug ?? name, label: name, glyph, hue, n });
}

export function categoryArt(slug) {
  const art = CATEGORY_ART[slug];
  if (!art) return null;
  return renderArt({ seed: slug, label: slug, glyph: art.glyph, hue: art.hue, n: 2 });
}

function renderArt({ seed, label, glyph, hue, n }) {
  const rand = rng(`${seed}:${n}`);
  const body = glyphMarkup(glyph, hue);
  let scene;
  let placed;
  if (n === 2) {
    scene = pastelScene(hue, rand);
    placed = `<g transform="translate(200 210) scale(1.55)">${body}</g>`;
  } else if (n === 3) {
    scene = topoScene(hue);
    placed = `<g transform="translate(200 205) rotate(-8) scale(1.85)">${body}</g>`;
  } else {
    scene = nightScene(hue, rand);
    placed = `
    <ellipse cx="200" cy="318" rx="92" ry="14" fill="#000" opacity="0.3"/>
    <g transform="translate(200 214) scale(1.45)">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${escapeXml(label)}">${scene}${placed}</svg>`;
}
