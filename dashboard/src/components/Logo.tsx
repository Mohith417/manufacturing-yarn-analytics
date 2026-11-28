/**
 * Compact mark for the landing header: three concentric rings and a centre
 * dot, the wave field reduced to a lens. Reads at 20px where the spool
 * illustration turns into a smudge.
 */
export function RingMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
        <circle cx="16" cy="16" r="11" strokeWidth="1.3" opacity="0.34" />
        <circle cx="16" cy="16" r="6.6" strokeWidth="1.5" opacity="0.7" />
      </g>
      <circle cx="16" cy="16" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * YarnLens mark: a yarn spool whose thread unwinds into a rising data line.
 * Inline SVG so it inherits nothing from the network and stays crisp.
 */
export default function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="YarnLens">
      <path d="M22 14h20v36H22z" fill="#FFFFFF" opacity="0.16" />
      <path
        d="M22 14h20M22 50h20"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M22 22c6 0 6 6 12 6s6-6 12-6"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M22 31c6 0 6 6 12 6s6-6 12-6"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M34 44l4-8 4 4 6-10"
        stroke="#FFFFFF"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="30" r="2.6" fill="#FFFFFF" />
    </svg>
  );
}
