// Flat brand illustration for the sign-up aside — a job post being composed on
// the left (three fields, then Publish beside Save-as-draft, which is exactly
// what the real Post-a-Job wizard offers) reaching a list of candidates on the
// right.
//
// Same system as HiringPipeline: flat geometry, alpha-white on the fixed navy
// panel, cyan strictly as a mark, no gradients, decorative and aria-hidden.
// See that file's header for why the whites are literal rather than tokens.

const CYAN = 'var(--color-accent-500)';

/** One form field: a soft plate with a label bar inside it. */
function Field({ y, barWidth }: { y: number; barWidth: number }) {
  return (
    <>
      <rect x={36} y={y} width={178} height={28} rx={8} fill="white" fillOpacity={0.06} />
      <rect x={48} y={y + 10} width={barWidth} height={8} rx={4} fill="white" fillOpacity={0.16} />
    </>
  );
}

/** One reached candidate: avatar + name bar. The first is ringed in cyan. */
function CandidateRow({ y, barWidth, ringed = false }: { y: number; barWidth: number; ringed?: boolean }) {
  return (
    <>
      <circle cx={298} cy={y + 12} r={11} fill="white" fillOpacity={0.18} />
      {ringed && <circle cx={298} cy={y + 12} r={11} fill="none" stroke={CYAN} strokeWidth={2} />}
      <rect x={320} y={y + 6} width={barWidth} height={8} rx={4} fill="white" fillOpacity={0.14} />
    </>
  );
}

export function PostJob({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 262"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Compose card */}
      <rect
        x={14}
        y={16}
        width={236}
        height={200}
        rx={14}
        fill="white"
        fillOpacity={0.06}
        stroke="white"
        strokeOpacity={0.12}
      />
      <rect x={36} y={42} width={120} height={9} rx={4.5} fill="white" fillOpacity={0.22} />
      <Field y={68} barWidth={96} />
      <Field y={106} barWidth={120} />
      <Field y={144} barWidth={72} />
      <rect x={36} y={182} width={96} height={24} rx={8} fill={CYAN} />
      <rect x={140} y={182} width={64} height={24} rx={8} fill="white" fillOpacity={0.08} />

      {/* Reach: the post travelling out to candidates */}
      <path
        d="M 136 194 C 190 200 226 196 254 174"
        fill="none"
        stroke={CYAN}
        strokeOpacity={0.55}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <circle cx={256} cy={172} r={3.5} fill={CYAN} />

      {/* Candidate list */}
      <rect
        x={262}
        y={96}
        width={144}
        height={150}
        rx={14}
        fill="white"
        fillOpacity={0.06}
        stroke="white"
        strokeOpacity={0.12}
      />
      <rect x={284} y={118} width={64} height={7} rx={3.5} fill="white" fillOpacity={0.16} />
      <CandidateRow y={140} barWidth={64} ringed />
      <CandidateRow y={176} barWidth={50} />
      <CandidateRow y={212} barWidth={58} />
    </svg>
  );
}
