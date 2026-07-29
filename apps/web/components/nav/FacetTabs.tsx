'use client';

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@jobportal/ui';

// "The Console" mega-panel shell: a master facet rail + a detail pane, stitched
// by ONE cyan indicator that glides to the active facet while the pane swaps —
// the "one thing moving" discipline, instead of N hover states blinking. The
// detail holds a fixed min-height so switching facets never resizes the
// floating popover (the #1 tell of a cheap mega-menu).
//
// This is the only client code in the panel. The rail icons, every detail pane
// and the footer arrive as SERVER-rendered ReactNode props (slot pattern one
// level deeper), so the presentational subtree — rows, CompanyLogo, the url
// builders — never enters the client bundle and stays crawlable in the HTML.
//
// Interaction is the canonical ARIA tablist: hover === focus === select
// (Stripe/Shopify behaviour), roving tabindex, Arrow/Home/End keys. Inactive
// panels use the `hidden` attribute, which natively drops them from the tab
// order and the a11y tree while leaving them in the DOM. Open/close of the
// popover itself stays owned by PrimaryNav.

export interface FacetTab {
  /** stable slug used for the tab/panel id pair */
  id: string;
  label: string;
  /** server-rendered icon element */
  icon: ReactNode;
  /** per-facet detail heading + one-line subtitle */
  title: string;
  subtitle: string;
  /** server-rendered detail body */
  panel: ReactNode;
}

// Rail row pitch expressed in the SAME unit as the rows themselves — h-9
// (2.25rem) + gap-0.5 (0.125rem). A px constant would silently drift onto the
// wrong row for anyone whose browser font size is not 16px.
const ROW_PITCH_REM = 2.375;

export function FacetTabs({
  eyebrow,
  tabs,
  footer,
  widthClass,
}: {
  eyebrow: string;
  tabs: readonly FacetTab[];
  footer: ReactNode;
  widthClass: string;
}) {
  const [active, setActive] = useState(0);
  const uid = useId();
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const paneWrapRef = useRef<HTMLDivElement>(null);

  // The tab set is data-derived (a facet is dropped below 2 items), so it can
  // shrink under a mounted island. Clamp at read time or the rail would fall
  // out of the tab order entirely and the pane would render empty.
  const activeIndex = tabs.length === 0 ? 0 : Math.min(active, tabs.length - 1);

  const moveTo = useCallback(
    (i: number) => {
      const n = tabs.length;
      if (n === 0) return;
      const next = ((i % n) + n) % n;
      setActive(next);
      btnRefs.current[next]?.focus();
    },
    [tabs.length],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          moveTo(activeIndex + 1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          moveTo(activeIndex - 1);
          break;
        case 'Home':
          e.preventDefault();
          moveTo(0);
          break;
        case 'End':
          e.preventDefault();
          moveTo(tabs.length - 1);
          break;
        default:
          break;
      }
    },
    [activeIndex, moveTo, tabs.length],
  );

  return (
    <div className={cn('flex flex-col', widthClass)}>
      <div className="grid grid-cols-[13.5rem_1fr]">
        {/* master rail */}
        <div className="border-r border-[var(--color-border)] p-2">
          <p
            id={`${uid}-rail-label`}
            className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]"
          >
            {eyebrow}
          </p>
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby={`${uid}-rail-label`}
            onKeyDown={onKeyDown}
            className="relative flex flex-col gap-0.5"
          >
            <span
              aria-hidden="true"
              style={{ transform: `translateY(calc(${activeIndex} * ${ROW_PITCH_REM}rem))` }}
              className="absolute left-0 top-2 h-5 w-[3px] rounded-full bg-[var(--color-accent-500)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)]"
            />
            {tabs.map((t, i) => {
              const selected = activeIndex === i;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    btnRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls={`${uid}-panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  // Never let a CLICK move DOM focus into the panel: PrimaryNav
                  // keeps the popover open while focus sits inside the group (so
                  // a keyboard user isn't dropped mid-browse), which would leave
                  // a clicked-open panel pinned to the sticky header after the
                  // pointer leaves. Keyboard selection still focuses explicitly
                  // via moveTo().
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerEnter={() => {
                    // A stray pointer must not pull the pane out from under a
                    // keyboard user: hiding the focused link resets focus to
                    // <body>, which closes the whole popover.
                    if (paneWrapRef.current?.contains(document.activeElement)) return;
                    setActive(i);
                  }}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-left text-[13.5px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
                    selected
                      ? 'bg-[var(--color-primary-50)] font-semibold text-[var(--color-primary-700)]'
                      : 'font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* detail pane — fixed min-height so the popover never resizes on swap */}
        <div ref={paneWrapRef} className="min-h-[15rem] p-5">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`${uid}-panel-${t.id}`}
              aria-labelledby={`${uid}-tab-${t.id}`}
              hidden={activeIndex !== i}
              className="pane-swap"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold text-[var(--color-fg)]">{t.title}</p>
                <p className="text-xs text-[var(--color-fg-muted)]">{t.subtitle}</p>
              </div>
              {t.panel}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-5 py-3">{footer}</div>
    </div>
  );
}
