import { Badge, type BadgeVariant } from '@jobportal/ui';
import type { SupportTicketStatus } from '@jobportal/db';

// Ticket lifecycle status shown as a coloured, labelled Badge (colour + text
// together — never colour alone, WCAG 1.4.1). Server-compatible (no client
// hooks) so it renders inside the RSC list + detail pages.
const CONFIG: Record<SupportTicketStatus, { variant: BadgeVariant; label: string }> = {
  OPEN: { variant: 'primary', label: 'Open' },
  IN_PROGRESS: { variant: 'warning', label: 'In progress' },
  RESOLVED: { variant: 'success', label: 'Resolved' },
  CLOSED: { variant: 'neutral', label: 'Closed' },
};

export function TicketStatusBadge({ status }: { status: SupportTicketStatus }) {
  const { variant, label } = CONFIG[status];
  return (
    <Badge variant={variant} aria-label={`Ticket status: ${label}`}>
      {label}
    </Badge>
  );
}
