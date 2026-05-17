// Catch-all dispatcher for the four root-level SEO landing patterns:
//   /jobs-in-<city[s]>              → _handlers/city-jobs.tsx
//   /<skill>-jobs                   → _handlers/skill-jobs.tsx
//   /<skill>-jobs-in-<city[s]>      → _handlers/skill-city.tsx  (chip #13)
//   /working-at-<slug>-<id>         → _handlers/working-at.tsx
//
// Why this exists: Next 16 enforces a per-directory dynamic-segment
// uniqueness rule. Having three dynamic root segments ([skill]-jobs,
// jobs-in-[city], working-at-[companyPath]) coexisting at app/ root
// silently breaks routing at request time (404 for all three even
// though routes.d.ts lists them). Consolidating under one catch-all
// is the documented Next 16 workaround. Closes chip #5 part 2.
//
// Static routes always beat catch-alls in Next 16's precedence, so
// /jobs, /companies, /login, /career-advice etc. continue to resolve
// to their own page.tsx files. The catch-all only fires for unmatched
// root paths.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SkillJobsPage, {
  generateMetadata as skillJobsMetadata,
} from './_handlers/skill-jobs';
import CityJobsPage, {
  generateMetadata as cityJobsMetadata,
} from './_handlers/city-jobs';
import SkillCityJobsPage, {
  generateMetadata as skillCityJobsMetadata,
} from './_handlers/skill-city';
import WorkingAtPage, {
  generateMetadata as workingAtMetadata,
} from './_handlers/working-at';
import { dispatch } from '../../lib/url/catch-all-dispatch';

interface RawSearchParams {
  [k: string]: string | string[] | undefined;
}

interface PageProps {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<RawSearchParams>;
}

interface MetadataProps {
  params: Promise<{ path?: string[] }>;
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { path } = await props.params;
  const m = dispatch(path);
  if (!m) return { title: 'Not found — JobPortal' };
  if (m.kind === 'skill') {
    return skillJobsMetadata({
      params: Promise.resolve({ skill: m.segment }),
      searchParams: Promise.resolve({}),
    });
  }
  if (m.kind === 'city') {
    return cityJobsMetadata({
      params: Promise.resolve({ city: m.segment }),
      searchParams: Promise.resolve({}),
    });
  }
  if (m.kind === 'skillCity') {
    return skillCityJobsMetadata({
      params: Promise.resolve({ skill: m.skill, city: m.city }),
      searchParams: Promise.resolve({}),
    });
  }
  return workingAtMetadata({
    params: Promise.resolve({ companyPath: m.segment }),
  });
}

export default async function CatchAllPage(props: PageProps) {
  const { path } = await props.params;
  const m = dispatch(path);
  if (!m) notFound();

  if (m.kind === 'skill') {
    return SkillJobsPage({
      params: Promise.resolve({ skill: m.segment }),
      searchParams: props.searchParams,
    });
  }
  if (m.kind === 'city') {
    return CityJobsPage({
      params: Promise.resolve({ city: m.segment }),
      searchParams: props.searchParams,
    });
  }
  if (m.kind === 'skillCity') {
    return SkillCityJobsPage({
      params: Promise.resolve({ skill: m.skill, city: m.city }),
      searchParams: props.searchParams,
    });
  }
  return WorkingAtPage({
    params: Promise.resolve({ companyPath: m.segment }),
  });
}
