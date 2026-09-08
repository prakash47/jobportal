'use client';

import { useId } from 'react';
import { cn } from '../../lib/cn';

// The Career Queue mark as a live loader — "The Advance" (owner-approved from
// the judge-panel pitch, 2026-07-30).
//
// GEOMETRY IS TRACED, NOT DRAWN. Every number below comes from row/column
// pixel scans of the shipped brand file (apps/*/public/brand/cq-mark-color.png,
// 400×178): the C is a stroked circle arc — center (134,76), r 61.5, width 33 —
// whose butt cap at 42° reproduces the brand's diagonal terminal cut; the Q is
// the same ring at (284,76.5) plus its tail wedge; the arrow is the exact
// docked polygon, and it paints OVER the C's lower arc precisely as the PNG
// composites it. Do not "tidy" these values against a circle-perfect ideal —
// they are the brand file.
//
// THE MOTION (all in theme.css, transform/opacity only): the arrow starts
// hidden behind a static clip whose edge continues the tail's slant seam, so
// it emerges FROM the C — the brand's own construction (the C's stroke becomes
// the arrow) — glides to its dock on the Q, and for 450ms the composition is
// exactly the static lockup. Then the docked arrow is absorbed (opacity), a
// beat of rest, and the next candidate launches. 1.8s cycle, constant tempo:
// a queue that advances at a steady rate is the trust signal, so the loop
// NEVER speeds up, and long waits get one quiet caption instead of drama.
//
// Reduced motion: theme.css force-kills animation durations globally, which
// collapses the loop to its resting state — and the resting state here is
// deliberately the FINISHED lockup (the arrow's un-transformed coordinates are
// its docked position). A media query swaps the 3s "Still loading" caption for
// an immediate "Loading", so activity is signalled by text, not motion.

const NAVY = 'var(--color-primary-600)';
const CYAN = 'var(--color-accent-500)';

// C arc endpoints for center (134,76) r 61.5, from 42° sweeping CCW to -105°
// (the lower terminal the arrow paints over). Precomputed so the markup is
// static: polar(42°) = (179.70, 34.85), polar(-105°) = (118.08, 135.40).
const C_ARC_D = 'M 179.7 34.9 A 61.5 61.5 0 1 0 118.1 135.4';
const ARROW_D = 'M 149 123 L 187 123 L 187 107 L 227 140 L 187 171 L 187 153 L 117 153 Z';
const QTAIL_D = 'M 315 85 L 360 151 L 339 165 L 295 99 Z';
// Clip edge: PARALLEL to the tail's slant (149,123)–(117,153) — same
// dx/dy = −32/30 — but pushed ~2 units outward along its normal (x −3 at both
// ends: 177.8→174.8, 71.1→68.1).
//
// It used to run exactly THROUGH those two vertices, so the arrow's tail edge
// lay precisely ON the clip boundary. That is mathematically a no-op and
// visually is not: a rasteriser anti-aliases both the shape edge and the clip
// edge against each other, eating a sliver along the whole seam and biting a
// visible notch out of the acute tail tip — reported as the arrow inside the C
// being "cutted", and reproduced by overlaying the unclipped outline.
//
// Offsetting the seam leaves the docked arrow strictly INSIDE the clip region,
// so nothing is coincident and the tail paints whole. The travel state is
// unaffected: at translateX(-104) the arrow's rightmost point is x=123 and the
// seam at that height is x=127.9, so it is still entirely hidden inside the C.
const CLIP_D = 'M 174.8 96 L 68.1 196 L 420 196 L 420 96 Z';

export interface BrandLoaderMarkProps {
  /** Extra classes on the <svg> (size it from the outside; defaults to w-full). */
  className?: string;
  /** Freeze the arrow at its dock (renders the exact static lockup). */
  still?: boolean;
}

/**
 * The animated CQ mark on its own — the veil chrome lives in NavigationProgress.
 * Also usable anywhere a branded "working" mark is needed (same loop).
 */
export function BrandLoaderMark({ className, still = false }: BrandLoaderMarkProps) {
  // Clip ids are document-global in SVG; useId keeps parallel instances safe.
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 400 178"
      aria-hidden="true"
      // overflow-visible: the ring model (r 61.5 + half the 33 stroke) crowns
      // 2 units above y=0. Clipped, that paints a flat cut WIDER than the
      // brand's own tangency; visible, it is a 2-unit round crown nobody can
      // see at loader scale. The veil has the headroom.
      className={cn('block w-full overflow-visible', className)}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={CLIP_D} />
        </clipPath>
      </defs>
      <path d={C_ARC_D} fill="none" stroke={NAVY} strokeWidth="33" strokeLinecap="butt" />
      <circle cx="284" cy="76.5" r="61.5" fill="none" stroke={NAVY} strokeWidth="33" />
      <path d={QTAIL_D} fill={NAVY} />
      <g clipPath={`url(#${clipId})`}>
        <path d={ARROW_D} fill={CYAN} className={still ? undefined : 'cq-loader-arrow'} />
      </g>
    </svg>
  );
}
