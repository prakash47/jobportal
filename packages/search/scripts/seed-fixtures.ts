import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(__dirname, '../../../.env') });

import { faker } from '@faker-js/faker';
import { prisma } from '@jobportal/db';

// Hard guard: synthetic-fixture seeding is for local benchmarks only.
if (process.env.NODE_ENV === 'production') {
  console.error('[seed-fixtures] refusing to run with NODE_ENV=production');
  process.exit(1);
}

const TARGET_COMPANIES = 100;
const TARGET_JOBS = 10_000;

const TITLE_TEMPLATES = [
  '{seniority} {role}',
  '{role} ({seniority})',
  '{role} – {tech}',
  '{seniority} {role} ({tech})',
];
const SENIORITY = ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Lead'];
const ROLES = [
  'Software Engineer',
  'Frontend Engineer',
  'Backend Engineer',
  'Full-Stack Engineer',
  'Mobile Engineer',
  'DevOps Engineer',
  'Site Reliability Engineer',
  'Data Engineer',
  'Data Scientist',
  'Machine Learning Engineer',
  'QA Engineer',
  'Product Manager',
  'Designer',
  'Product Designer',
  'Engineering Manager',
];
const TECH = ['React', 'Node.js', 'Python', 'Go', 'Java', 'Kubernetes', 'AWS', 'TypeScript', 'Postgres', 'Kafka'];

function randomTitle(): string {
  const tmpl = TITLE_TEMPLATES[Math.floor(Math.random() * TITLE_TEMPLATES.length)]!;
  const seniority = SENIORITY[Math.floor(Math.random() * SENIORITY.length)]!;
  const role = ROLES[Math.floor(Math.random() * ROLES.length)]!;
  const tech = TECH[Math.floor(Math.random() * TECH.length)]!;
  return tmpl.replace('{seniority}', seniority).replace('{role}', role).replace('{tech}', tech);
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

async function main(): Promise<void> {
  faker.seed(20260507);

  const [industries, cities, skills] = await Promise.all([
    prisma.industry.findMany({ select: { id: true } }),
    prisma.city.findMany({ select: { id: true } }),
    prisma.skill.findMany({ select: { id: true } }),
  ]);
  if (industries.length === 0 || cities.length === 0 || skills.length === 0) {
    console.error('[seed-fixtures] reference data missing — run pnpm db:seed first');
    process.exit(1);
  }

  const existingCompanies = await prisma.company.count({ where: { slug: { startsWith: 'fx-' } } });
  if (existingCompanies < TARGET_COMPANIES) {
    const toCreate = TARGET_COMPANIES - existingCompanies;
    console.log(`[seed-fixtures] creating ${toCreate} synthetic companies...`);
    const companyData = Array.from({ length: toCreate }, (_, i) => ({
      slug: `fx-${faker.string.alphanumeric(8).toLowerCase()}-${existingCompanies + i + 1}`,
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
      industryId: industries[Math.floor(Math.random() * industries.length)]!.id,
      headquartersCityId: cities[Math.floor(Math.random() * cities.length)]!.id,
      employeeCount: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'][
        Math.floor(Math.random() * 6)
      ]!,
      foundedYear: 1970 + Math.floor(Math.random() * 56),
    }));
    await prisma.company.createMany({ data: companyData, skipDuplicates: true });
  }
  const allCompanies = await prisma.company.findMany({
    where: { slug: { startsWith: 'fx-' } },
    select: { id: true },
  });

  const existingJobs = await prisma.job.count({ where: { canonicalSlug: { startsWith: 'fx-' } } });
  if (existingJobs >= TARGET_JOBS) {
    console.log(`[seed-fixtures] already have ${existingJobs} synthetic jobs — done.`);
    await prisma.$disconnect();
    return;
  }

  const toCreateJobs = TARGET_JOBS - existingJobs;
  console.log(`[seed-fixtures] creating ${toCreateJobs} synthetic jobs (in batches)...`);

  const BATCH = 500;
  for (let i = 0; i < toCreateJobs; i += BATCH) {
    const size = Math.min(BATCH, toCreateJobs - i);
    const data = Array.from({ length: size }, (_, j) => {
      const title = randomTitle();
      const company = allCompanies[Math.floor(Math.random() * allCompanies.length)]!;
      const primaryCity = cities[Math.floor(Math.random() * cities.length)]!;
      const otherCities = pickN(
        cities.filter((c) => c.id !== primaryCity.id),
        Math.floor(Math.random() * 3),
      );
      const jobSkills = pickN(skills, 3 + Math.floor(Math.random() * 4));
      const minYears = Math.floor(Math.random() * 8);
      const maxYears = minYears + Math.floor(Math.random() * 5) + 1;
      const minPaise = (3 + Math.floor(Math.random() * 30)) * 100_000 * 100;
      const maxPaise = minPaise + Math.floor(Math.random() * 5_000_000);
      return {
        canonicalSlug: `fx-${faker.string.alphanumeric(10).toLowerCase()}-${i + j + 1}`,
        title,
        description: faker.lorem.paragraphs(3),
        shortDescription: faker.lorem.sentence(),
        companyId: company.id,
        primaryCityId: primaryCity.id,
        cityIds: [primaryCity.id, ...otherCities.map((c) => c.id)],
        skillIds: jobSkills.map((s) => s.id),
        industryId: industries[Math.floor(Math.random() * industries.length)]!.id,
        status: 'ACTIVE' as const,
        experienceMinYears: minYears,
        experienceMaxYears: maxYears,
        salaryMinPaise: minPaise,
        salaryMaxPaise: maxPaise,
        postedAt: faker.date.recent({ days: 30 }),
      };
    });
    await prisma.job.createMany({ data, skipDuplicates: true });
    console.log(`[seed-fixtures]  ... ${Math.min(i + size, toCreateJobs)} / ${toCreateJobs}`);
  }

  console.log('[seed-fixtures] done. Run `pnpm search:reindex` next.');
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error('[seed-fixtures] failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
