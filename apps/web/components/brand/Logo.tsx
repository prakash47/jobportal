import Image from 'next/image';
import { cn } from '@jobportal/ui';

// Career Queue brand logo. Two variants:
//   - "mark":   the compact CQ monogram + arrow (used in the slim site header)
//   - "lockup": the full CQ + "Career Queue" wordmark (used in the footer)
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
  /** Set on above-the-fold placements (header) to skip lazy-loading. */
  priority?: boolean;
  /**
   * Force the white reverse logo regardless of theme. Use on fixed dark
   * surfaces (the navy footer / CTA panel) whose background does NOT follow
   * the light/dark theme swap — there the auto color-on-light / white-on-dark
   * logic would show the navy logo on navy. `onDark` short-circuits that.
   */
  onDark?: boolean;
}

export function Logo({
  variant = 'mark',
  className = 'h-8 w-auto',
  priority = false,
  onDark = false,
}: LogoProps) {
  const a = ASSETS[variant];

  // Fixed dark surface: always the white asset, no theme swap.
  if (onDark) {
    return (
      <Image src={a.white} alt="" width={a.width} height={a.height} priority={priority} className={className} />
    );
  }

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
