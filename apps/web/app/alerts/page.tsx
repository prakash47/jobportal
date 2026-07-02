import Link from 'next/link';
import { prisma } from '@jobportal/db';
import { Button } from '@jobportal/ui';
import { Plus } from '@jobportal/ui/icons';
import { requireUser } from '../../lib/auth/require-user';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { AlertRow, AlertsEmpty } from '../../components/alerts';

const MAX_ALERTS = 10;

export default async function AlertsPage() {
  const session = await requireUser();
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
      <PageHeader
        title="Job alerts"
        description={`Save searches and we'll email you when matches go live. ${rows.length}/${MAX_ALERTS} used.`}
        action={
          atCap ? (
            // At the cap the action is genuinely unavailable — render a real
            // disabled button (an aria-disabled link would still navigate).
            <Button disabled leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
              New alert
            </Button>
          ) : (
            <Button asChild>
              <Link href="/alerts/new">
                <Plus className="size-4" aria-hidden="true" />
                New alert
              </Link>
            </Button>
          )
        }
      />

      {rows.length === 0 ? (
        <AlertsEmpty />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)]">
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
        </ContentCard>
      )}
    </div>
  );
}
