import Image, { type StaticImageData } from 'next/image';
import { cn } from '@jobportal/ui';
import markColor from '../../public/brand/cq-mark-color.png';
import markWhite from '../../public/brand/cq-mark-white.png';
import lockupColor from '../../public/brand/cq-logo-color.png';
import lockupWhite from '../../public/brand/cq-logo-white.png';

// Career Queue brand logo for the Super Admin portal. Two variants:
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
// NOTE: mirrors apps/web/ and apps/recruiter/components/brand/Logo.tsx, with
// ONE deliberate difference — see below. All three are intentionally duplicated
// (each Next app serves its own /public/brand assets, so this cannot live in
// @jobportal/ui as-is); consolidating them is a possible future cleanup.
//
// ── Why STATIC IMPORTS + `unoptimized` here, and plain string srcs elsewhere ──
// This app sets `basePath: '/sadmin'`, and next/image does NOT apply the
// basePath to a STRING src. The other two apps write src="/brand/x.png" and it
// works because they have no basePath; here the browser would request
// `/brand/x.png` while the asset is only served at `/sadmin/brand/x.png` — every
// logo 404s. Turning the optimizer on does not save it either: Next emits
// `/sadmin/_next/image?url=%2Fbrand%2Fx.png`, and the un-prefixed `url` param
// makes the optimizer resolve against the ORIGIN ROOT, failing with "The
// requested resource isn't a valid image ... received null".
//
// A static import resolves to a `/_next/static/media/...` URL, and Next DOES
// prefix `/_next/*` with the basePath — so the path is correct without any app
// code ever writing "/sadmin", which is what keeps basePath a one-line,
// reversible decision in next.config.ts. `unoptimized` is then required to keep
// the optimizer (and its un-prefixed `url` param) out of the path entirely;
// that costs nothing for fixed-size ~12KB PNGs rendered at h-7, and matches how
// this repo already handles optimizer trouble (apps/recruiter's CompanyLogo and
// the bugfix/company-logo-image-host fix in apps/web).
//
// Static imports also carry their own intrinsic width/height, so the explicit
// width/height props the other copies pass are unnecessary here.

const ASSETS: Record<'mark' | 'lockup', { color: StaticImageData; white: StaticImageData }> = {
  mark: { color: markColor, white: markWhite },
  lockup: { color: lockupColor, white: lockupWhite },
};

export interface LogoProps {
  variant?: 'mark' | 'lockup';
  /** Height utility; width stays auto to preserve aspect ratio. Default `h-8 w-auto`. */
  className?: string;
  /** Set on above-the-fold placements to skip lazy-loading. */
  priority?: boolean;
  /**
   * Force the white reverse logo regardless of theme. Required on fixed dark
   * surfaces (the navy sidebar rail) whose background does NOT follow the
   * light/dark theme swap. Without it the auto path below picks the COLOUR
   * asset — this app mounts no ThemeProvider, so `[data-theme="dark"]` never
   * matches and the `dark:block` white image stays hidden — which would put
   * the navy logo on a navy rail. Mirrors apps/web's and apps/recruiter's Logo.
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
    return <Image src={a.white} alt="" priority={priority} unoptimized className={className} />;
  }

  return (
    <>
      <Image
        src={a.color}
        alt=""
        priority={priority}
        unoptimized
        className={cn('block dark:hidden', className)}
      />
      <Image
        src={a.white}
        alt=""
        // Non-priority: in light mode this stays display:none and is never fetched.
        unoptimized
        className={cn('hidden dark:block', className)}
      />
    </>
  );
}
