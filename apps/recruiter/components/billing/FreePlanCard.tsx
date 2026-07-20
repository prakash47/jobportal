import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';

// The Free plan every recruiter is on by default. Deliberately SYNTHETIC — there
// is no tier:FREE SubscriptionPlan row in the catalogue, and a company with no
// Subscription row already resolves to FREE via the API's tier-resolver. Adding
// a real ₹0 row would ripple into the plan list, the per-tier launch flags and
// the purchase path for no gain, so this card is presentation-only.
//
// Rendered as the first card in the /plans grid so a recruiter always sees a
// current-plan state, even before any paid tier is launched.
//
// Feature copy is deliberately free of specific quota numbers: the recruiter
// post limits are env-configurable (RECRUITER_DAILY_POST_LIMIT /
// RECRUITER_MONTHLY_POST_LIMIT) and live counts already surface in the Post a
// Job wizard, so hardcoding figures here would drift.
const FREE_FEATURES = [
  'Post jobs within your free daily and monthly limits',
  'Full applicant tracking and status management',
  'Company profile and verification',
  'Team members with roles and permissions',
  'Email and ticket support',
];

export function FreePlanCard({ isCurrent }: { isCurrent: boolean }) {
  return (
    <Card className={cn('flex flex-col', isCurrent && 'border-[var(--color-primary-600)]')}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Free</CardTitle>
          {isCurrent && <Badge variant="primary">Current plan</Badge>}
        </div>
        <CardDescription>
          Everything you need to start hiring. No card required, no time limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p>
          <span className="text-3xl font-semibold tracking-tight text-[var(--color-fg)]">₹0</span>
          <span className="text-sm text-[var(--color-fg-muted)]">/month</span>
          <span className="mt-0.5 block text-xs text-[var(--color-fg-subtle)]">always free</span>
        </p>
        <ul className="space-y-1.5 text-sm text-[var(--color-fg-muted)]">
          {FREE_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
