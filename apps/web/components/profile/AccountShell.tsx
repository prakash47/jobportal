import Link from 'next/link';
import { ArrowLeft } from '@jobportal/ui/icons';
import { ProfileNav } from './ProfileNav';
import { DailyApplyIndicator } from './DailyApplyIndicator';

// Shared two-column shell for the account / profile-edit sub-pages (details,
// education, experience, skills, resume). The dashboard hub (/profile) renders
// full-width and deliberately does NOT use this — the left rail is only for
// navigating between the editable sections.
export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
      {/* top-16 (64px) clears the sticky h-14 (56px) header with an 8px gap. */}
      <aside className="md:sticky md:top-16 md:self-start">
        <Link
          href="/profile"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Dashboard
        </Link>
        <ProfileNav />
        {/* SRS §4.11.16-17 — daily-application counter. Hides when the user
            has feature.unlimited_applications via their tier. */}
        <DailyApplyIndicator />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
