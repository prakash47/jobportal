import Image from 'next/image';
import { cn } from '@jobportal/ui';

// Initials-on-solid-color fallback when no logo has been uploaded. Mirror of
// apps/web/components/companies/CompanyLogo.tsx so the recruiter portal and the
// public site render company identity identically (flat fill, no gradient —
// CLAUDE.md §2). Duplicated per-app deliberately (each Next app serves its own
// assets); consolidating into @jobportal/ui is a known follow-up.

const PALETTE = [
  'bg-[oklch(0.88_0.04_60)]', // warm sand
  'bg-[oklch(0.86_0.05_180)]', // soft teal
  'bg-[oklch(0.86_0.05_290)]', // muted lavender
  'bg-[oklch(0.88_0.05_25)]', // dusty rose
  'bg-[oklch(0.86_0.05_120)]', // sage
] as const;

function pickColor(seed: number): string {
  return PALETTE[seed % PALETTE.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return (parts[0]?.[0] ?? '·').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export interface CompanyLogoProps {
  companyId: number;
  name: string;
  logoUrl: string | null;
  /** px size; the logo renders square */
  size?: number;
  className?: string;
}

export function CompanyLogo({ companyId, name, logoUrl, size = 48, className }: CompanyLogoProps) {
  const radius = size >= 80 ? 'rounded-lg' : 'rounded-md';
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={cn(
          'shrink-0 border border-[var(--color-border)] object-contain',
          radius,
          className,
        )}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center font-semibold text-[var(--color-fg)]',
        size >= 80 ? 'text-2xl' : 'text-base',
        radius,
        pickColor(companyId),
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
