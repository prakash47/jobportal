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
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-primary-600)] p-10 lg:flex xl:p-12">
      <Link
        href="/"
        aria-label="Career Queue Recruiter — home"
        className="flex w-fit items-center gap-2.5 focus-visible:outline-white"
      >
        <Logo variant="mark" onDark priority className="h-7 w-auto" />
        <span className="text-[15px] font-semibold text-white">Recruiter</span>
      </Link>

      <div className="py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-500)]">
          {content.eyebrow}
        </p>
        <p className="mt-4 max-w-[15ch] text-3xl font-semibold leading-[1.15] tracking-tight text-white xl:text-4xl">
          {content.headline}
        </p>
        <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-white/70">{content.body}</p>

        {/* Width is capped against the VIEWPORT HEIGHT as well as an absolute
            max: the panel is a single non-scrolling column, and on a 720px-tall
            laptop a fixed 26rem illustration is exactly what tips the whole
            page into vertical scroll. Driving the cap from width (not max-h)
            keeps the aspect ratio intact — a max-height clamp would letterbox
            the drawing inside a too-wide box. */}
        <Illustration className="mt-8 h-auto w-full max-w-[min(26rem,46vh)]" />
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
