import { Search, Briefcase, Bell } from '@jobportal/ui/icons';
import { SectionHeading } from './SectionHeading';
import { Reveal } from './Reveal';

// NEW 3-step section — makes the product legible before the browse grids.
// Text + icon only (no images) to protect the LCP/CLS budget. Sits on the
// neutral surface as the first beat of the strict neutral↔elevated rhythm.
// On desktop the steps are centered so a single hairline can thread cleanly
// between the chip centers (pure border, no shadow); each chip masks the line
// with a bg-colored ring. Step ordinals are navy (cyan is too light for
// information-bearing text on white — accessibility + mandate).

const STEPS: ReadonlyArray<{
  idx: string;
  icon: typeof Search;
  title: string;
  body: string;
}> = [
  {
    idx: '01',
    icon: Search,
    title: 'Search calmly',
    body: 'Filter by role, city, and experience. No ads or sponsored noise in your results.',
  },
  {
    idx: '02',
    icon: Briefcase,
    title: 'Apply in seconds',
    body: 'One profile, one click. Track every application from a single dashboard.',
  },
  {
    idx: '03',
    icon: Bell,
    title: 'Get alerted',
    body: 'Save a search and we email new matching roles at the cadence you choose.',
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="How it works"
        title="Three steps to your next role"
        description="From search to offer — without the clutter."
      />
      <Reveal>
        <ol className="relative grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
          {/* Sequence rail between the (centered) chip centers — desktop only. */}
          <div
            aria-hidden="true"
            className="absolute left-[16.6667%] right-[16.6667%] top-6 hidden h-px bg-[var(--color-border)] sm:block"
          />
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.idx} className="relative sm:text-center">
                <span className="relative z-10 flex size-12 items-center justify-center rounded-xl bg-[var(--color-primary-100)] text-[var(--color-primary-700)] ring-8 ring-[var(--color-bg)] sm:mx-auto">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="mt-5 flex items-center gap-2 sm:justify-center">
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-primary-700)]">
                    {s.idx}
                  </span>
                  <h3 className="text-base font-semibold text-[var(--color-fg)]">{s.title}</h3>
                </div>
                <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-[var(--color-fg-muted)] sm:mx-auto">
                  {s.body}
                </p>
              </li>
            );
          })}
        </ol>
      </Reveal>
    </section>
  );
}
