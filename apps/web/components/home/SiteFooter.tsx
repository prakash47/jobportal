import Link from 'next/link';
import { Logo } from '../brand/Logo';

const RECRUITER_URL = process.env.NEXT_PUBLIC_RECRUITER_URL ?? 'http://localhost:3001';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Discover',
    links: [
      { label: 'Browse jobs', href: '/jobs' },
      { label: 'Companies', href: '/companies' },
      { label: 'Career advice', href: '/career-advice' },
      { label: 'Job alerts', href: '/alerts' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/register' },
      { label: 'Profile', href: '/profile' },
      { label: 'My applications', href: '/applications' },
    ],
  },
  {
    title: 'For recruiters',
    links: [
      { label: 'Hire on Career Queue', href: `${RECRUITER_URL}/register`, external: true },
      { label: 'Recruiter sign in', href: `${RECRUITER_URL}/login`, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-[var(--color-primary-700)]">
      {/* Page closes on a single brand-gradient hairline. */}
      <div aria-hidden="true" className="h-0.5 w-full" style={{ background: 'var(--gradient-brand)' }} />
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" aria-label="Career Queue — home" className="inline-flex items-center">
              <Logo variant="lockup" onDark className="h-12 w-auto" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-primary-200)]">
              A calmer job search built for India.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-300)]">
                {col.title}
              </div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a
                        href={l.href}
                        className="text-sm text-[var(--color-primary-100)] transition-colors hover:text-[var(--color-accent-400)]"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-[var(--color-primary-100)] transition-colors hover:text-[var(--color-accent-400)]"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-6 text-xs text-[var(--color-primary-300)] sm:flex-row sm:items-center">
          <span>&copy; {new Date().getFullYear()} Career Queue</span>
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[var(--color-accent-500)]" aria-hidden="true" />
            Made in India
          </span>
        </div>
      </div>
    </footer>
  );
}
