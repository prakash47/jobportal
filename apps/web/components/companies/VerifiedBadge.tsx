import { ShieldCheck } from '@jobportal/ui/icons';

// Trust signal shown only when a company's KYC has been admin-VERIFIED.
// Dormant until then (the recruiter Company Verification flow writes the
// status). Flat navy-tinted pill — no gradient, borders + tint do the work
// (CLAUDE.md §2). Kept small so it sits inline beside the company name.
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-md bg-[var(--color-primary-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary-800)]' +
        (className ? ` ${className}` : '')
      }
      title="This company's details have been verified"
    >
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      Verified
    </span>
  );
}
