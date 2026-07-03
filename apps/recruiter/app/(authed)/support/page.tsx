import { redirect } from 'next/navigation';

// Help & Support has no landing of its own — visiting /support drops the
// recruiter on the FAQ. The sidebar "Help & Support" group expands to the real
// destinations (FAQ, Contact us, Raise a ticket).
export default function SupportIndex() {
  redirect('/support/faq');
}
