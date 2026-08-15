'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/** Search for the Subscriptions & Billing list. See ../AdminSearchBar. */
export function SubscriptionSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by company or plan…"
      // The label states the scope so an admin is not searching blind: this
      // matches the company name and the plan name only — not the recruiter,
      // the invoice number or the subscription id.
      label="Search subscriptions by company or plan"
    />
  );
}
