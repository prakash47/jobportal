import Link from 'next/link';
import { Badge } from '@jobportal/ui';
import { DeleteAlertButton } from './DeleteAlertButton';
import { PauseToggle } from './PauseToggle';

const fmt = (d: Date | null) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'never';

export interface AlertRowProps {
  id: number;
  name: string;
  frequency: string;
  isActive: boolean;
  lastSentAt: Date | null;
}

const FREQUENCY_LABEL: Record<string, string> = {
  instant: 'Instant',
  daily: 'Daily',
  weekly: 'Weekly',
};

export function AlertRow({ id, name, frequency, isActive, lastSentAt }: AlertRowProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-bg)] sm:flex-row sm:items-center sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/alerts/${id}`}
            className="truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
          >
            {name}
          </Link>
          {!isActive && <Badge variant="neutral">Paused</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
          {FREQUENCY_LABEL[frequency] ?? frequency}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          <span className="text-xs">Last sent {fmt(lastSentAt)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <PauseToggle id={id} isActive={isActive} />
        <DeleteAlertButton id={id} name={name} />
      </div>
    </div>
  );
}
