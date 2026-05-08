import { redirect } from 'next/navigation';

// /admin lands on the feature-flags page. requireAdmin() in the layout
// runs before this redirect, so a non-admin visiting /admin still 404s
// rather than being given a hint via the redirect.
export default function AdminIndexPage() {
  redirect('/admin/feature-flags');
}
