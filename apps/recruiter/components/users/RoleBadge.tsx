import { Badge, type BadgeVariant } from '@jobportal/ui';
import type { RecruiterRole } from '@jobportal/db';
import { ROLE_LABELS } from '../../lib/users/permissions';

// Owner is the emphasised role; admin/member are calm neutrals (CLAUDE.md §2 —
// restrained palette, colour carries meaning only where it matters).
const ROLE_VARIANT: Record<RecruiterRole, BadgeVariant> = {
  OWNER: 'primary',
  ADMIN: 'neutral',
  MEMBER: 'neutral',
};

export function RoleBadge({ role }: { role: RecruiterRole }) {
  return <Badge variant={ROLE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>;
}
