'use client';

import { Badge, Button, Switch } from '@jobportal/ui';
import type { AdminFeatureFlag } from '../../lib/admin/types';

const TYPE_LABEL: Record<AdminFeatureFlag['type'], string> = {
  BOOLEAN: 'Boolean',
  TIER_GATED: 'Tier-gated',
  PERCENTAGE_ROLLOUT: '% rollout',
  USER_TARGETED: 'User-targeted',
  COHORT_TARGETED: 'Cohort',
};

// One row in the flags table. BOOLEAN flags expose a Switch that toggles
// inline (route through the parent's onToggle so the critical-flag
// confirmation modal can intercept). All other types route through Edit
// which opens the side panel — toggling on/off is meaningful for them
// too, but in combination with their config (tiers, %, users, cohorts),
// so the panel is the only sane editor.
export function FlagToggleRow({
  flag,
  pending,
  onToggle,
  onEdit,
}: {
  flag: AdminFeatureFlag;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const isBoolean = flag.type === 'BOOLEAN';
  return (
    <tr className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-muted)]">
      <td className="px-4 py-2 align-middle">
        <div className="font-medium text-[var(--color-fg)]">{flag.uiLabel ?? flag.key}</div>
        {flag.description && (
          <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">{flag.description}</div>
        )}
      </td>
      <td className="px-4 py-2 align-middle">
        <code className="font-mono text-xs text-[var(--color-fg-muted)]">{flag.key}</code>
      </td>
      <td className="px-4 py-2 align-middle text-xs text-[var(--color-fg-muted)]">
        {TYPE_LABEL[flag.type]}
      </td>
      <td className="px-4 py-2 align-middle">
        <Badge variant={flag.enabled ? 'success' : 'neutral'}>
          {flag.enabled ? 'On' : 'Off'}
        </Badge>
      </td>
      <td className="px-4 py-2 align-middle text-right">
        {isBoolean ? (
          <Switch
            checked={flag.enabled}
            onCheckedChange={onToggle}
            disabled={pending}
            aria-label={`Toggle ${flag.uiLabel ?? flag.key}`}
          />
        ) : (
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={pending}>
            Edit
          </Button>
        )}
      </td>
    </tr>
  );
}
