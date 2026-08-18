'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The IST date-range filter for the Transaction & Revenue Log.
 *
 * Two native `<input type="date">` controls. Deliberately not a date-picker
 * component: there is none in packages/ui, and adding react-day-picker (or
 * similar) would be a new top-level dependency needing owner review per
 * CLAUDE.md §10. The native control is keyboard-accessible, localised by the
 * browser, and free.
 *
 * A client island rather than a plain GET `<form>`, for the reason
 * AdminSearchBar records: this app sets basePath '/sadmin', which next/link and
 * the router apply themselves but which is NOT applied to a raw HTML form
 * `action` — a form would submit to the origin root and 404.
 *
 * ⚠ The dates are INDIAN calendar days. The server converts them with an
 * explicit +05:30 shift and an exclusive upper bound; see
 * packages/domain/src/txn-log-params.ts. Nothing here does date arithmetic —
 * the raw `YYYY-MM-DD` string is what travels.
 */
export function DateRangeFilter({ from, to }: { from?: string | undefined; to?: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // HTML ids must be unique on a page (COLLABORATION.md §4.3). useId makes a
  // collision impossible even if this filter is ever rendered twice.
  const fromId = useId();
  const toId = useId();

  // ⚠ LOCAL MIRRORS, not `value={from}` straight off the server prop.
  //
  // React treats `<input type="date">` as a text input, so after every change
  // event it runs its controlled-input state restoration: it re-applies
  // `props.value` to the DOM node. `router.replace` is deferred as a transition,
  // so at that moment the prop is still the OLD value — and the date the admin
  // just picked is wiped out of the field until the server round-trip lands.
  // This page issues six Prisma queries per render, so that blank window is
  // long enough to look broken and long enough to re-type into.
  //
  // Mirroring locally and re-syncing only on a GENUINE external change (Back /
  // Forward, or Clear dates) is the same fix AdminSearchBar documents for its
  // own caret-jump problem, tracked the same way — against the last value THIS
  // component committed, so the URL catching up to the user's own input does
  // not count as external.
  const [fromValue, setFromValue] = useState(from ?? '');
  const [toValue, setToValue] = useState(to ?? '');
  const lastCommittedFrom = useRef(from ?? '');
  const lastCommittedTo = useRef(to ?? '');

  useEffect(() => {
    const next = from ?? '';
    if (next !== lastCommittedFrom.current) {
      lastCommittedFrom.current = next;
      setFromValue(next);
    }
  }, [from]);

  useEffect(() => {
    const next = to ?? '';
    if (next !== lastCommittedTo.current) {
      lastCommittedTo.current = next;
      setToValue(next);
    }
  }, [to]);

  function onChange(key: 'from' | 'to', value: string) {
    if (key === 'from') {
      setFromValue(value);
      lastCommittedFrom.current = value;
    } else {
      setToValue(value);
      lastCommittedTo.current = value;
    }
    commit(key, value);
  }

  function commit(key: 'from' | 'to', value: string) {
    // Read the LIVE params at fire time rather than a render-time snapshot, so
    // this merges with — rather than clobbers — a `?q` the debounced search bar
    // committed a moment ago.
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Any filter change returns to page 1: narrowing the range while on page 3
    // would otherwise land the admin on an out-of-range page of the new set.
    // `status` is deliberately preserved — changing the dates must not move the
    // admin off the tab they are looking at.
    params.delete('page');
    const qs = params.toString();
    // replace, not push: a date change is a refinement, and pushing would make
    // Back walk through every intermediate range.
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clear() {
    setFromValue('');
    setToValue('');
    lastCommittedFrom.current = '';
    lastCommittedTo.current = '';
    const params = new URLSearchParams(searchParams.toString());
    params.delete('from');
    params.delete('to');
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Keyed off the LOCAL values, so the escape hatch appears the moment a date is
  // picked rather than a round-trip later — and, more importantly, stays
  // available when the page has DROPPED a backwards range: `from`/`to` arrive as
  // undefined in that case, so keying off the props would hide "Clear dates"
  // exactly when the params in the URL are the ones needing clearing.
  const hasRange = Boolean(fromValue || toValue);
  // Whether the two ends currently make sense together. Lexicographic compare is
  // exact for zero-padded YYYY-MM-DD.
  const coherent = !fromValue || !toValue || fromValue <= toValue;

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="space-y-1">
        <label htmlFor={fromId} className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Attempted on or after
        </label>
        <input
          id={fromId}
          type="date"
          value={fromValue}
          // Cross-constraints only while the range is coherent. Applying them to
          // an already-backwards range would make the picker refuse the very
          // edit that fixes it.
          max={coherent ? toValue || undefined : undefined}
          onChange={(event) => onChange('from', event.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor={toId} className="block text-xs font-medium text-[var(--color-fg-muted)]">
          Attempted on or before
        </label>
        <input
          id={toId}
          type="date"
          value={toValue}
          min={coherent ? fromValue || undefined : undefined}
          onChange={(event) => onChange('to', event.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      {hasRange && (
        <button
          type="button"
          onClick={clear}
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Clear dates
        </button>
      )}

      {/* Dates are the one filter whose meaning is not self-evident from the
          control: an admin in another timezone, or reading a Razorpay dashboard
          that renders UTC, would otherwise have no way to know which midnight
          this means. */}
      <p className="basis-full text-xs text-[var(--color-fg-muted)]">
        Dates are Indian calendar days (IST) and filter on the date the payment
        was <em>attempted</em>, not captured.
      </p>
    </div>
  );
}
