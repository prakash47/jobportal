// Flat brand illustration for the sign-in aside — a stylised recruiter board:
// a job card, a trend panel, and an applicant list with one row shortlisted.
//
// Drawn from the product's own primitives rather than stock artwork or a
// mascot, per CLAUDE.md §2 ("no cute illustrations") and following the
// ArticleCover precedent in apps/web: flat geometry, brand navy/cyan, no
// gradients, no photography.
//
// Colours: cyan comes from the accent token; everything else is alpha-white,
// which is the SAME system the navy sidebar rail already uses (bg-white/10,
// text-white/70). A theme-swapping surface token would be wrong here — this
// panel's background is a FIXED navy that never follows the light/dark swap.
//
// Decorative: aria-hidden with no accessible name. Every fact it depicts is
// stated in real text beside it, so nothing is lost when it isn't rendered.

const CYAN = 'var(--color-accent-500)';

/** One applicant row: y is the row's top edge. */
function ApplicantRow({
  y,
  nameWidth,
  metaWidth,
  shortlisted = false,
}: {
  y: number;
  nameWidth: number;
  metaWidth: number;
  shortlisted?: boolean;
}) {
  return (
    <>
      {shortlisted && <rect x={42} y={y - 6} width={3} height={32} rx={1.5} fill={CYAN} />}
      <circle cx={78} cy={y + 8} r={11} fill="white" fillOpacity={0.18} />
      <rect x={100} y={y + 1} width={nameWidth} height={8} rx={4} fill="white" fillOpacity={0.2} />
      <rect x={100} y={y + 15} width={metaWidth} height={6} rx={3} fill="white" fillOpacity={0.1} />
      <rect
        x={324}
        y={y + 2}
        width={58}
        height={14}
        rx={7}
        fill={shortlisted ? CYAN : 'white'}
        fillOpacity={shortlisted ? 0.9 : 0.08}
      />
    </>
  );
}

export function HiringPipeline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 284"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Job card */}
      <rect
        x={14}
        y={16}
        width={254}
        height={92}
        rx={14}
        fill="white"
        fillOpacity={0.06}
        stroke="white"
        strokeOpacity={0.12}
      />
      <rect x={34} y={36} width={26} height={26} rx={8} fill={CYAN} />
      <rect x={72} y={40} width={134} height={9} rx={4.5} fill="white" fillOpacity={0.22} />
      <rect x={72} y={57} width={88} height={7} rx={3.5} fill="white" fillOpacity={0.11} />
      <rect x={34} y={80} width={60} height={12} rx={6} fill="white" fillOpacity={0.09} />
      <rect x={100} y={80} width={46} height={12} rx={6} fill="white" fillOpacity={0.09} />
      <rect x={154} y={80} width={38} height={12} rx={6} fill="white" fillOpacity={0.09} />

      {/* Trend panel */}
      <rect
        x={284}
        y={16}
        width={122}
        height={92}
        rx={14}
        fill="white"
        fillOpacity={0.06}
        stroke="white"
        strokeOpacity={0.12}
      />
      <rect x={304} y={34} width={52} height={7} rx={3.5} fill="white" fillOpacity={0.16} />
      <rect x={304} y={92} width={84} height={2} rx={1} fill="white" fillOpacity={0.1} />
      <polyline
        points="304,84 326,70 348,76 370,52 388,42"
        fill="none"
        stroke={CYAN}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={388} cy={42} r={4} fill={CYAN} />

      {/* Applicant list */}
      <rect
        x={42}
        y={126}
        width={364}
        height={142}
        rx={14}
        fill="white"
        fillOpacity={0.06}
        stroke="white"
        strokeOpacity={0.12}
      />
      <rect x={64} y={144} width={86} height={8} rx={4} fill="white" fillOpacity={0.16} />
      <ApplicantRow y={170} nameWidth={120} metaWidth={76} shortlisted />
      <ApplicantRow y={204} nameWidth={96} metaWidth={92} />
      <ApplicantRow y={238} nameWidth={110} metaWidth={64} />
    </svg>
  );
}
