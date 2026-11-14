import React from 'react';

export const GoldenBellIllustration: React.FC<{ className?: string }> = ({ className = 'w-20 h-20' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    {/* Warm outer glow */}
    <circle cx="60" cy="60" r="50" fill="url(#bellGlow)" opacity="0.35" />
    {/* Sparkle stars */}
    <path d="M22 30L25 36L31 39L25 42L22 48L19 42L13 39L19 36L22 30Z" fill="#FEF08A" />
    <path d="M98 24L100 29L105 31L100 33L98 38L96 33L91 31L96 29L98 24Z" fill="#FFFBEB" />
    <circle cx="95" cy="78" r="4" fill="#FDE047" />
    {/* Bell top crown ring */}
    <circle cx="60" cy="23" r="7" stroke="#92400E" strokeWidth="4" fill="#FDE047" />
    {/* Bell body */}
    <path
      d="M60 28C41 28 31 42 29 61L24 80C23 84 26 88 30 88H90C94 88 97 84 96 80L91 61C89 42 79 28 60 28Z"
      fill="url(#bellGold)"
      stroke="#92400E"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    {/* Bell highlight */}
    <path
      d="M44 42C39 49 37 59 35 72"
      stroke="#FEF9C3"
      strokeWidth="5"
      strokeLinecap="round"
      opacity="0.8"
    />
    {/* Bell bottom rim */}
    <rect x="21" y="81" width="78" height="10" rx="5" fill="url(#bellRim)" stroke="#92400E" strokeWidth="3" />
    {/* Bell clapper */}
    <circle cx="60" cy="96" r="8" fill="#EA580C" stroke="#7C2D12" strokeWidth="3" />
    {/* Cute star emblem on bell */}
    <path
      d="M60 47L63.8 54.6L72.2 55.8L66.1 61.7L67.5 70L60 66.1L52.5 70L53.9 61.7L47.8 55.8L56.2 54.6L60 47Z"
      fill="#FFFBEB"
      stroke="#D97706"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <defs>
      <radialGradient id="bellGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(60 60) rotate(90) scale(50)">
        <stop stopColor="#FEF08A" />
        <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="bellGold" x1="30" y1="28" x2="90" y2="88" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FEF08A" />
        <stop offset="0.5" stopColor="#FACC15" />
        <stop offset="1" stopColor="#EA580C" />
      </linearGradient>
      <linearGradient id="bellRim" x1="21" y1="81" x2="99" y2="91" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FDE047" />
        <stop offset="1" stopColor="#D97706" />
      </linearGradient>
    </defs>
  </svg>
);

export const FlashcardsIllustration: React.FC<{ className?: string }> = ({ className = 'w-20 h-20' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    {/* Back tilted card */}
    <g transform="rotate(-12 52 60)">
      <rect x="20" y="24" width="60" height="74" rx="14" fill="#A78BFA" stroke="#312E81" strokeWidth="3.5" />
      <rect x="29" y="36" width="26" height="6" rx="3" fill="#DDD6FE" />
    </g>
    {/* Front main flashcard */}
    <g transform="rotate(7 66 60)">
      <rect x="34" y="22" width="62" height="76" rx="14" fill="#FFFFFF" stroke="#312E81" strokeWidth="3.5" />
      <rect x="42" y="32" width="46" height="22" rx="8" fill="url(#cardHeader)" />
      {/* Lightning / Brain spark */}
      <path d="M67 35L60 45H66L63 53L71 42H65L67 35Z" fill="#FEF08A" />
      <rect x="44" y="62" width="42" height="6" rx="3" fill="#CBD5E1" />
      <rect x="44" y="74" width="30" height="6" rx="3" fill="#E2E8F0" />
    </g>
    {/* Flip circular badge */}
    <circle cx="88" cy="88" r="14" fill="#38BDF8" stroke="#1E1B4B" strokeWidth="3" />
    <path d="M83 88C83 84.8 85.6 82.5 88.8 82.5C90.6 82.5 92.2 83.3 93.2 84.5M93 88C93 91.2 90.4 93.5 87.2 93.5C85.4 93.5 83.8 92.7 82.8 91.5" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="cardHeader" x1="42" y1="32" x2="88" y2="54" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3B82F6" />
        <stop offset="1" stopColor="#7C3AED" />
      </linearGradient>
    </defs>
  </svg>
);

export const BoatRaceIllustration: React.FC<{ className?: string }> = ({ className = 'w-20 h-20' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    {/* Sun / Finish flag */}
    <circle cx="92" cy="28" r="10" fill="#FDE047" />
    {/* Mast */}
    <rect x="56" y="24" width="5" height="52" rx="2.5" fill="#78350F" />
    {/* Big primary sail */}
    <path d="M61 26L94 64H61V26Z" fill="#FEF08A" stroke="#065F46" strokeWidth="3" strokeLinejoin="round" />
    {/* Secondary orange sail */}
    <path d="M56 32L32 64H56V32Z" fill="#FB923C" stroke="#065F46" strokeWidth="3" strokeLinejoin="round" />
    {/* Boat hull */}
    <path
      d="M22 72H98L87 90C85.5 92.5 82.8 94 79.8 94H40.2C37.2 94 34.5 92.5 33 90L22 72Z"
      fill="url(#hullGrad)"
      stroke="#064E3B"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    {/* Hull stripe */}
    <path d="M30 80H90" stroke="#A7F3D0" strokeWidth="4" strokeLinecap="round" />
    {/* Ocean waves */}
    <path
      d="M12 96C20 91 28 91 36 96C44 101 52 101 60 96C68 91 76 91 84 96C92 101 100 101 108 96"
      stroke="#CCFBF1"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M18 106C25 102 33 102 40 106C48 110 56 110 64 106C72 102 80 102 88 106C95 110 102 110 108 106"
      stroke="#99F6E4"
      strokeWidth="4"
      strokeLinecap="round"
      opacity="0.75"
    />
    <defs>
      <linearGradient id="hullGrad" x1="22" y1="72" x2="98" y2="94" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#D1FAE5" />
      </linearGradient>
    </defs>
  </svg>
);

export const TrophyStageIllustration: React.FC<{ className?: string }> = ({ className = 'w-28 h-28' }) => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
    <circle cx="70" cy="66" r="56" fill="url(#trophyGlow)" opacity="0.4" />
    {/* Left & right handles */}
    <path d="M40 38H26C21 38 18 43 20 50C22 59 31 66 43 66" stroke="#D97706" strokeWidth="7" strokeLinecap="round" />
    <path d="M100 38H114C119 38 122 43 120 50C118 59 109 66 97 66" stroke="#D97706" strokeWidth="7" strokeLinecap="round" />
    {/* Cup body */}
    <path
      d="M38 28H102V54C102 74 88 89 70 89C52 89 38 74 38 54V28Z"
      fill="url(#cupGold)"
      stroke="#92400E"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    {/* Cup shine */}
    <path d="M50 38V56C50 66 54 73 60 77" stroke="#FEF9C3" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
    {/* Stem */}
    <rect x="62" y="88" width="16" height="18" rx="3" fill="#F59E0B" stroke="#92400E" strokeWidth="3.5" />
    {/* Pedestal base */}
    <rect x="44" y="104" width="52" height="16" rx="6" fill="#78350F" stroke="#451A03" strokeWidth="3.5" />
    <rect x="52" y="109" width="36" height="6" rx="3" fill="#FDE047" />
    {/* Star emblem */}
    <path
      d="M70 42L74.3 50.6L83.8 52L76.9 58.7L78.5 68.2L70 63.7L61.5 68.2L63.1 58.7L56.2 52L65.7 50.6L70 42Z"
      fill="#FFFBEB"
      stroke="#B45309"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Sparkles */}
    <path d="M24 22L26 27L31 29L26 31L24 36L22 31L17 29L22 27L24 22Z" fill="#FDE047" />
    <path d="M118 22L120 27L125 29L120 31L118 36L116 31L111 29L116 27L118 22Z" fill="#FEF08A" />
    <defs>
      <radialGradient id="trophyGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(70 66) rotate(90) scale(56)">
        <stop stopColor="#FDE047" />
        <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="cupGold" x1="38" y1="28" x2="102" y2="89" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FEF08A" />
        <stop offset="0.5" stopColor="#FACC15" />
        <stop offset="1" stopColor="#D97706" />
      </linearGradient>
    </defs>
  </svg>
);
