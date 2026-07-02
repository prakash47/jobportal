import { Bell } from '@jobportal/ui/icons';
import { EmptyState } from '../dashboard/EmptyState';

export function AlertsEmpty() {
  return (
    <EmptyState
      icon={<Bell className="size-5" />}
      title="No alerts yet"
      body="Set up an alert and we'll email you when matching jobs go live."
      cta={{ href: '/alerts/new', label: 'Create your first alert' }}
    />
  );
}
