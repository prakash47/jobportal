'use client';

import { useId, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jobportal/ui';
import { api } from '../../lib/api-client';
import { INDIAN_STATES } from './states';

// Billing details (legal name, GSTIN, address, state) — collected before the
// first purchase and editable later. The state powers the invoice's CGST+SGST
// vs IGST split, so it is a fixed list, not free text. Client checks mirror
// the server DTO for instant feedback; the API re-validates (trust boundary).

export interface BillingProfileData {
  legalName: string;
  gstin: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  billingEmail: string | null;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: BillingProfileData | null;
  // Prefill hints when no profile exists yet (from company KYC, if submitted).
  prefill?: { legalName?: string | null; gstin?: string | null } | undefined;
  onSaved: (profile: BillingProfileData) => void;
}

export function BillingDetailsDialog({ open, onOpenChange, initial, prefill, onSaved }: Props) {
  const ids = {
    legalName: useId(),
    gstin: useId(),
    address1: useId(),
    address2: useId(),
    city: useId(),
    state: useId(),
    pincode: useId(),
    email: useId(),
  };

  const [legalName, setLegalName] = useState(initial?.legalName ?? prefill?.legalName ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? prefill?.gstin ?? '');
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [state, setState] = useState(initial?.state ?? '');
  const [pincode, setPincode] = useState(initial?.pincode ?? '');
  const [billingEmail, setBillingEmail] = useState(initial?.billingEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (legalName.trim().length < 2) return 'Enter the registered legal name.';
    if (gstin.trim() && !GSTIN_RE.test(gstin.trim().toUpperCase()))
      return 'Invalid GSTIN — must be a 15-character GST number.';
    if (addressLine1.trim().length < 3) return 'Enter the billing address.';
    if (city.trim().length < 2) return 'Enter the city.';
    if (!state) return 'Select the state.';
    if (!PINCODE_RE.test(pincode.trim())) return 'Invalid PIN code — must be 6 digits.';
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    const res = await api<BillingProfileData>('/recruiter/billing/profile', {
      method: 'PUT',
      body: JSON.stringify({
        legalName: legalName.trim(),
        gstin: gstin.trim().toUpperCase(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim(),
        city: city.trim(),
        state,
        pincode: pincode.trim(),
        billingEmail: billingEmail.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(
        typeof res.message === 'string' ? res.message : 'Could not save your billing details.',
      );
      return;
    }
    onSaved(res.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Billing details</DialogTitle>
          <DialogDescription>
            These appear on your GST invoices. Add your GSTIN to claim input tax credit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={ids.legalName}>Registered legal name</Label>
            <Input
              id={ids.legalName}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              autoComplete="organization"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.gstin}>GSTIN (optional)</Label>
            <Input
              id={ids.gstin}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="15-character GST number"
              maxLength={15}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.address1}>Address line 1</Label>
            <Input
              id={ids.address1}
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              autoComplete="address-line1"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.address2}>Address line 2 (optional)</Label>
            <Input
              id={ids.address2}
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              autoComplete="address-line2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.city}>City</Label>
              <Input
                id={ids.city}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.pincode}>PIN code</Label>
              <Input
                id={ids.pincode}
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                autoComplete="postal-code"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.state}>State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger id={ids.state}>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.email}>Billing email (optional)</Label>
            <Input
              id={ids.email}
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="Defaults to the purchaser's email"
              autoComplete="email"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
