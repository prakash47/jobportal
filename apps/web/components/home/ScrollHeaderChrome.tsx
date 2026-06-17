'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@jobportal/ui';

// Thin client island that adds the frosted, sticky-on-scroll chrome to the
// otherwise server-rendered SiteHeader. The logo / nav / CTAs are passed in as
// children and stay in the server tree (SEO + RSC preserved); only the
// scroll-state toggle is client-side. Past ~8px it crystallizes from a flat
// bar into a backdrop-blurred hairline with a navy-tinted shadow.
export function ScrollHeaderChrome({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled(window.scrollY > 8);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled ? 'true' : undefined}
      className={cn(
        'sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]',
        'transition-[background-color,box-shadow,backdrop-filter] duration-[var(--duration-base)] ease-[var(--ease-out)]',
        'data-[scrolled=true]:border-white/50 data-[scrolled=true]:bg-white/70 data-[scrolled=true]:shadow-[var(--shadow-card)] data-[scrolled=true]:backdrop-blur-xl',
      )}
    >
      {children}
    </header>
  );
}
