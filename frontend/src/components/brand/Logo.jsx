/** WolfMart's mark: a geometric wolf head in front of a rising moon. */
export function WolfMark({ size = 36, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="31" cy="17" r="15" fill="#ffe8a3" stroke="#1b1838" strokeWidth="2.5" />
      <path
        d="M7 6 L17 15 H27 L37 6 L35 25 L22 42 L9 25 Z"
        fill="#2c2870"
        stroke="#1b1838"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M17 31 L22 42 L27 31 Z" fill="#ff7a45" />
      <path
        d="M13 22 L18 24 M31 22 L26 24"
        stroke="#ffe8a3"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo__lockup">
      <WolfMark className="logo__mark" />
      <span className="logo__word">
        Wolf<span>Mart</span>
      </span>
    </span>
  );
}
