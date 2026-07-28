// Route-level streaming boundary: the shell (navy rail + top bar) paints
// immediately while the dashboard's three counts resolve.
//
// The bars are NOT the shared @jobportal/ui <Skeleton>. That component fills
// with --color-bg-muted, which is exactly this shell's canvas colour, so any
// skeleton sitting directly on the canvas is invisible — the bug the recruiter
// re-skin hit on its own loading.tsx. --color-border reads against both the
// canvas and the white cards.
const BAR = 'animate-pulse rounded bg-[var(--color-border)]';

export default function DashboardLoading() {
  return (
    <>
      <div>
        {/* Header placeholders sit on the CANVAS, so they use the border fill. */}
        <div className={`${BAR} h-8 w-40`} />
        <div className={`${BAR} mt-2 h-4 w-64`} />
      </div>

      <div
        role="status"
        aria-label="Loading dashboard metrics"
        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
          >
            {/* Inside a white card these could use bg-muted, but keeping one
                fill for every bar means moving a card can never hide one. */}
            <div className={`${BAR} h-4 w-24`} />
            <div className={`${BAR} mt-3 h-7 w-16`} />
            <div className={`${BAR} mt-2 h-3 w-32`} />
          </div>
        ))}
      </div>
    </>
  );
}
