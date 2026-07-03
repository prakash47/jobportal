import type { SupportTicketCategory } from '@jobportal/db';

// Human-readable labels for the SupportTicketCategory enum. Shared by the raise
// dialog (the Select options) and the tickets list/detail (rendering a stored
// category). Keyed by the Prisma enum so a new category is a compile error here
// until it gets a label. `import type` keeps Prisma out of the client bundle.
export const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  ACCOUNT: 'Account',
  JOB_POSTING: 'Job posting',
  APPLICANTS: 'Applicants',
  VERIFICATION: 'Verification',
  BILLING: 'Billing',
  TECHNICAL: 'Technical issue',
  OTHER: 'Other',
};

// Ordered list for the Select — general buckets first, catch-all last.
export const CATEGORY_OPTIONS: ReadonlyArray<{ value: SupportTicketCategory; label: string }> = [
  { value: 'ACCOUNT', label: CATEGORY_LABELS.ACCOUNT },
  { value: 'JOB_POSTING', label: CATEGORY_LABELS.JOB_POSTING },
  { value: 'APPLICANTS', label: CATEGORY_LABELS.APPLICANTS },
  { value: 'VERIFICATION', label: CATEGORY_LABELS.VERIFICATION },
  { value: 'BILLING', label: CATEGORY_LABELS.BILLING },
  { value: 'TECHNICAL', label: CATEGORY_LABELS.TECHNICAL },
  { value: 'OTHER', label: CATEGORY_LABELS.OTHER },
];
