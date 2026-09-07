'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  cn,
} from '@jobportal/ui';
import { Plus } from '@jobportal/ui/icons';
import { EVENTS, track } from '../../lib/analytics/posthog';
import { MultiCombobox, type ComboboxOption } from '../ui/Combobox';
import { buildQuery, saveAlert, FREQUENCIES, type Frequency } from '../../lib/alerts/query';

interface CatalogueEntry {
  slug: string;
  name: string;
  state?: string;
}

/**
 * Salary bands, in LPA.
 *
 * These are a FLOOR, not a bracket: the saved query supports `salaryMin` only
 * (`AlertQueryDto`), and the search layer has no `salaryMax` parameter at all
 * (`SearchJobsParams`), so "₹5–10 LPA" would be a promise the matcher cannot
 * keep. The labels therefore say "and above" rather than implying a ceiling.
 */
const SALARY_BANDS: ReadonlyArray<{ value: string; label: string; lpa: number | null }> = [
  { value: 'any', label: 'Any salary', lpa: null },
  { value: '3', label: '₹3 LPA and above', lpa: 3 },
  { value: '5', label: '₹5 LPA and above', lpa: 5 },
  { value: '10', label: '₹10 LPA and above', lpa: 10 },
  { value: '15', label: '₹15 LPA and above', lpa: 15 },
  { value: '25', label: '₹25 LPA and above', lpa: 25 },
  { value: '50', label: '₹50 LPA and above', lpa: 50 },
];

export function QuickAlertDialog({
  cityCatalogue,
  disabled,
  disabledReason,
}: {
  cityCatalogue: CatalogueEntry[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [citySlugs, setCitySlugs] = useState<string[]>([]);
  const [band, setBand] = useState('any');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cityOptions = useMemo<ComboboxOption[]>(
    () =>
      cityCatalogue.map((c) => ({
        value: c.slug,
        label: c.name,
        ...(c.state ? { hint: c.state } : {}),
      })),
    [cityCatalogue],
  );

  function reset() {
    setTitle('');
    setCitySlugs([]);
    setBand('any');
    setFrequency('daily');
    setError(null);
  }

  // The alert NAME is required by the API but asking for it would defeat the
  // point of a quick form, so it is derived from what the user did fill in.
  const derivedName = useMemo(() => {
    const role = title.trim();
    const cityNames = citySlugs
      .map((s) => cityCatalogue.find((c) => c.slug === s)?.name)
      .filter((n): n is string => Boolean(n));
    const where = cityNames.length > 0 ? ` in ${cityNames.slice(0, 2).join(' and ')}` : '';
    const base = role !== '' ? `${role}${where}` : where !== '' ? `Jobs${where}` : 'New job alert';
    return base.slice(0, 120);
  }, [title, citySlugs, cityCatalogue]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const lpa = SALARY_BANDS.find((b) => b.value === band)?.lpa ?? null;
    const result = await saveAlert(null, {
      name: derivedName,
      query: buildQuery({
        q: title,
        citySlugs,
        ...(lpa !== null ? { salaryMinLpa: lpa } : {}),
      }),
      frequency,
      isActive: true,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    track(EVENTS.JOB_ALERT_CREATED, { frequency });
    setOpen(false);
    reset();
    router.refresh();
  }

  if (disabled) {
    // At the cap the action is genuinely unavailable — a real disabled button,
    // not an aria-disabled trigger that would still open the dialog.
    return (
      <Button disabled title={disabledReason} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
        New alert
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
        New alert
      </Button>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New job alert</DialogTitle>
            <DialogDescription>
              Four quick filters and we&apos;ll email you when matching jobs go live.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="quick-title">Job title</Label>
              <p className="text-xs text-[var(--color-fg-muted)]">
                The role you want — matched as free text against job titles and descriptions.
              </p>
              <Input
                id="quick-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. frontend engineer"
                autoFocus
              />
            </div>

            <MultiCombobox
              id="quick-cities"
              label="Location"
              hint="Leave empty to match anywhere in India."
              placeholder="Search cities…"
              options={cityOptions}
              selected={citySlugs}
              onChange={setCitySlugs}
              max={10}
              emptyLabel="No city matches that name"
            />

            <div className="space-y-1.5">
              <Label htmlFor="quick-salary">Salary range</Label>
              <select
                id="quick-salary"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                className={cn(
                  'h-9 w-full rounded-md border border-[var(--color-border-strong)]',
                  'bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)]',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2',
                  'focus-visible:ring-offset-[var(--color-bg)]',
                )}
              >
                {SALARY_BANDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-[var(--color-fg)]">Frequency</legend>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCIES.map((f) => {
                  const selected = frequency === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFrequency(f.value)}
                      aria-pressed={selected}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                        selected
                          ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-bg-muted)]',
                      )}
                    >
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          selected
                            ? 'text-[var(--color-primary-700)]'
                            : 'text-[var(--color-fg)]',
                        )}
                      >
                        {f.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                        {f.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
              Saving as <span className="font-medium text-[var(--color-fg)]">{derivedName}</span>.
              Need skills or an experience range?{' '}
              <Link
                href="/alerts/new"
                className="font-medium text-[var(--color-primary-600)] underline underline-offset-2"
              >
                Use the full form
              </Link>
              .
            </p>
          </div>

          <DialogFooter>
            {error && (
              <p role="alert" className="mr-auto text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Create alert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
