import { redirect } from 'next/navigation';

// Settings has no landing of its own — visiting /settings drops the recruiter on
// the first sub-page. The sidebar "Settings" group expands to the real
// destinations (Notification settings, Change password).
export default function SettingsIndex() {
  redirect('/settings/notification-settings');
}
