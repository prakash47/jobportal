import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../lib/auth/server-session';
import { AlertRow, AlertsEmpty } from '../../components/alerts';

const MAX_ALERTS = 10;

export default async function AlertsPage() {
  const session = (await readUserFromCookie())!;
  const rows = await prisma.jobAlert.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      frequency: true,
      isActive: true,
      lastSentAt: true,
    },
  });

  const atCap = rows.length >= MAX_ALERTS;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Job alerts
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Save searches and we&rsquo;ll email you when matches go live.
            {' '}
            <span className="text-[var(--color-fg-subtle)]">{rows.length}/{MAX_ALERTS}</span>
          </p>
        </div>
        <Button asChild disabled={atCap} variant={atCap ? 'secondary' : 'primary'}>
          <Link href={atCap ? '#' : '/alerts/new'} aria-disabled={atCap || undefined}>
            New alert
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <AlertsEmpty />
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4">
          {rows.map((r) => (
            <AlertRow
              key={r.id}
              id={r.id}
              name={r.name}
              frequency={r.frequency}
              isActive={r.isActive}
              lastSentAt={r.lastSentAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
