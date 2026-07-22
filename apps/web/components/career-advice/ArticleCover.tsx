import Image from 'next/image';
import type { ReactNode } from 'react';

// Every article gets a cover image. When a real coverImageUrl exists it renders
// the photo; otherwise a DESIGNED, on-brand editorial cover — composed flat
// navy/cyan art keyed to the article's first tag (never a fabricated photo,
// never a gradient). All fills are theme tokens, so the art stays on-brand in
// both themes. SVG scales to the 16:9 cover slot the card provides.

const VB = '0 0 400 225';

function Frame({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <svg viewBox={VB} className="size-full" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
      <rect width="400" height="225" fill={bg} />
      {children}
    </svg>
  );
}

const NAVY = 'var(--color-primary-600)';
const NAVY_D = 'var(--color-primary-800)';
const NAVY_S = 'var(--color-primary-200)';
const NAVY_SS = 'var(--color-primary-100)';
const CYAN = 'var(--color-accent-500)';
const CYAN_D = 'var(--color-accent-600)';
const WHITE = 'var(--color-bg-elevated)';
const TINT_CY = 'var(--color-accent-50)';
const TINT_NV = 'var(--color-primary-50)';

const COVERS: Record<string, () => ReactNode> = {
  salary: () => (
    <Frame bg={TINT_CY}>
      <circle cx="322" cy="66" r="150" fill={NAVY_SS} />
      <rect x="44" y="132" width="34" height="52" rx="4" fill={NAVY_D} />
      <rect x="86" y="108" width="34" height="76" rx="4" fill={NAVY} />
      <rect x="128" y="80" width="34" height="104" rx="4" fill={CYAN} />
      <path d="M52 118 L104 92 L150 60" fill="none" stroke={CYAN_D} strokeWidth="3" strokeLinecap="round" />
      <circle cx="52" cy="118" r="5" fill={CYAN_D} />
      <circle cx="150" cy="60" r="5" fill={CYAN_D} />
      <circle cx="300" cy="116" r="42" fill={WHITE} stroke={NAVY} strokeWidth="2.5" />
      <text x="300" y="132" fontFamily="Georgia, serif" fontSize="48" fontWeight="700" fill={NAVY} textAnchor="middle">&#8377;</text>
    </Frame>
  ),
  portfolio: () => (
    <Frame bg={TINT_NV}>
      <rect x="198" y="42" width="150" height="104" rx="10" fill={NAVY_S} transform="rotate(-7 273 94)" />
      <rect x="150" y="64" width="150" height="104" rx="10" fill={CYAN} />
      <rect x="150" y="64" width="150" height="104" rx="10" fill="none" stroke={NAVY} strokeWidth="2" />
      <circle cx="184" cy="96" r="12" fill={WHITE} />
      <rect x="170" y="118" width="82" height="7" rx="3.5" fill={WHITE} opacity="0.9" />
      <rect x="170" y="132" width="54" height="7" rx="3.5" fill={WHITE} opacity="0.6" />
      <rect x="64" y="90" width="86" height="62" rx="8" fill={NAVY_D} />
    </Frame>
  ),
  resume: () => (
    <Frame bg={TINT_CY}>
      <circle cx="88" cy="182" r="120" fill={NAVY_SS} />
      <rect x="132" y="32" width="136" height="176" rx="10" fill={WHITE} stroke="var(--color-border)" strokeWidth="1.5" />
      <circle cx="176" cy="80" r="23" fill={TINT_NV} />
      <rect x="212" y="64" width="42" height="8" rx="4" fill={NAVY} />
      <rect x="212" y="82" width="30" height="7" rx="3.5" fill={NAVY_S} />
      <rect x="152" y="122" width="96" height="7" rx="3.5" fill={NAVY_D} />
      <rect x="152" y="138" width="96" height="7" rx="3.5" fill={NAVY_SS} />
      <rect x="152" y="154" width="72" height="7" rx="3.5" fill={NAVY_SS} />
      <circle cx="252" cy="176" r="20" fill={CYAN} />
      <path d="M244 176 l6 6 l11 -12" fill="none" stroke={WHITE} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  ),
  applying: () => (
    <Frame bg={TINT_NV}>
      <circle cx="316" cy="70" r="140" fill={NAVY_SS} />
      <path d="M44 116 C120 60, 210 150, 300 78" fill="none" stroke={CYAN_D} strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
      <circle cx="44" cy="116" r="5" fill={CYAN_D} />
      <rect x="150" y="86" width="132" height="86" rx="10" fill={WHITE} stroke={NAVY} strokeWidth="2" />
      <path d="M152 92 L216 138 L280 92" fill="none" stroke={NAVY} strokeWidth="2" />
      <path d="M216 138 L280 172 M216 138 L152 172" fill="none" stroke={NAVY_S} strokeWidth="2" />
      <circle cx="300" cy="76" r="20" fill={CYAN} />
      <path d="M292 76 h16 M301 69 l7 7 l-7 7" fill="none" stroke={WHITE} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  ),
  'early-career': () => (
    <Frame bg={TINT_CY}>
      <circle cx="86" cy="70" r="130" fill={NAVY_SS} />
      <path d="M118 84 L198 56 L278 84 L198 112 Z" fill={NAVY} />
      <path d="M162 98 L162 130 C162 146, 234 146, 234 130 L234 98" fill="none" stroke={NAVY_D} strokeWidth="7" />
      <path d="M278 84 L278 120" stroke={CYAN_D} strokeWidth="3" strokeLinecap="round" />
      <circle cx="278" cy="126" r="7" fill={CYAN} />
      <path d="M300 150 l4 12 l12 4 l-12 4 l-4 12 l-4 -12 l-12 -4 l12 -4 Z" fill={CYAN} />
    </Frame>
  ),
};

function fallbackCover(): ReactNode {
  return (
    <Frame bg={TINT_NV}>
      <circle cx="300" cy="80" r="120" fill={NAVY_SS} />
      <circle cx="150" cy="130" r="56" fill={CYAN} />
      <circle cx="230" cy="150" r="40" fill="none" stroke={NAVY} strokeWidth="2.5" />
      <path d="M40 180 L360 180" stroke={NAVY_S} strokeWidth="2" />
      <rect x="60" y="60" width="64" height="64" rx="12" fill={NAVY_D} transform="rotate(12 92 92)" />
    </Frame>
  );
}

export interface ArticleCoverProps {
  coverImageUrl: string | null;
  tag: string | undefined;
  title: string;
  /** Larger intrinsic size for the featured lead. */
  priority?: boolean;
}

export function ArticleCover({ coverImageUrl, tag, title, priority = false }: ArticleCoverProps) {
  if (coverImageUrl) {
    return (
      <Image
        src={coverImageUrl}
        alt={title}
        width={priority ? 1120 : 640}
        height={priority ? 630 : 360}
        className="size-full object-cover"
        {...(priority ? { priority: true } : {})}
      />
    );
  }
  const render = (tag && COVERS[tag]) || fallbackCover;
  return render();
}
