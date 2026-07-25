import { type ReactNode } from 'react';
import { Badge, cn, type BadgeVariant } from '@jobportal/ui';
import { NEUTRAL_ON_ANY_SURFACE } from '../badge-surface';

// Display status for the company's recruiter subscription. Derived at read
// time (an ACTIVE row whose period has lapsed renders as EXPIRED — no cron
// flips statuses); FREE means "no subscription at all". Local union so this
// presentational component pulls no Prisma types into a client bundle (same
// rationale as KycStatusBadge).
export type SubscriptionBadgeStatus =
  | 'FREE'
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'EXPIRED'
  | 'CANCELLED';

// Colour AND icon AND text together — never colour alone (WCAG 1.4.1).
const CONFIG: Record<
  SubscriptionBadgeStatus,
  { variant: BadgeVariant; label: string; icon: ReactNode }
> = {
  FREE: { variant: 'neutral', label: 'Free plan', icon: <CircleIcon /> },
  ACTIVE: { variant: 'success', label: 'Active', icon: <CheckIcon /> },
  TRIALING: { variant: 'primary', label: 'Trial', icon: <ClockIcon /> },
  PAST_DUE: { variant: 'warning', label: 'Payment due', icon: <AlertIcon /> },
  EXPIRED: { variant: 'warning', label: 'Expired', icon: <ClockIcon /> },
  CANCELLED: { variant: 'neutral', label: 'Cancelled', icon: <CircleIcon /> },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionBadgeStatus }) {
  const { variant, label, icon } = CONFIG[status];
  return (
    <Badge
      variant={variant}
      className={cn('gap-1', variant === 'neutral' && NEUTRAL_ON_ANY_SURFACE)}
      aria-label={`Subscription status: ${label}`}
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
