'use client';

import { useId, useState, type ComponentType, type SVGProps } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@jobportal/ui';
import {
  Briefcase,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Settings,
  ShieldCheck,
  User,
  Users,
} from '@jobportal/ui/icons';

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

// Top-level items. Each carries an 18px icon so the rail matches the seeker
// dashboard's (apps/web DashboardChrome) — the icon is the only place brand
// cyan appears in the nav, and only on the ACTIVE row.
//
// "Jobs" is NOT here — it's a collapsible group (see JOBS_ITEMS) rendered
// between the Dashboard (above) and the remaining flat items (below).
const TOP_ITEMS_ABOVE = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard as NavIcon },
] as const;

// Rendered immediately after the Jobs group, under the "Hiring" eyebrow.
const HIRING_ITEMS_BELOW = [
  { href: '/post-job', label: 'Post a Job', icon: Plus as NavIcon },
] as const;

// Rendered under the "Company" eyebrow. Order is unchanged from before the
// eyebrows existed — the labels only partition the existing list, they never
// reorder or regroup a destination.
const COMPANY_ITEMS = [
  { href: '/profile', label: 'Profile', icon: User as NavIcon },
  { href: '/kyc', label: 'Verification', icon: ShieldCheck as NavIcon },
  { href: '/users', label: 'Users', icon: Users as NavIcon },
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

// "Billing" is the Plans & Billing surface. The group renders when the (authed)
// layout says recruiter.plans_visible is ON — seeded ON, so every recruiter
// sees it and can review the catalogue plus their own Free-plan state. Paid
// features stay invisible-until-launched per CLAUDE.md §0 in the sense that
// matters: nothing can be BOUGHT until subscription.system.enabled is flipped
// (purchase CTAs render disabled). Cosmetic gate only; L1/L2/L3 do the real work.
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

// The rail sits on a FIXED navy surface (--color-primary-600) that does not
// follow the light/dark token swap, so its states are alpha-white rather than
// surface tokens — same approach as the seeker dashboard's rail. Contrast on
// #192249: white/70 = 8.3:1, white/60 = 6.3:1, cyan accent-500 = 5.2:1.
const ROW = 'mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
const ROW_ACTIVE = 'bg-white/10 font-medium text-white';
const ROW_IDLE = 'text-white/70 hover:bg-white/5 hover:text-white';

// Child rows carry no icon of their own; the left padding lines their label up
// with the parents' labels (px-3 = 12px, icon 18px, gap-3 = 12px → 42px).
const CHILD_ROW = 'mt-0.5 block rounded-lg py-2 pr-3 pl-[42px] text-sm transition-colors';

const ICON = 'size-[18px] shrink-0';
// Brand cyan on the active row's icon only — the seeker rail's single accent.
const ICON_ACTIVE = 'text-[var(--color-accent-500)]';
const ICON_IDLE = 'text-white/70';

// Section eyebrow. Sentence case, not uppercase (matches the seeker).
const GROUP_LABEL = 'px-3 pb-1 pt-5 text-[11px] font-medium tracking-wide text-white/60';

// Left rail on the navy surface. Active state via aria-current; a translucent
// white pill rather than a heavy fill (CLAUDE.md §2 — restraint). "Jobs",
// "Settings", "Billing" and "Help & Support" are disclosures: the parent button
// toggles, the sub-items are the real destinations.
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
    <nav aria-label="Recruiter portal" className="flex flex-col text-sm">
      {TOP_ITEMS_ABOVE.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon className={cn(ICON, active ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
            {item.label}
          </Link>
        );
      })}

      <div className={GROUP_LABEL}>Hiring</div>

      {/* Jobs — collapsible group. Parent is highlighted (not aria-current) when
          any jobs route is active, so the active page stays the sub-item. */}
      <button
        type="button"
        aria-expanded={jobsOpen}
        aria-controls={jobsMenuId}
        onClick={() => setJobsOpen((v) => !v)}
        className={cn(ROW, 'justify-between text-left', jobsActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span className="flex items-center gap-3">
          <Briefcase className={cn(ICON, jobsActive ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
          Jobs
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            jobsOpen ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      <ul id={jobsMenuId} className={cn('flex-col', jobsOpen ? 'flex' : 'hidden')}>
        {JOBS_ITEMS.map((item) => {
          // "All jobs" is active on any jobs route except the draft-filtered one;
          // "Draft Jobs" only when ?status=DRAFT is present.
          const active = item.href === '/jobs' ? jobsActive && !draftJobsActive : draftJobsActive;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(CHILD_ROW, active ? ROW_ACTIVE : ROW_IDLE)}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {HIRING_ITEMS_BELOW.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon className={cn(ICON, active ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
            {item.label}
          </Link>
        );
      })}

      <div className={GROUP_LABEL}>Company</div>

      {COMPANY_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon className={cn(ICON, active ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
            {item.label}
          </Link>
        );
      })}

      <div className={GROUP_LABEL}>Account</div>

      {showBilling && (
        <>
          <button
            type="button"
            aria-expanded={billingOpen}
            aria-controls={billingMenuId}
            onClick={() => setBillingOpen((v) => !v)}
            className={cn(ROW, 'justify-between text-left', billingActive ? ROW_ACTIVE : ROW_IDLE)}
          >
            <span className="flex items-center gap-3">
              <CreditCard
                className={cn(ICON, billingActive ? ICON_ACTIVE : ICON_IDLE)}
                aria-hidden
              />
              Billing
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 shrink-0 transition-transform duration-200',
                billingOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
          <ul id={billingMenuId} className={cn('flex-col', billingOpen ? 'flex' : 'hidden')}>
            {BILLING_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(CHILD_ROW, active ? ROW_ACTIVE : ROW_IDLE)}
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
        className={cn(ROW, 'justify-between text-left', settingsActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span className="flex items-center gap-3">
          <Settings className={cn(ICON, settingsActive ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
          Settings
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      {/* display toggled via class (not the `hidden` attr) to avoid Tailwind's
          class-vs-UA specificity gotcha; when closed the links leave the tab order. */}
      <ul id={submenuId} className={cn('flex-col', open ? 'flex' : 'hidden')}>
        {SETTINGS_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(CHILD_ROW, active ? ROW_ACTIVE : ROW_IDLE)}
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
        className={cn(ROW, 'justify-between text-left', helpActive ? ROW_ACTIVE : ROW_IDLE)}
      >
        <span className="flex items-center gap-3">
          <MessageCircle className={cn(ICON, helpActive ? ICON_ACTIVE : ICON_IDLE)} aria-hidden />
          Help &amp; Support
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform duration-200',
            helpOpen ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      <ul id={helpMenuId} className={cn('flex-col', helpOpen ? 'flex' : 'hidden')}>
        {HELP_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(CHILD_ROW, active ? ROW_ACTIVE : ROW_IDLE)}
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
