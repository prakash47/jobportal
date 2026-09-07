import { apiFetch } from '../api/fetch';

export type Frequency = 'instant' | 'daily' | 'weekly';

export const FREQUENCIES: ReadonlyArray<{ value: Frequency; label: string; hint: string }> = [
  { value: 'instant', label: 'Instant', hint: 'As soon as a match is posted' },
  { value: 'daily', label: 'Daily', hint: 'One digest each morning' },
  { value: 'weekly', label: 'Weekly', hint: 'One digest each Monday' },
];

/**
 * The saved-search payload. Mirrors the API's AlertQueryDto — keys are omitted
 * rather than sent empty, because the matcher treats a present key as a filter.
 */
export interface AlertQuery {
  q?: string;
  skillSlugs?: string[];
  citySlugs?: string[];
  minExperienceMonths?: number;
  maxExperienceMonths?: number;
  salaryMin?: number;
}

// Salary is stored in paise (1 INR = 100 paise) and entered in lakhs per annum.
export function lpaToPaise(lpa: number | ''): number | undefined {
  if (lpa === '' || Number.isNaN(Number(lpa))) return undefined;
  return Math.round(Number(lpa) * 100_000 * 100);
}

export function paiseToLpa(paise: number | undefined): number | '' {
  if (paise === undefined) return '';
  return Math.round((paise / 100 / 100_000) * 10) / 10;
}

export function yearsToMonths(years: number | ''): number | undefined {
  if (years === '') return undefined;
  return Math.round(Number(years) * 12);
}

export function monthsToYears(months: number | undefined): number | '' {
  if (months === undefined) return '';
  return Math.round(months / 12);
}

export function buildQuery(input: {
  q?: string;
  skillSlugs?: string[];
  citySlugs?: string[];
  minExpYears?: number | '';
  maxExpYears?: number | '';
  salaryMinLpa?: number | '';
}): AlertQuery {
  const query: AlertQuery = {};
  const q = input.q?.trim();
  if (q) query.q = q;
  if (input.skillSlugs && input.skillSlugs.length > 0) query.skillSlugs = input.skillSlugs;
  if (input.citySlugs && input.citySlugs.length > 0) query.citySlugs = input.citySlugs;

  const min = yearsToMonths(input.minExpYears ?? '');
  if (min !== undefined) query.minExperienceMonths = min;
  const max = yearsToMonths(input.maxExpYears ?? '');
  if (max !== undefined) query.maxExperienceMonths = max;
  const salary = lpaToPaise(input.salaryMinLpa ?? '');
  if (salary !== undefined) query.salaryMin = salary;

  return query;
}

export interface SaveAlertResult {
  ok: boolean;
  message: string;
}

/**
 * Create or update an alert. Routed through `apiFetch`, so an expired 15-minute
 * access token is refreshed and retried rather than surfacing as
 * "No access token" (see bugfix/session-refresh-on-401).
 */
export async function saveAlert(
  id: number | null,
  body: { name: string; query: AlertQuery; frequency: Frequency; isActive: boolean },
): Promise<SaveAlertResult> {
  try {
    const res = await apiFetch(id === null ? '/me/alerts' : `/me/alerts/${id}`, {
      method: id === null ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
      return { ok: false, message: message ?? `Save failed (${res.status})` };
    }
    return { ok: true, message: '' };
  } catch {
    return { ok: false, message: 'Network error — please try again.' };
  }
}
