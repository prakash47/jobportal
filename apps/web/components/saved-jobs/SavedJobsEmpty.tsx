import { Bookmark } from '@jobportal/ui/icons';
import { EmptyState } from '../dashboard/EmptyState';

export function SavedJobsEmpty() {
  return (
    <EmptyState
      icon={<Bookmark className="size-5" />}
      title="No saved jobs yet"
      body="Bookmark roles you want to come back to — they'll wait for you here."
      cta={{ href: '/jobs', label: 'Browse all jobs' }}
    />
  );
}
