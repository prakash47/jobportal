import Link from 'next/link';

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
      { label: 'My applications', href: '/me/applications' },
    ],
  },
  {
    title: 'For recruiters',
    links: [
      { label: 'Hire on JobPortal', href: `${RECRUITER_URL}/register`, external: true },
      { label: 'Recruiter sign in', href: `${RECRUITER_URL}/login`, external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link
              href="/"
              className="text-base font-semibold tracking-tight text-[var(--color-fg)]"
            >
              JobPortal
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--color-fg-muted)]">
              A calmer job search built for India.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">
                {col.title}
              </div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a
                        href={l.href}
                        className="text-sm text-[var(--color-fg)] hover:text-[var(--color-primary-600)]"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-[var(--color-fg)] hover:text-[var(--color-primary-600)]"
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

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-fg-subtle)] sm:flex-row sm:items-center">
          <span>&copy; {new Date().getFullYear()} JobPortal</span>
          <span>Made in India</span>
        </div>
      </div>
    </footer>
  );
}
