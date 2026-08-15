'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/**
 * Search for the Job Postings master list.
 *
 * The implementation moved to ../AdminSearchBar when the Subscriptions console
 * became the third copy — which is exactly the condition the previous version of
 * this file named for extracting it. Behaviour is unchanged: the two originals
 * were verified identical in code beforehand, differing only in the placeholder
 * and the accessible label, which are now props.
 *
 * The named wrapper is kept so the page's import does not change and so the
 * scope-stating label lives next to the console it describes.
 */
export function JobPostingSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by job title or company…"
      // The label states the scope so an admin is not searching blind: this
      // matches the job title and the company name only — not the description,
      // the city, the recruiter or the job id.
      label="Search job postings by job title or company"
    />
  );
}
