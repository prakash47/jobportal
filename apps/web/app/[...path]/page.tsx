// Catch-all dispatcher for the three root-level SEO landing patterns:
//   /jobs-in-<city[s]>      → _handlers/city-jobs.tsx
//   /<skill>-jobs           → _handlers/skill-jobs.tsx
//   /working-at-<slug>-<id> → _handlers/working-at.tsx
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
import WorkingAtPage, {
  generateMetadata as workingAtMetadata,
} from './_handlers/working-at';

type Dispatch =
  | { kind: 'city'; segment: string }
  | { kind: 'skill'; segment: string }
  | { kind: 'workingAt'; segment: string };

// Pattern-match the single-segment path against the three landings.
// Order matters: `working-at-` and `jobs-in-` are prefix-matched first;
// the `-jobs` suffix is checked last because a skill slug must not be
// empty (length > '-jobs'.length).
function dispatch(path: string[] | undefined): Dispatch | null {
  if (!path || path.length !== 1) return null;
  const segment = path[0]!;

  if (segment.startsWith('working-at-') && segment.length > 'working-at-'.length) {
    return { kind: 'workingAt', segment: segment.slice('working-at-'.length) };
  }
  if (segment.startsWith('jobs-in-') && segment.length > 'jobs-in-'.length) {
    return { kind: 'city', segment: segment.slice('jobs-in-'.length) };
  }
  if (segment.endsWith('-jobs') && segment.length > '-jobs'.length) {
    return { kind: 'skill', segment: segment.slice(0, segment.length - '-jobs'.length) };
  }
  return null;
}

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
  return WorkingAtPage({
    params: Promise.resolve({ companyPath: m.segment }),
  });
}
