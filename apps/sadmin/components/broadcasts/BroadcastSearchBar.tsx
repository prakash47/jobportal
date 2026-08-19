'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/**
 * Search for the broadcast log.
 *
 * Thin wrapper over the shared AdminSearchBar, matching SupportSearchBar and
 * SubscriptionSearchBar — only the placeholder and the scope-stating accessible
 * label differ.
 */
export function BroadcastSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by subject…"
      // States the scope ACCURATELY: the API searches the subject only, not the
      // message body. Promising "search broadcasts" would over-claim, and a
      // staff member who searched for a phrase they remembered from the middle
      // of an announcement would conclude it had never been sent.
      label="Search broadcasts by subject"
    />
  );
}
