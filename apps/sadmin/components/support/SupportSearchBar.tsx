'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/**
 * Search for the support ticket queue.
 *
 * Thin wrapper over the shared AdminSearchBar, matching ReportSearchBar and
 * SubscriptionSearchBar — only the placeholder and the scope-stating accessible
 * label differ.
 */
export function SupportSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by subject or company…"
      // The label states the scope so a staff member is not searching blind, and
      // it states it ACCURATELY: ticket descriptions and message bodies are
      // deliberately not searched (staff search to find a ticket they already
      // know of, not to trawl paragraphs), so promising "search tickets" alone
      // would over-claim.
      label="Search tickets by subject or company name"
    />
  );
}
