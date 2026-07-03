'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  EmptyState,
  Input,
} from '@jobportal/ui';
import {
  FAQ_CATEGORIES,
  FAQ_ENTRIES,
  type FaqCategory,
} from '../../lib/support/faq-content';

type Filter = FaqCategory | 'all';

// Searchable FAQ. Filters the static FAQ_ENTRIES client-side by a free-text
// query (over question + answer) and a category pill. Results render as a
// multi-expand Accordion; an empty result routes the recruiter to Contact us.
export function FaqPanel() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Filter>('all');
  const searchId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ENTRIES.filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (!q) return true;
      return `${entry.question} ${entry.answer}`.toLowerCase().includes(q);
    });
  }, [query, category]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Input
            id={searchId}
            type="search"
            placeholder="Search questions…"
            aria-label="Search frequently asked questions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div role="tablist" aria-label="Filter by topic" className="flex flex-wrap gap-1.5">
          {[{ key: 'all' as const, label: 'All' }, ...FAQ_CATEGORIES].map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                category === c.key
                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="text-xs text-[var(--color-fg-muted)]">
        {results.length === 0
          ? 'No matching questions'
          : `${results.length} question${results.length === 1 ? '' : 's'}`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          title="No matching questions"
          description="Try a different search or topic. If you still can’t find an answer, contact us and we’ll help."
          action={
            <Button asChild>
              <Link href="/support/contact">Contact us</Link>
            </Button>
          }
        />
      ) : (
        <Accordion type="multiple" className="border-t border-[var(--color-border)]">
          {results.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {entry.answer.split('\n\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
