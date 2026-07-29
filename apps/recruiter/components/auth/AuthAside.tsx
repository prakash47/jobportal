import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { Briefcase, ShieldCheck, TrendingUp, Users } from '@jobportal/ui/icons';
import { Logo } from '../brand/Logo';
import { HiringPipeline } from './illustrations/HiringPipeline';
import { PostJob } from './illustrations/PostJob';
import type { AsideContent, AsideIcon, AsideIllustration } from '../../lib/auth/aside-content';

// The brand panel beside the auth forms. Server component — no state, no
// client JS.
//
// Surface is the FIXED brand navy (--color-primary-600, #192249), the same
// surface as the authed sidebar rail, so signing in previews the shell you land
// in. Two consequences that are not cosmetic:
//
//   1. The logo MUST pass `onDark`. The auto path keys off [data-theme="dark"]
//      and this app mounts no ThemeProvider, so it would render the NAVY logo
//      on the navy panel (see brand/Logo.tsx).
//   2. The inherited :focus-visible ring (--color-ring = primary-500) measures
//      1.96:1 on this navy and fails WCAG 1.4.11. The one interactive element
//      here overrides it to white, exactly as the sidebar rail does.
//
// The headline is a <p>, not a heading: it is a promotional line beside the
// form, not a section of the document. That also keeps each page at exactly one
// <h1> — the form's — with no h2-before-h1 in DOM order.

type AsideIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<AsideIcon, AsideIconComponent> = {
  briefcase: Briefcase,
  users: Users,
  shield: ShieldCheck,
  trend: TrendingUp,
};

const ILLUSTRATIONS: Record<AsideIllustration, ComponentType<{ className?: string }>> = {
  pipeline: HiringPipeline,
  'post-job': PostJob,
};

export function AuthAside({ content }: { content: AsideContent }) {
  const Illustration = ILLUSTRATIONS[content.illustration];

  return (
    // Vertical rhythm is clamped against viewport HEIGHT, not fixed. A 1366x768
    // laptop has a ~650px viewport once browser chrome is subtracted, and at a
    // fixed p-10/py-8 rhythm this panel — which is decorative — was what pushed
    // the sign-in page into vertical scroll (measured: 24px over at 650px).
    // Horizontal padding stays width-driven; only the vertical axis scales.
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-primary-600)] px-10 py-[clamp(1.5rem,5vh,3rem)] lg:flex xl:px-12">
      <Link
        href="/"
        aria-label="Career Queue Recruiter — home"
        className="flex w-fit items-center gap-2.5 focus-visible:outline-white"
      >
        <Logo variant="mark" onDark priority className="h-7 w-auto" />
        <span className="text-[15px] font-semibold text-white">Recruiter</span>
      </Link>

      <div className="py-[clamp(1rem,3vh,2rem)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-500)]">
          {content.eyebrow}
        </p>
        <p className="mt-4 max-w-[15ch] text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl">
          {content.headline}
        </p>
        <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-white/70">{content.body}</p>

        {/* Width is capped against the VIEWPORT HEIGHT as well as an absolute
            max, for the same reason as the padding above. Driving the cap from
            WIDTH keeps the aspect ratio intact — a max-height clamp would
            letterbox the drawing inside a too-wide box and pull it off the
            text's left rail. */}
        <Illustration className="mt-[clamp(1rem,3vh,2rem)] h-auto w-full max-w-[min(26rem,44vh)]" />
      </div>

      <ul className="space-y-3.5">
        {content.points.map((point) => {
          const Icon = ICONS[point.icon];
          return (
            <li key={point.label} className="flex items-center gap-3">
              <Icon
                className="size-[18px] shrink-0 text-[var(--color-accent-500)]"
                aria-hidden="true"
              />
              <span className="text-sm text-white/80">{point.label}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
