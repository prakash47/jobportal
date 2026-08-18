'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/**
 * Search for the content-report queue.
 *
 * Thin wrapper over the shared AdminSearchBar, matching JobPostingSearchBar and
 * SubscriptionSearchBar — only the placeholder and the scope-stating accessible
 * label differ.
 */
export function ReportSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by job title or company…"
      // The label states the scope so an admin is not searching blind. This
      // matches the REPORTED POSTING, not the report: the reporter's free-text
      // details are deliberately not searched (most are blank), and the reason
      // is a tab-level facet rather than a search term.
      label="Search reports by the reported job title or company"
    />
  );
}
