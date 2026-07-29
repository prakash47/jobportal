import { Briefcase, Building2, MapPin, Sparkles } from '@jobportal/ui/icons';
import type { NavMenuData } from '../../lib/nav/menu-data';
import { FacetTabs, type FacetTab } from './FacetTabs';
import { FacetList, FooterCount, FooterCta, QuietLink, type FacetItem } from './panel-parts';
import {
  cityHref,
  highestPayingHref,
  jobIndustryHref,
  newestHref,
  roleHref,
  skillHref,
} from '../../lib/nav/nav-hrefs';

// Jobs mega-panel — "The Console": a facet rail + a detail pane of proportion
// rows, over a footer carrying the live count, two honest quick-views and the
// single filled CTA. Server-rendered; only FacetTabs is client.
//
// A facet is dropped entirely when it has fewer than two items, so the rail
// always reads as intentional at the current dataset rather than showing a
// lonely single row.

const ICON = 'size-4 shrink-0';

export function JobsMegaPanel({ data }: { data: NavMenuData }) {
  const tabs: FacetTab[] = [];

  const push = (
    id: string,
    label: string,
    title: string,
    subtitle: string,
    icon: FacetTab['icon'],
    items: FacetItem[],
    noun: string,
  ) => {
    if (items.length < 2) return;
    tabs.push({ id, label, title, subtitle, icon, panel: <FacetList items={items} noun={noun} /> });
  };

  push(
    'roles',
    'Roles',
    'Roles',
    'Most-hired roles right now',
    <Briefcase className={ICON} aria-hidden="true" />,
    data.roles.map((r) => ({ key: r.label, label: r.label, href: roleHref(r.query), count: r.jobCount })),
    'job',
  );
  push(
    'locations',
    'Locations',
    'Locations',
    'Where the openings are',
    <MapPin className={ICON} aria-hidden="true" />,
    data.cities.map((c) => ({ key: c.slug, label: c.name, href: cityHref(c.slug), count: c.jobCount })),
    'job',
  );
  push(
    'industries',
    'Industries',
    'Industries',
    'Hiring across sectors',
    <Building2 className={ICON} aria-hidden="true" />,
    data.industries.map((i) => ({ key: i.slug, label: i.name, href: jobIndustryHref(i.slug), count: i.jobCount })),
    'opening',
  );
  push(
    'skills',
    'Skills',
    'Skills',
    'In-demand right now',
    <Sparkles className={ICON} aria-hidden="true" />,
    data.skills.map((s) => ({ key: s.slug, label: s.name, href: skillHref(s.slug), count: s.jobCount })),
    'job',
  );

  const footer = (
    <>
      <FooterCount value={data.counts.activeJobs} label="open roles now" />
      <span className="flex-1" />
      <QuietLink href={newestHref()}>Newest this week</QuietLink>
      <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">
        ·
      </span>
      <QuietLink href={highestPayingHref()}>Highest paying</QuietLink>
      <FooterCta href="/jobs" label="Browse all jobs" />
    </>
  );

  // No facet cleared the >=2 bar (an empty or barely-seeded database). Collapse
  // to a reduced strip rather than rendering an empty rail: just the live count
  // and the CTA. The quick-views are dropped on purpose — with too little data
  // to fill a single facet, "newest"/"highest paying" have nothing behind them.
  if (tabs.length === 0) {
    return (
      <div className="flex w-[22rem] items-center gap-3 px-5 py-3">
        <FooterCount value={data.counts.activeJobs} label="open roles now" />
        <span className="flex-1" />
        <FooterCta href="/jobs" label="Browse all jobs" />
      </div>
    );
  }

  return <FacetTabs eyebrow="Browse jobs" widthClass="w-[52rem]" tabs={tabs} footer={footer} />;
}
