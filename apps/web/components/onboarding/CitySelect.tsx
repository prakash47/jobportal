'use client';

import { useState } from 'react';
import { Input } from '@jobportal/ui';
import { MapPin } from '@jobportal/ui/icons';

export interface CityOption {
  id: number;
  name: string;
  state: string;
}

// Current-city combobox: type to filter the city catalogue (shown in a dropdown),
// pick one, or choose "Other" to type a city that isn't listed. The value is a
// plain string (Candidate.currentCityName is free text), so a pick stores
// "City, State" and Other stores whatever the seeker types — no schema coupling.
export function CitySelect({
  cities,
  value,
  onChange,
}: {
  cities: readonly CityOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);

  // "Other" mode — a plain free-text input.
  if (custom) {
    return (
      <div className="space-y-1.5">
        <Input
          id="emp-city"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          placeholder="Enter your city"
          autoComplete="off"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange('');
          }}
          className="text-xs font-medium text-[var(--color-primary-600)] transition-colors hover:text-[var(--color-primary-700)]"
        >
          ← Pick from the list instead
        </button>
      </div>
    );
  }

  const q = value.trim().toLowerCase();
  const matches = cities
    .filter((c) => q === '' || `${c.name}, ${c.state}`.toLowerCase().includes(q))
    .slice(0, 50);

  return (
    <div className="relative">
      <MapPin
        className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
        aria-hidden="true"
      />
      <Input
        id="emp-city"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a dropdown click registers before the blur closes it.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        maxLength={120}
        placeholder="Search your city…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="pl-9"
      />
      {open && (
        <div className="scrollbar-slim absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-float)]">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              // preventDefault keeps focus on the input so the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(`${c.name}, ${c.state}`);
                setOpen(false);
              }}
              className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
            >
              {c.name}
              <span className="text-[var(--color-fg-muted)]">, {c.state}</span>
            </button>
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-1.5 text-sm text-[var(--color-fg-muted)]">No matching city.</p>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCustom(true);
              setOpen(false);
            }}
            className="mt-1 block w-full rounded-md border-t border-[var(--color-border)] px-3 py-2 text-left text-sm font-medium text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-bg-muted)]"
          >
            Other — enter my city manually
          </button>
        </div>
      )}
    </div>
  );
}
