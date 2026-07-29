import { headers } from 'next/headers';
import { AuthSplit } from '../../components/auth/AuthSplit';
import { resolveAsideContent } from '../../lib/auth/aside-content';

// Public layout for /login, /register, /verify-email/[token] and
// /accept-invite/[token] — no sidebar. Two panes: the brand panel (navy, with
// a flat brand illustration) and the form, per CLAUDE.md §2.
//
// The panel's copy is route-specific, resolved from the `x-canonical-pathname`
// header the middleware already sets for every request in this app. That keeps
// the whole shell server-rendered — no usePathname, no client boundary — at the
// cost of marking these four routes dynamic. They already were: /login and
// /register read searchParams client-side, /verify-email fetches with
// no-store, and /accept-invite is force-dynamic. If the header is ever absent
// the resolver falls back to brand-level copy, so the panel still paints.

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const content = resolveAsideContent(requestHeaders.get('x-canonical-pathname'));

  return <AuthSplit content={content}>{children}</AuthSplit>;
}
