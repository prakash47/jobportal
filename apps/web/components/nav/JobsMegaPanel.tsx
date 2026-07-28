import type { ReactNode } from 'react';
import Link from 'next/link';
import { Briefcase, MapPin, Building2, Sparkles } from '@jobportal/ui/icons';
import type { NavMenuData } from '../../lib/nav/menu-data';
import { NavTile } from './NavTile';
import { BrowseAll, MenuStrip, navPillClass } from './menu-chrome';
import {
  cityHref,
  highestPayingHref,
  jobIndustryHref,
  newestHref,
  roleHref,
  skillHref,
} from '../../lib/nav/nav-hrefs';

// The Jobs mega-panel: a slim strip (live count + honest quick-views) over a
// flex-wrap grid of facet columns of browse tiles. Groups with fewer than two
// items are dropped so the panel always looks intentional, even at the small
// launch dataset. Desktop-only; server-rendered into the initial HTML.

const fmt = (n: number): string => n.toLocaleString('en-IN');

function Facet({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="w-44">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
        {heading}
      </h3>
      <div className="flex flex-col gap-[7px]">{children}</div>
    </div>
  );
}

export function JobsMegaPanel({ data }: { data: NavMenuData }) {
  const facets: ReactNode[] = [];
  if (data.roles.length >= 2) {
    facets.push(
      <Facet key="role" heading="By role">
        {data.roles.map((r) => (
          <NavTile key={r.label} href={roleHref(r.query)} icon={Briefcase} label={r.label} count={r.jobCount} />
        ))}
      </Facet>,
    );
  }
  if (data.cities.length >= 2) {
    facets.push(
      <Facet key="city" heading="By location">
        {data.cities.map((c) => (
          <NavTile key={c.slug} href={cityHref(c.slug)} icon={MapPin} label={c.name} count={c.jobCount} />
        ))}
      </Facet>,
    );
  }
  if (data.industries.length >= 2) {
    facets.push(
      <Facet key="ind" heading="By industry">
        {data.industries.map((i) => (
          <NavTile key={i.slug} href={jobIndustryHref(i.slug)} icon={Building2} label={i.name} count={i.jobCount} noun="opening" />
        ))}
      </Facet>,
    );
  }
  if (data.skills.length >= 2) {
    facets.push(
      <Facet key="skill" heading="In-demand skills">
        {data.skills.map((s) => (
          <NavTile key={s.slug} href={skillHref(s.slug)} icon={Sparkles} label={s.name} count={s.jobCount} />
        ))}
      </Facet>,
    );
  }

  return (
    <div className="flex w-[51rem] max-w-[calc(100vw-1.5rem)] flex-col">
      <MenuStrip
        lead={
          <>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
              Browse jobs
            </span>
            <span className="text-[12.5px] text-[var(--color-fg-muted)]">
              <span className="font-semibold tabular-nums text-[var(--color-primary-600)]">
                {fmt(data.counts.activeJobs)}
              </span>{' '}
              open roles now
            </span>
          </>
        }
      >
        <Link href={newestHref()} className={navPillClass}>
          Newest this week
        </Link>
        <Link href={highestPayingHref()} className={navPillClass}>
          Highest paying
        </Link>
        <BrowseAll href="/jobs" label="All jobs" />
      </MenuStrip>

      <div className="flex flex-wrap gap-x-5 gap-y-4 px-5 pb-5 pt-4">{facets}</div>
    </div>
  );
}
