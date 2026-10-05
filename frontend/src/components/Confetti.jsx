import { useMemo } from 'react';

const COLORS = ['#ff7a45', '#ffe8a3', '#8fa8ff', '#ff5d8f', '#2f9e78', '#2c2870'];

/** A one-shot burst for the order confirmation. Hidden under reduced motion. */
export default function Confetti({ pieces = 70 }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${((i * 53) % 900) / 1000}s`,
        duration: `${2.2 + ((i * 29) % 140) / 100}s`,
        drift: `${((i * 61) % 160) - 80}px`,
        spin: `${((i * 97) % 720) - 360}deg`,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    [pieces],
  );

  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className={b.round ? 'confetti__bit confetti__bit--round' : 'confetti__bit'}
          style={{
            left: b.left,
            background: b.color,
            animationDelay: b.delay,
            animationDuration: b.duration,
            '--drift': b.drift,
            '--spin': b.spin,
          }}
        />
      ))}
    </div>
  );
}
