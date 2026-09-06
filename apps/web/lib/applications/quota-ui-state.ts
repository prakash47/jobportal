// Pure UI-state classifier — keeps the JD page and the dashboard header pill in
// sync on when to render the "approaching limit" or "limit reached" states. No
// network, no React.
//
// (Said "profile sidebar" until 2026-09-06. There is no sidebar consumer and
// there never was: grep for classifyQuota returns job/[slug]/page.tsx and
// DailyApplyIndicator, which renders into DashboardChrome's header slot.)

export type QuotaUiState = 'unlimited' | 'normal' | 'warning' | 'exhausted';

const WARNING_THRESHOLD = 0.8;

export function classifyQuota(input: {
  count: number;
  limit: number;
  unlimited: boolean;
}): QuotaUiState {
  if (input.unlimited) return 'unlimited';
  if (input.limit <= 0) return 'normal'; // defensive — env override gone wrong
  if (input.count >= input.limit) return 'exhausted';
  if (input.count / input.limit >= WARNING_THRESHOLD) return 'warning';
  return 'normal';
}
