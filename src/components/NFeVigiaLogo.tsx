export function NFeVigiaLogo({ height = 48 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7EB8F0"/>
          <stop offset="40%" stopColor="#2A5FA8"/>
          <stop offset="100%" stopColor="#0D1F4A"/>
        </linearGradient>
        <linearGradient id="shieldBorder" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A8CFEE"/>
          <stop offset="100%" stopColor="#3A6BAA"/>
        </linearGradient>
        <linearGradient id="irisGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5FB8F5"/>
          <stop offset="100%" stopColor="#1A5FA8"/>
        </linearGradient>
        <linearGradient id="swooshGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="100%" stopColor="#8AAED0"/>
        </linearGradient>
        <linearGradient id="nfeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="100%" stopColor="#C8DCF0"/>
        </linearGradient>
        <linearGradient id="vigiaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#72C4F5"/>
          <stop offset="100%" stopColor="#1E72C4"/>
        </linearGradient>
      </defs>
      <path d="M100,18 L160,18 L175,30 L175,105 Q175,148 130,165 Q85,148 85,105 Z" fill="url(#shieldGrad)" stroke="url(#shieldBorder)" strokeWidth="2.5"/>
      <path d="M100,22 L158,22 L171,32 L171,80 Q140,68 130,68 Q120,68 89,80 L89,32 Z" fill="#1A3B72" opacity="0.5"/>
      <line x1="130" y1="22" x2="130" y2="155" stroke="#1A3B7A" strokeWidth="1" opacity="0.4"/>
      <ellipse cx="130" cy="100" rx="34" ry="22" fill="#E8F4FF" opacity="0.95"/>
      <ellipse cx="130" cy="100" rx="18" ry="18" fill="url(#irisGrad)"/>
      <ellipse cx="130" cy="100" rx="18" ry="18" fill="none" stroke="#1A5FA8" strokeWidth="1.5"/>
      <ellipse cx="130" cy="100" rx="8" ry="8" fill="#0A1E40"/>
      <ellipse cx="124" cy="95" rx="4" ry="3" fill="white" opacity="0.85"/>
      <path d="M96,100 Q113,82 130,80 Q147,82 164,100" fill="none" stroke="#8AAED0" strokeWidth="1.5" opacity="0.7"/>
      <path d="M96,100 Q113,118 130,120 Q147,118 164,100" fill="none" stroke="#8AAED0" strokeWidth="1.5" opacity="0.7"/>
      <path d="M72,115 Q95,88 130,88 Q158,88 175,70" fill="none" stroke="url(#swooshGrad)" strokeWidth="5" strokeLinecap="round" opacity="0.92"/>
      <path d="M175,70 L180,58 L168,68 Z" fill="#C8DCF0" opacity="0.85"/>
      <text x="198" y="128" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="72" fill="url(#nfeGrad)">NFe</text>
      <text x="388" y="128" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="72" fill="url(#vigiaGrad)">Vigia</text>
    </svg>
  );
}
