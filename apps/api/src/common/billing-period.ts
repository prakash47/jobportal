// Shared subscription-period arithmetic — promoted out of
// RecruiterBillingService when AdminBillingService needed the same logic, the
// same way resolveRecruiterTier was promoted out of ApplicationQuotaService.
//
// Two call sites now extend a subscription period: a Razorpay capture (renewal)
// and a staff comp/extend on /sadmin/subscriptions. They must agree exactly, or
// the same plan bought and comped would end on different days.

/**
 * Adds whole days to an instant.
 *
 * Epoch-millisecond arithmetic rather than calendar arithmetic, deliberately: a
 * subscription period is a fixed duration (`SubscriptionPlan.intervalDays`), not
 * "the same date next month", so 30 days is always exactly 30 × 24h regardless
 * of month length. It is also immune to the local timezone — India has no DST,
 * but the server need not be in India.
 */
export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * The instant a period extension should start counting from.
 *
 * A still-running subscription extends from its existing end, so comping 30 days
 * to a plan with 10 days left leaves 40 — the recruiter is never silently robbed
 * of time they already had. A LAPSED subscription extends from now instead:
 * extending from an end date already in the past would burn part (or all) of the
 * grant on time that has already elapsed, and could leave a "renewed"
 * subscription still expired.
 *
 * The purchase path cannot reach the second case — it only ever extends rows it
 * has already filtered to `currentPeriodEnd > now` — which is precisely why this
 * rule lives here rather than being assumed at the call site.
 */
export function extendFrom(currentPeriodEnd: Date, now: Date): Date {
  return currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
}
