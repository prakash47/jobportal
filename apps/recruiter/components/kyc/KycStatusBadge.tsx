import { type ReactNode } from 'react';
import { Badge, cn, type BadgeVariant } from '@jobportal/ui';
import { NEUTRAL_ON_ANY_SURFACE } from '../badge-surface';

// The four verification states the recruiter sees. Mirrors the Prisma KycStatus
// enum (kept as a local union so this presentational component pulls no Prisma
// types into a client bundle).
export type KycBadgeStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

// Status is communicated by colour AND an icon AND a text label together — never
// colour alone (WCAG 1.4.1). REJECTED reads as "Action needed" so it feels
// recoverable rather than punitive.
const CONFIG: Record<KycBadgeStatus, { variant: BadgeVariant; label: string; icon: ReactNode }> = {
  NOT_SUBMITTED: { variant: 'neutral', label: 'Not started', icon: <CircleIcon /> },
  PENDING: { variant: 'warning', label: 'Pending review', icon: <ClockIcon /> },
  VERIFIED: { variant: 'success', label: 'Verified', icon: <CheckIcon /> },
  REJECTED: { variant: 'danger', label: 'Action needed', icon: <AlertIcon /> },
};

export function KycStatusBadge({ status }: { status: KycBadgeStatus }) {
  const { variant, label, icon } = CONFIG[status];
  return (
    <Badge
      variant={variant}
      className={cn('gap-1', variant === 'neutral' && NEUTRAL_ON_ANY_SURFACE)}
      aria-label={`Verification status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </Badge>
  );
}

const ICON_PROPS = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function CheckIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
