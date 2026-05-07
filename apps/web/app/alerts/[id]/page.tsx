import { notFound } from 'next/navigation';
import { prisma, type Prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireUser } from '../../../lib/auth/require-user';
import { AlertForm, SendTestButton, type Frequency } from '../../../components/alerts';

interface PageProps {
  params: Promise<{ id: string }>;
}

const VALID_FREQ = new Set<Frequency>(['instant', 'daily', 'weekly']);

export default async function EditAlertPage({ params }: PageProps) {
  const { id } = await params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId)) notFound();

  const session = await requireUser();
  const alert = await prisma.jobAlert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== session.sub) notFound();

  const [skills, cities, killswitchOn] = await Promise.all([
    prisma.skill.findMany({
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.city.findMany({
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
    isFlagEnabled('killswitch.job_alerts'),
  ]);

  const frequency: Frequency = VALID_FREQ.has(alert.frequency as Frequency)
    ? (alert.frequency as Frequency)
    : 'daily';

  const query = (alert.query ?? {}) as Prisma.JsonObject;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Edit alert
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{alert.name}</p>
        </div>
        {/* Layer 3 of the killswitch enforcement: hide the test button when the
            killswitch is ON. The API independently rejects the call (Layer 2). */}
        {!killswitchOn && <SendTestButton id={alert.id} />}
      </header>
      <AlertForm
        initial={{
          id: alert.id,
          name: alert.name,
          query: query as never,
          frequency,
          isActive: alert.isActive,
        }}
        skillCatalogue={skills}
        cityCatalogue={cities}
      />
    </div>
  );
}
