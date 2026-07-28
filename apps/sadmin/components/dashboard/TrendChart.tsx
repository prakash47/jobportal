import {
  allZero,
  barLayout,
  linePoints,
  niceMax,
  toAreaPath,
  toPath,
  type ChartPoint,
} from '../../lib/dashboard/chart';

export interface Series {
  /** Names the series in the legend, the tooltip and the sr-only table. */
  name: string;
  points: ChartPoint[];
  /** Any CSS colour — pass a theme token, never a hardcoded hex. */
  color: string;
}

export interface TrendChartProps {
  series: Series[];
  /** Rendered as the chart's accessible name. */
  title: string;
  variant?: 'line' | 'bar';
  /** Shown in place of the chart when every series is flat zero. */
  emptyMessage?: string;
  height?: number;
}

// Hand-rolled SVG. There is deliberately no chart library in this repo, and the
// geometry lives in lib/dashboard/chart.ts where it is unit-tested — this file
// is only markup.
//
// Accessibility: an SVG chart is an opaque image to a screen reader, so this
// renders BOTH a decorative <svg aria-hidden> and a visually-hidden <table>
// carrying the same numbers. That is the standard accessible-chart pattern and
// it is why the svg itself needs no role/title juggling: assistive tech reads
// the table, which is genuinely better than any aria-label summary.
//
// The viewBox is a fixed coordinate space with preserveAspectRatio="none", so
// the chart fills whatever width its container has without any client-side
// measurement — no ResizeObserver, no 'use client', still a server component.
const VIEW_W = 600;
/** Half the line stroke width — see the viewBox note below. */
const STROKE_PAD = 1;

export function TrendChart({
  series,
  title,
  variant = 'line',
  emptyMessage = 'No activity in this period.',
  height = 120,
}: TrendChartProps) {
  // Row labels come from the LONGEST series rather than series[0], so a short
  // or empty series cannot truncate the table and hide another series' data.
  // Callers are expected to pass series over a common day domain — getActivityTrends
  // guarantees that by anchoring both of its queries to one instant — and the
  // per-cell `?? 0` below keeps a mismatch from throwing if that ever changes.
  const labels =
    series.reduce<ChartPoint[]>(
      (longest, s) => (s.points.length > longest.length ? s.points : longest),
      [],
    ).map((p) => p.label) ?? [];

  // Every series flat zero: say so plainly rather than drawing a line along the
  // baseline, which reads as real data showing "consistently zero" when the
  // honest statement is that nothing happened.
  const empty = series.every((s) => allZero(s.points.map((p) => p.value)));

  // One shared scale across series so the two lines are visually comparable —
  // per-series scales would make 3 jobs look the same height as 300 applications.
  const max = niceMax(series.flatMap((s) => s.points.map((p) => p.value)));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>

      {empty ? (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] px-4 text-center text-sm text-[var(--color-fg-muted)]"
          style={{ height }}
        >
          {emptyMessage}
        </div>
      ) : (
        <svg
          // Vertical inset of STROKE_PAD on each side. linePoints maps a zero
          // value to exactly y=height and a peak to exactly y=0, so a 2px stroke
          // centred on the path hangs 1px outside the box at either extreme —
          // and an <svg> clips at its viewport by default, shaving the line in
          // half exactly where it matters most. Widening the viewBox rather than
          // insetting the geometry keeps chart.ts purely about data-to-pixels.
          // Bars are unaffected (filled, unstroked) but share it so both
          // variants stay dimensionally identical.
          viewBox={`0 ${-STROKE_PAD} ${VIEW_W} ${height + STROKE_PAD * 2}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          aria-hidden="true"
          focusable="false"
        >
          {variant === 'bar'
            ? series.map((s) => (
                <g key={s.name}>
                  {barLayout(
                    s.points.map((p) => p.value),
                    VIEW_W,
                    height,
                  ).map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={b.y}
                      width={b.width}
                      height={b.height}
                      fill={s.color}
                      rx={1}
                    />
                  ))}
                </g>
              ))
            : series.map((s) => {
                const pts = linePoints(
                  s.points.map((p) => p.value),
                  VIEW_W,
                  height,
                  max,
                );
                return (
                  <g key={s.name}>
                    <path d={toAreaPath(pts, height)} fill={s.color} opacity={0.12} />
                    <path
                      d={toPath(pts)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      // preserveAspectRatio="none" stretches the coordinate
                      // space horizontally, which would otherwise scale the
                      // stroke with it and render a fat, uneven line.
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
        </svg>
      )}

      {/* Axis ends. The full per-day values live in the sr-only table below;
          labelling all 30 ticks would be unreadable at this width. */}
      {!empty && labels.length > 0 && (
        <div className="mt-1.5 flex justify-between text-xs text-[var(--color-fg-muted)]">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}

      {/* The real accessible content. Kept even for an empty chart so the
          numbers are always reachable. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {series.map((s) => (
                <td key={s.name}>{s.points[i]?.value ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Colour swatch + label, for charts with more than one series. */
export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
