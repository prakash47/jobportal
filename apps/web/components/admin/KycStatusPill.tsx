import { Badge, type BadgeVariant } from '@jobportal/ui';

export type AdminKycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

const MAP: Record<AdminKycStatus, { variant: BadgeVariant; label: string }> = {
  NOT_SUBMITTED: { variant: 'neutral', label: 'Not submitted' },
  PENDING: { variant: 'warning', label: 'Pending' },
  VERIFIED: { variant: 'success', label: 'Verified' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
};

export function KycStatusPill({ status }: { status: AdminKycStatus }) {
  const c = MAP[status] ?? MAP.NOT_SUBMITTED;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
