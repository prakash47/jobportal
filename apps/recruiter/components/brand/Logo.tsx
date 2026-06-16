import Image from 'next/image';
import { cn } from '@jobportal/ui';

// Career Queue brand logo for the recruiter portal. Two variants:
//   - "mark":   the compact CQ monogram + arrow (used in the sidebar + auth header)
//   - "lockup": the full CQ + "Career Queue" wordmark (available for wider spots)
//
// Light/dark: the brand kit ships a full-colour logo (navy + cyan arrow) and a
// white reverse logo. Both <Image>s are rendered; CSS shows the colour one on
// light surfaces and the white one under [data-theme="dark"] — the same signal
// the surface tokens swap on (packages/ui theme.css + the `dark` variant in
// globals.css), so the logo always matches its background. The white image is
// display:none in light mode, so the browser never fetches it there.
//
// Alt text lives on the wrapping <Link> (aria-label), so the imgs are
// decorative (alt=""), avoiding a duplicate accessible name.
//
// NOTE: mirrors apps/web/components/brand/Logo.tsx. The two are intentionally
// duplicated (each Next app serves its own /public/brand assets); consolidating
// into @jobportal/ui is a possible future cleanup.

const ASSETS = {
  mark: {
    color: '/brand/cq-mark-color.png',
    white: '/brand/cq-mark-white.png',
    width: 400,
    height: 178,
  },
  lockup: {
    color: '/brand/cq-logo-color.png',
    white: '/brand/cq-logo-white.png',
    width: 600,
    height: 361,
  },
} as const;

export interface LogoProps {
  variant?: 'mark' | 'lockup';
  /** Height utility; width stays auto to preserve aspect ratio. Default `h-8 w-auto`. */
  className?: string;
  /** Set on above-the-fold placements to skip lazy-loading. */
  priority?: boolean;
}

export function Logo({ variant = 'mark', className = 'h-8 w-auto', priority = false }: LogoProps) {
  const a = ASSETS[variant];
  return (
    <>
      <Image
        src={a.color}
        alt=""
        width={a.width}
        height={a.height}
        priority={priority}
        className={cn('block dark:hidden', className)}
      />
      <Image
        src={a.white}
        alt=""
        width={a.width}
        height={a.height}
        // Non-priority: in light mode this stays display:none and is never fetched.
        className={cn('hidden dark:block', className)}
      />
    </>
  );
}
