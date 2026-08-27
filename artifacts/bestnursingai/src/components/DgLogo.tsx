import React, { useId } from 'react';

/**
 * The BNP DecisionGuard mark.
 *
 * Reconstructed as inline SVG from the brand frame in the Figma file
 * (OnemVilIELvND43M7ahdIJ, node 2:2): a rounded square carrying the brand
 * gradient, a check for the "verified decision", and the small source-marks
 * column on the start side. The exported asset itself could not be downloaded
 * here — this environment's egress policy refuses figma.com — so this is a
 * faithful redraw; swap in the exported SVG if pixel-exactness ever matters.
 *
 * The gradient id comes from useId so two marks on one screen (sidebar and
 * login) don't fight over a shared SVG id.
 */
const DgLogo: React.FC<{ size?: number; className?: string }> = ({
  size = 48,
  className = '',
}) => {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="BNP DecisionGuard"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#061b3a" />
          <stop offset="1" stopColor="#00a6a6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="92" height="92" rx="22" fill={`url(#${id})`} />
      <path
        d="M36 50 l12 13 l22 -28"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="32" r="4.5" fill="#2bc4c4" />
      <circle cx="26" cy="46" r="4.5" fill="#8fe6e6" />
      <rect x="21.5" y="58" width="9" height="5" rx="2.5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
};

export default DgLogo;
