'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@jobportal/ui';
import { ChevronDown } from '@jobportal/ui/icons';

// Top-level items — flat, text-only (the portal's Linear-restraint rail).
const TOP_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/profile', label: 'Profile' },
  { href: '/kyc', label: 'Verification' },
  { href: '/users', label: 'Users' },
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
// than a heavy fill (CLAUDE.md §2 — restraint). "Settings" and "Billing" are
// disclosures: the parent button toggles, the sub-items are the real destinations.
export function SidebarNav({ showBilling = false }: { showBilling?: boolean }) {
  const pathname = usePathname();
  const submenuId = useId();
  const billingMenuId = useId();
  const helpMenuId = useId();
  // /settings and every /settings/* child (incl. the redirect stub pages) belong
  // to the group — used to auto-expand on first load and to highlight the parent.
  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/');
  const [open, setOpen] = useState(settingsActive);
  const billingActive = BILLING_ITEMS.some((item) => isActive(pathname, item.href));
  const [billingOpen, setBillingOpen] = useState(billingActive);
  const helpActive = pathname === '/support' || pathname.startsWith('/support/');
  const [helpOpen, setHelpOpen] = useState(helpActive);

  return (
    <nav aria-label="Recruiter portal" className="flex flex-col gap-0.5 text-sm">
      {TOP_ITEMS.map((item) => {
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
