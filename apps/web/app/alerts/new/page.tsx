import { prisma } from '@jobportal/db';
import { AlertForm } from '../../../components/alerts';

export default async function NewAlertPage() {
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          New alert
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Pick keywords, skills, and cities. We&rsquo;ll email you when matches go live.
        </p>
      </header>
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
    </div>
  );
}
