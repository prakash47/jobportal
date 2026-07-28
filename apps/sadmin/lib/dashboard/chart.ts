// Pure geometry and display helpers for the dashboard's hand-rolled SVG charts.
//
// There is deliberately no chart library in this repo (owner decision, and the
// recruiter dashboard hand-rolls its bars the same way). Keeping the maths here
// — free of JSX, React and the DOM — means the part that is actually easy to
// get wrong is unit-tested, while the components stay dumb enough to verify by
// looking at them.
//
// Nothing here does date arithmetic. The SQL in queries.ts uses generate_series
// to return one row per day, already zero-filled and already bucketed in IST, so
// these functions only ever see a dense array of numbers. That is on purpose:
// timezone-aware day maths in JS is a reliable source of off-by-one bugs.

/** A single plotted day. `label` is a display string, never parsed. */
export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Axis ceiling for a series: the smallest "round" number at or above the peak.
 *
 * Never returns 0 — a zero ceiling would divide by zero in every scale below,
 * and an all-zero series still needs a baseline to draw against.
 */
export function niceMax(values: readonly number[]): number {
  const peak = values.reduce((m, v) => (Number.isFinite(v) && v > m ? v : m), 0);
  if (peak <= 0) return 1;
  // 1,2,5 × 10^n — the standard set of "human" axis steps.
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 5, 10]) {
    const candidate = step * magnitude;
    if (peak <= candidate) return candidate;
  }
  return 10 * magnitude;
}

/** True when a series carries no signal at all, so callers can show an honest
 *  empty state instead of drawing a flat line that reads as real data. */
export function allZero(values: readonly number[]): boolean {
  return values.every((v) => !Number.isFinite(v) || v === 0);
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lay out one bar per value inside a `width` × `height` box.
 *
 * `gap` is the space between bars; it is clamped so a long series (30 days in a
 * narrow card) can never produce a zero or negative bar width.
 */
export function barLayout(
  values: readonly number[],
  width: number,
  height: number,
  gap = 2,
): Bar[] {
  const n = values.length;
  if (n === 0 || width <= 0 || height <= 0) return [];

  const slot = width / n;
  // Leave at least 40% of each slot as bar, however tight the gap setting is.
  const effectiveGap = Math.min(gap, slot * 0.6);
  const barWidth = Math.max(slot - effectiveGap, slot * 0.4);
  const max = niceMax(values);

  return values.map((raw, i) => {
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    // A non-zero value always gets at least 1px so a single application on a
    // 30-day axis is visible rather than rounding away to nothing.
    const h = value === 0 ? 0 : Math.max((value / max) * height, 1);
    return {
      x: i * slot + (slot - barWidth) / 2,
      y: height - h,
      width: barWidth,
      height: h,
    };
  });
}

export interface Point {
  x: number;
  y: number;
}

/** Evenly spaced points for a line series inside a `width` × `height` box. */
export function linePoints(
  values: readonly number[],
  width: number,
  height: number,
  max: number,
): Point[] {
  const n = values.length;
  if (n === 0 || width <= 0 || height <= 0) return [];
  const safeMax = max > 0 ? max : 1;
  // A single point has no span to divide by; pin it to the left edge.
  const step = n === 1 ? 0 : width / (n - 1);
  return values.map((raw, i) => {
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    return {
      x: i * step,
      y: height - (Math.min(value, safeMax) / safeMax) * height,
    };
  });
}

/** `M x,y L x,y …` for a <path>. Empty string for an empty series, which
 *  renders nothing rather than an invalid `d` attribute. */
export function toPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`)
    .join(' ');
}

/** Closes a line back down to the baseline so it can be filled as an area. */
export function toAreaPath(points: readonly Point[], height: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${toPath(points)} L${round(last.x)},${round(height)} L${round(first.x)},${round(height)} Z`;
}

// Two decimals keeps the emitted SVG small without any visible loss at these
// sizes, and keeps the unit tests readable.
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * "2026-07-29" -> "29 Jul".
 *
 * Deliberately string surgery, never `new Date(iso)`. The SQL already bucketed
 * these days in IST; parsing them back into a Date would re-interpret them in
 * the server's timezone (UTC here) and could shift the label by a day — the
 * exact class of bug this whole pipeline is arranged to avoid. Unrecognised
 * input is passed through rather than rendered as "NaN undefined".
 */
export function formatDayLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month}`;
}
