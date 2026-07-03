import { ClipboardList } from '@jobportal/ui/icons';
import { EmptyState } from '../dashboard/EmptyState';

export function ApplicationsEmpty({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={<ClipboardList className="size-5" />}
      title={filtered ? 'Nothing matches this filter' : 'You haven’t applied to anything yet'}
      body={
        filtered
          ? 'Try a different status, or clear the filter.'
          : 'When you apply to a job it shows up here, with its full status history.'
      }
      cta={{ href: '/jobs', label: 'Browse all jobs' }}
    />
  );
}
