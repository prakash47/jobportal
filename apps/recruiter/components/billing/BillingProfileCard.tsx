'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@jobportal/ui';
import { BillingDetailsDialog, type BillingProfileData } from './BillingDetailsDialog';

// Billing-details card on /billing with an Edit affordance — the profile drives
// the GSTIN + CGST/SGST-vs-IGST split on every invoice, so a first-purchase
// typo must be self-serve correctable (the API PUT already upserts + audits).

interface Props {
  profile: BillingProfileData | null;
  kycPrefill: { legalName?: string | null; gstin?: string | null } | null;
}

export function BillingProfileCard({ profile, kycPrefill }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<BillingProfileData | null>(profile);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Billing details</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {current ? 'Edit' : 'Add details'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-[var(--color-fg-muted)]">
        {current ? (
          <div className="space-y-0.5">
            <p className="font-medium text-[var(--color-fg)]">{current.legalName}</p>
            {current.gstin && <p>GSTIN: {current.gstin}</p>}
            <p>
              {[current.addressLine1, current.addressLine2, current.city]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p>
              {current.state} {current.pincode}
            </p>
          </div>
        ) : (
          <p>Add your billing details to appear on GST invoices.</p>
        )}
      </CardContent>

      <BillingDetailsDialog
        open={open}
        onOpenChange={setOpen}
        initial={current}
        prefill={current ? undefined : (kycPrefill ?? undefined)}
        onSaved={(saved) => {
          setCurrent(saved);
          setOpen(false);
          router.refresh();
        }}
      />
    </Card>
  );
}
