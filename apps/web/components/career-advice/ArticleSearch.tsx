'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from '@jobportal/ui/icons';

// Editorial search — a single input that filters the article index by title +
// excerpt via `?q=`. Preserves an active `?tag=` filter and resets pagination on
// submit. Real: the server does the filtering; this only drives the URL.
export function ArticleSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  function navigate(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `/career-advice?${qs}` : '/career-advice');
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(value);
  }

  function onClear() {
    setValue('');
    navigate('');
  }

  return (
    <form role="search" onSubmit={onSubmit} className="w-full max-w-xl">
      <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3.5 py-2.5 shadow-[var(--shadow-card)] transition-colors focus-within:border-[var(--color-primary-400)]">
        <Search className="size-5 shrink-0 text-[var(--color-fg-subtle)]" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search articles, topics, keywords"
          aria-label="Search career-advice articles"
          className="h-6 w-full bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="shrink-0 rounded-md p-0.5 text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}
