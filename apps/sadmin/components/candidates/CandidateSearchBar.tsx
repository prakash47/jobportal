'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/**
 * Search for the candidate master list.
 *
 * The implementation moved to ../AdminSearchBar when the Subscriptions console
 * became the third copy of it — the condition JobPostingSearchBar's comment named
 * for extracting a shared primitive. Behaviour is unchanged: the two originals
 * were verified identical in code beforehand, differing only in the placeholder
 * and the accessible label, which are now props.
 */
export function CandidateSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by name or email…"
      // The label states the scope so an admin is not searching blind: this
      // matches name and email only, not headline, phone or id.
      label="Search candidates by name or email"
    />
  );
}
