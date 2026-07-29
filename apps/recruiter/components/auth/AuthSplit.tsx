import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '../brand/Logo';
import { AuthAside } from './AuthAside';
import type { AsideContent } from '../../lib/auth/aside-content';

// Two-pane shell for the public (auth) pages: brand panel left, form right.
// Server component — nothing here needs client JS.
//
// Below `lg` the aside is DROPPED, not stacked. Stacking it would push the
// form under a full-height panel, so a phone would open the sign-in page on
// decorative artwork with the email field off-screen. The strip below keeps the
// brand present at that width and preserves the home link the previous
// single-column layout carried.
//
// The form pane sits on --color-bg-elevated rather than --color-bg: against a
// solid navy neighbour the ~1.5% darker canvas token reads as a dull grey.

export function AuthSplit({ content, children }: { content: AsideContent; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-elevated)] lg:grid lg:grid-cols-2">
      <header className="bg-[var(--color-primary-600)] px-6 py-4 lg:hidden">
        <Link
          href="/"
          aria-label="Career Queue Recruiter — home"
          /* focus-visible:outline-white — the inherited ring (primary-500) is
             only 1.96:1 on navy, under the 3:1 WCAG 1.4.11 floor. */
          className="flex w-fit items-center gap-2.5 focus-visible:outline-white"
        >
          <Logo variant="mark" onDark priority className="h-7 w-auto" />
          <span className="text-[15px] font-semibold text-white">Recruiter</span>
        </Link>
      </header>

      <AuthAside content={content} />

      {/* items-center means this padding only bites when the form is TALLER
          than the pane — i.e. the 4-field register form on a short laptop — so
          it is kept modest rather than generous. */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[25rem]">{children}</div>
      </main>
    </div>
  );
}
