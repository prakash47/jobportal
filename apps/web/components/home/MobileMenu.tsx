'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Menu, X, ArrowRight } from '@jobportal/ui/icons';

interface NavLink {
  label: string;
  href: string;
}

// Mobile navigation (< md): a hamburger that opens a full-width drawer. The
// drawer + backdrop are PORTALED to <body> — if they render inside the sticky
// header (its own z-50 stacking context), the backdrop paints over the header
// and dims it. At the body level the header (z-50) stays clean above the
// backdrop (z-40), and the drawer sits flush under it (top-14). Closes on link
// tap / backdrop / Escape; locks body scroll while open.
export function MobileMenu({
  links,
  recruiterUrl,
}: {
  links: readonly NavLink[];
  recruiterUrl: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      {open &&
        createPortal(
          <>
            <div
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            />
            <div className="rise fixed inset-x-0 top-14 z-40 max-h-[calc(100svh-3.5rem)] overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 pb-5 pt-2 shadow-[var(--shadow-lift)]">
              <nav className="flex flex-col" aria-label="Mobile">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-base font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-border-strong)] text-sm font-semibold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
                >
                  Sign in
                </Link>
                <a
                  href={recruiterUrl}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[image:var(--gradient-brand)] text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--glow-cyan)]"
                >
                  Hire on Career Queue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
