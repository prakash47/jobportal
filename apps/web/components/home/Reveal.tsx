'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@jobportal/ui';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset (ms) applied as animation-delay once revealed. */
  delayMs?: number;
}

// The page's single "settle in" motion. Renders children in their FINAL,
// visible state by default; only after the element scrolls into view does it
// flip data-revealed, which runs the `fade-rise` keyframe (globals.css). So
// SSR / no-JS / reduced-motion users always see fully-formed, CLS-free content.
// One IntersectionObserver per instance, disconnected after the first reveal.
export function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [revealed]);

  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      data-revealed={revealed ? 'true' : undefined}
      style={revealed && delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
