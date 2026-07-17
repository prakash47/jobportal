'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { ChevronDown } from '@jobportal/ui/icons';

// Top-level items — flat, text-only (the portal's Linear-restraint rail).
// "Jobs" is NOT here — it's a collapsible group (see JOBS_ITEMS) rendered
// between the Dashboard (above) and the remaining flat items (below).
const TOP_ITEMS_ABOVE = [{ href: '/dashboard', label: 'Dashboard' }] as const;
const TOP_ITEMS_BELOW = [
  { href: '/post-job', label: 'Post a Job' },
  { href: '/profile', label: 'Profile' },
  { href: '/kyc', label: 'Verification' },
  { href: '/users', label: 'Users' },
] as const;

// "Jobs" is a collapsible group (same disclosure pattern as Settings): the
// parent toggles, the children are the real destinations. "All jobs" is the
// full company list; "Draft Jobs" is that same list pre-filtered to
// saved-but-unpublished postings (?status=DRAFT) — so it reuses the existing
// Jobs list, filter bar, sorting, pagination and per-row actions rather than
// duplicating a page.
const JOBS_ITEMS = [
  { href: '/jobs', label: 'All jobs' },
  { href: '/jobs?status=DRAFT', label: 'Draft Jobs' },
] as const;

// "Settings" is a collapsible group; its children are real routes under
// /settings. Notification settings moved here from its old top-level /notification-settings.
const SETTINGS_ITEMS = [
  { href: '/settings/notification-settings', label: 'Notification settings' },
  { href: '/settings/change-password', label: 'Change password' },
] as const;

// "Billing" is the paid Plans & Billing surface. The group only renders when
// the (authed) layout says subscription.system.enabled is ON — a Day-0
// recruiter must not see a dead nav entry (CLAUDE.md §0: paid features are
// invisible until launched). Cosmetic gate only; L1/L2/L3 do the real work.
const BILLING_ITEMS = [
  { href: '/plans', label: 'Plans & pricing' },
  { href: '/billing', label: 'Subscription & invoices' },
] as const;

// "Help & Support" is a collapsible group like Settings. Always rendered (it is
// a free feature); if an admin flips killswitch.recruiter_help_support ON the
// sub-pages 404 — the same behaviour as the Verification / Users entries.
const HELP_ITEMS = [
  { href: '/support/faq', label: 'FAQ' },
  { href: '/support/contact', label: 'Contact us' },
  { href: '/support/tickets', label: 'Raise a ticket' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ROW = 'rounded-md px-3 py-1.5 transition-colors';
const ROW_ACTIVE = 'bg-[var(--color-bg-muted)] font-medium text-[var(--color-fg)]';
const ROW_IDLE =
  'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]';

// Linear-style left rail. Active state via aria-current; subtle hover row rather
// than a heavy fill (CLAUDE.md §2 — restraint). "Jobs", "Settings", "Billing" and
// "Help & Support" are disclosures: the parent button toggles, the sub-items are
// the real destinations.
export function SidebarNav({ showBilling = false }: { showBilling?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const submenuId = useId();
  const billingMenuId = useId();
  const helpMenuId = useId();
  const jobsMenuId = useId();
  // /settings and every /settings/* child (incl. the redirect stub pages) belong
  // to the group — used to auto-expand on first load and to highlight the parent.
  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');
  const [open, setOpen] = useState(settingsActive);
  // "Jobs" group — the parent highlights for the list and its detail sub-routes
  // (/jobs, /jobs/[id]/edit, /jobs/[id]/applicants). "Draft Jobs" is the same
  // /jobs list carrying ?status=DRAFT; the status param is what distinguishes it
  // from "All jobs" so only one child is aria-current at a time.
  const jobsActive = pathname === '/jobs' || pathname.startsWith('/jobs/');
  const draftJobsActive = pathname === '/jobs' && searchParams.get('status') === 'DRAFT';
  const [jobsOpen, setJobsOpen] = useState(jobsActive);
  const billingActive = BILLING_ITEMS.some((item) => isActive(pathname, item.href));
  const [billingOpen, setBillingOpen] = useState(billingActive);
  const helpActive = pathname === '/support' || pathname.startsWith('/support/');
  const [helpOpen, setHelpOpen] = useState(helpActive);

  return (
    <nav aria-label="Recruiter portal" className="flex flex-col gap-0.5 text-sm">
      {TOP_ITEMS_ABOVE.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            {item.label}
          </Link>
        );
      })}

      {/* Jobs — collapsible group. Parent is highlighted (not aria-current) when
          any jobs route is active, so the active page stays the sub-item. */}
      <button
        type="button"
        aria-expanded={jobsOpen}
        aria-controls={jobsMenuId}
        onClick={() => setJobsOpen((v) => !v)}
        className={cn(
          ROW,
          'flex items-center justify-between gap-2 text-left',
          jobsActive ? ROW_ACTIVE : ROW_IDLE,
        )}
      >
        <span>Jobs</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            jobsOpen ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      <ul id={jobsMenuId} className={cn('mt-0.5 flex-col gap-0.5 pl-3', jobsOpen ? 'flex' : 'hidden')}>
        {JOBS_ITEMS.map((item) => {
          // "All jobs" is active on any jobs route except the draft-filtered one;
          // "Draft Jobs" only when ?status=DRAFT is present.
          const active = item.href === '/jobs' ? jobsActive && !draftJobsActive : draftJobsActive;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(ROW, 'block', active ? ROW_ACTIVE : ROW_IDLE)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {TOP_ITEMS_BELOW.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            {item.label}
          </Link>
        );
      })}

      {showBilling && (
        <>
          <button
            type="button"
            aria-expanded={billingOpen}
            aria-controls={billingMenuId}
            onClick={() => setBillingOpen((v) => !v)}
            className={cn(
              ROW,
              'flex items-center justify-between gap-2 text-left',
              billingActive ? ROW_ACTIVE : ROW_IDLE,
            )}
          >
            <span>Billing</span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 shrink-0 transition-transform duration-200',
                billingOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
          <ul
            id={billingMenuId}
            className={cn('mt-0.5 flex-col gap-0.5 pl-3', billingOpen ? 'flex' : 'hidden')}
          >
            {BILLING_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(ROW, 'block', active ? ROW_ACTIVE : ROW_IDLE)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Settings — collapsible. Parent is highlighted (not aria-current) when a
          child is active, so the active page stays the sub-item. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={submenuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(ROW, 'flex items-center justify-between gap-2 text-left', settingsActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span>Settings</span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>

      {/* display toggled via class (not the `hidden` attr) to avoid Tailwind's
          class-vs-UA specificity gotcha; when closed the links leave the tab order. */}
      <ul id={submenuId} className={cn('mt-0.5 flex-col gap-0.5 pl-3', open ? 'flex' : 'hidden')}>
        {SETTINGS_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(ROW, 'block', active ? ROW_ACTIVE : ROW_IDLE)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Help & Support — collapsible group, same pattern as Settings. */}
      <button
        type="button"
        aria-expanded={helpOpen}
        aria-controls={helpMenuId}
        onClick={() => setHelpOpen((v) => !v)}
        className={cn(ROW, 'flex items-center justify-between gap-2 text-left', helpActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span>Help &amp; Support</span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 transition-transform duration-200', helpOpen ? 'rotate-0' : '-rotate-90')}
        />
      </button>

      <ul id={helpMenuId} className={cn('mt-0.5 flex-col gap-0.5 pl-3', helpOpen ? 'flex' : 'hidden')}>
        {HELP_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(ROW, 'block', active ? ROW_ACTIVE : ROW_IDLE)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
