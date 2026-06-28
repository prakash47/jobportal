import type { ComponentType } from 'react';
import {
  Bell,
  Bookmark,
  Briefcase,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Sparkles,
  User,
} from '@jobportal/ui/icons';

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavGroup {
  /** Section label; omit for the top, label-less group. */
  label?: string;
  items: NavItem[];
}

// Single source of truth for the seeker dashboard sidebar. Used by both the
// desktop rail and the mobile drawer so they never drift.
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/profile', icon: LayoutDashboard }],
  },
  {
    label: 'Job search',
    items: [
      { label: 'Applications', href: '/applications', icon: ClipboardList },
      { label: 'Saved jobs', href: '/saved-jobs', icon: Bookmark },
      { label: 'Job alerts', href: '/alerts', icon: Bell },
    ],
  },
  {
    label: 'My profile',
    items: [
      { label: 'Personal details', href: '/profile/details', icon: User },
      { label: 'Education', href: '/profile/education', icon: GraduationCap },
      { label: 'Experience', href: '/profile/experience', icon: Briefcase },
      { label: 'Skills', href: '/profile/skills', icon: Sparkles },
      { label: 'Resume', href: '/profile/resume', icon: FileText },
    ],
  },
  {
    label: 'Account',
    items: [{ label: 'Notifications', href: '/settings/notifications', icon: Settings }],
  },
];

// Active-state matcher. /profile is exact (so it isn't lit for /profile/details);
// every other item also matches its deeper routes (e.g. /alerts/new → Job alerts).
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/profile') return pathname === '/profile';
  return pathname === href || pathname.startsWith(`${href}/`);
}
