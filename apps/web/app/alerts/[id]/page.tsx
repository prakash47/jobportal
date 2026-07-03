import { notFound } from 'next/navigation';
import { prisma, type Prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
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
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Edit alert"
        description={alert.name}
        backHref="/alerts"
        backLabel="Job alerts"
        // Layer 3 of the killswitch enforcement: hide the test button when the
        // killswitch is ON. The API independently rejects the call (Layer 2).
        {...(!killswitchOn ? { action: <SendTestButton id={alert.id} /> } : {})}
      />
      <ContentCard className="p-5 sm:p-6">
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
      </ContentCard>
    </div>
  );
}
