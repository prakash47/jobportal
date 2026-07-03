import { Badge, type BadgeVariant } from '@jobportal/ui';

export type AdminTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

const MAP: Record<AdminTicketStatus, { variant: BadgeVariant; label: string }> = {
  OPEN: { variant: 'primary', label: 'Open' },
  IN_PROGRESS: { variant: 'warning', label: 'In progress' },
  RESOLVED: { variant: 'success', label: 'Resolved' },
  CLOSED: { variant: 'neutral', label: 'Closed' },
};

export function SupportTicketStatusPill({ status }: { status: AdminTicketStatus }) {
  const c = MAP[status] ?? MAP.OPEN;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
