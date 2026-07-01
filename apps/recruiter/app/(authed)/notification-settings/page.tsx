import { redirect } from 'next/navigation';

// Notification settings moved under Settings → /settings/notification-settings.
// This stub 308-redirects the old URL so any stale bookmark or in-flight link
// still lands on the page. Safe to remove once no old links remain.
export default function NotificationSettingsRedirect() {
  redirect('/settings/notification-settings');
}
