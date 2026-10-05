/**
 * The hero backdrop: a starry sky, a big moon, layered ridges, and pines. Pure SVG + CSS animation (stars twinkle, the moon
 * breathes) — nothing loads from another host, so the CSP stays 'self'.
 */

// Fixed positions, so the sky looks the same on every visit.
const STARS = [
  [6, 12, 1.4],
  [14, 30, 1],
  [22, 8, 1.8],
  [31, 22, 1.1],
  [38, 6, 1.3],
  [47, 18, 1.6],
  [55, 34, 1],
  [60, 10, 1.2],
  [9, 44, 1.2],
  [27, 40, 1.5],
  [43, 46, 1],
  [52, 52, 1.3],
  [18, 56, 1],
  [35, 60, 1.2],
  [3, 26, 1],
  [64, 40, 1.1],
  [41, 30, 1],
  [12, 4, 1.1],
];

const PINES = [4, 9, 15, 21, 26, 58, 64, 71, 77, 83, 90, 96];

export default function NightScene() {
  return (
    <svg
      className="night-scene"
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ns-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14123a" />
          <stop offset="0.65" stopColor="#2c2870" />
          <stop offset="1" stopColor="#5b3f8f" />
        </linearGradient>
        <radialGradient id="ns-glow">
          <stop offset="0" stopColor="#ffe8a3" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe8a3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="100" height="60" fill="url(#ns-sky)" />
      <g className="night-scene__stars">
        {STARS.map(([x, y, r], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r * 0.3}
            fill="#fff4d6"
            style={{ animationDelay: `${(i * 0.37) % 3}s` }}
          />
        ))}
      </g>

      <g className="night-scene__moon">
        <circle cx="80" cy="16" r="16" fill="url(#ns-glow)" />
        <circle cx="80" cy="16" r="8.5" fill="#ffe8a3" />
        <circle cx="77" cy="13.5" r="1.6" fill="#f3d27c" />
        <circle cx="83" cy="19" r="1.1" fill="#f3d27c" />
        <circle cx="82.5" cy="12" r="0.8" fill="#f3d27c" />
      </g>

      <path
        d="M0 40 L14 30 L24 36 L38 25 L50 34 L62 27 L74 35 L86 28 L100 36 V60 H0 Z"
        fill="#3a2f7a"
      />
      <path d="M0 46 L18 38 L34 44 L52 37 L70 44 L88 39 L100 43 V60 H0 Z" fill="#251f5c" />
      {PINES.map((x, i) => {
        const h = 5 + ((i * 7) % 5);
        return <path key={x} d={`M${x} 52 L${x + 2} ${52 - h} L${x + 4} 52 Z`} fill="#171445" />;
      })}
      <path d="M0 52 Q25 48 50 51 T100 50 V60 H0 Z" fill="#171445" />
    </svg>
  );
}

/** The mascot: a wolf howling from a rock. Sits in the hero foreground. */
export function HowlingWolf({ className }) {
  return (
    <svg className={className} viewBox="-30 0 270 205" aria-hidden="true" focusable="false">
      <g>
        <path d="M-20 200 Q-30 168 10 158 L170 150 Q230 160 230 200 Z" fill="#100e33" />
        <path
          className="night-scene__wolf"
          d="M40 160 L46 118 L48 98 L42 80 L30 56 L20 36 L12 24 L26 24 L42 36 L48 30 L54 8 L62 34 L68 44 L82 70 L104 98 L128 124 L140 152 L166 160 L196 148 L182 166 L150 172 L120 166 L100 160 L84 162 L70 160 Z"
          fill="#100e33"
        />
      </g>
    </svg>
  );
}
