import { prisma } from '@jobportal/db';
import { requireUser } from '../../lib/auth/require-user';
import { PageHeader } from '../../components/dashboard/PageHeader';
import { ContentCard } from '../../components/dashboard/ContentCard';
import { AlertRow, AlertsEmpty, QuickAlertDialog } from '../../components/alerts';

const MAX_ALERTS = 10;

export default async function AlertsPage() {
  const session = await requireUser();
  const [rows, cities] = await Promise.all([
    prisma.jobAlert.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        frequency: true,
        isActive: true,
        lastSentAt: true,
      },
    }),
    // Needed up front because the quick-create dialog lives on this page now.
    // ~700 rows of {slug, name, state} — small enough to ship with the SSR
    // payload, and it removes the round-trip that would otherwise land while
    // the user is already typing into the location field.
    prisma.city.findMany({
      select: { slug: true, name: true, state: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const atCap = rows.length >= MAX_ALERTS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job alerts"
        description={`Save searches and we'll email you when matches go live. ${rows.length}/${MAX_ALERTS} used.`}
        action={
          <QuickAlertDialog
            cityCatalogue={cities}
            disabled={atCap}
            disabledReason={`You've used all ${MAX_ALERTS} alerts. Delete one to add another.`}
          />
        }
      />

      {rows.length === 0 ? (
        <AlertsEmpty />
      ) : (
        <ContentCard className="divide-y divide-[var(--color-border)] overflow-hidden">
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
