import { redirect } from 'next/navigation';

// The job-posting flow moved to its own top-level page, /post-job (surfaced as
// a "Post a Job" sidebar item). This legacy route is kept as a redirect so any
// bookmarked /jobs/new link (and the old wizard URL) still lands on the flow.
export default function LegacyNewJobRedirect(): never {
  redirect('/post-job');
}
