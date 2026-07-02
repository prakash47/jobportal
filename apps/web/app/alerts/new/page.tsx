import { prisma } from '@jobportal/db';
import { requireUser } from '../../../lib/auth/require-user';
import { PageHeader } from '../../../components/dashboard/PageHeader';
import { ContentCard } from '../../../components/dashboard/ContentCard';
import { AlertForm } from '../../../components/alerts';

export default async function NewAlertPage() {
  await requireUser();
  const [skills, cities] = await Promise.all([
    prisma.skill.findMany({
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.city.findMany({
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="New alert"
        description="Pick keywords, skills, and cities. We'll email you when matches go live."
        backHref="/alerts"
        backLabel="Job alerts"
      />
      <ContentCard className="p-5 sm:p-6">
        <AlertForm
          initial={{
            id: null,
            name: '',
            query: {},
            frequency: 'daily',
            isActive: true,
          }}
          skillCatalogue={skills}
          cityCatalogue={cities}
        />
      </ContentCard>
    </div>
  );
}
