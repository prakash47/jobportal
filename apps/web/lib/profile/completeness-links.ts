import type { CompletenessItem } from '@jobportal/domain/profile-completeness';

/**
 * Where a seeker goes to fix each incomplete field.
 *
 * Deliberately lives in the web app, not in `@jobportal/domain`: these are
 * website routes, and the REST API has no use for them.
 *
 * ⚠️ TWO FIELDS HAVE NO POST-ONBOARDING EDITOR. `currentCompany` (6 pts) and
 * `preferredCities` (5 pts) are written ONLY by the onboarding wizard —
 * `ProfileForm` on /profile/details renders neither. Between them that is 11 of
 * 100 points.
 *
 * They point at /onboarding, which has no completion guard and can be re-entered,
 * so both rows are genuinely earnable there. Verify that before trusting it: an
 * earlier version of this file claimed the same thing while `currentCompany` was
 * scored off the `currentCompanyId` FK, which the wizard never writes (it writes
 * the free-text `currentCompanyName`) — so that row was unearnable by ANY route
 * and capped every user below 100. The scorer now credits either column.
 *
 * Sending someone back through a wizard to edit one field is still a workaround.
 * The fix is adding both controls to ProfileForm, recorded as a follow-up rather
 * than smuggled into this change.
 */
const EDIT_HREF: Readonly<Record<string, string>> = {
  name: '/profile/details',
  phone: '/profile/details',
  headline: '/profile/details',
  summary: '/profile/details',
  experienceMonths: '/profile/details',
  currentTitle: '/profile/details',
  expectedSalary: '/profile/details',
  noticePeriod: '/profile/details',
  // No editor on /profile/details — see the warning above.
  currentCompany: '/onboarding',
  preferredCities: '/onboarding',
  skills: '/profile/skills',
  education: '/profile/education',
  experience: '/profile/experience',
  resume: '/profile/resume',
};

/** Fallback keeps a newly-added scored field clickable instead of dead. */
const FALLBACK_HREF = '/profile/details';

export interface CompletenessStep extends CompletenessItem {
  href: string;
}

export function withEditLinks(items: CompletenessItem[]): CompletenessStep[] {
  return items.map((i) => ({ ...i, href: EDIT_HREF[i.key] ?? FALLBACK_HREF }));
}
