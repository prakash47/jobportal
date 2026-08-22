// Route-level streaming boundary: the shell (navy rail + top bar) paints
// immediately while the dashboard's three counts resolve.
//
// The bars are NOT the shared @jobportal/ui <Skeleton>. That component fills
// with --color-bg-muted, which is exactly this shell's canvas colour, so any
// skeleton sitting directly on the canvas is invisible — the bug the recruiter
// re-skin hit on its own loading.tsx. --color-border reads against both the
// canvas and the white cards.
//
// data-wide matches the real page so the content column does not change width
// when the data lands.
const BAR = 'animate-pulse rounded bg-[var(--color-border)]';

export default function DashboardLoading() {
  return (
    <div data-wide className="space-y-6">
      <div>
        {/* Header placeholders sit on the CANVAS, so they use the border fill.
            Heights match the real header exactly: h-8 = the h1's 32px line box,
            mt-1 + h-5 = the 24px the subtitle occupies. */}
        <div className={`${BAR} h-8 w-40`} />
        <div className={`${BAR} mt-1 h-5 w-64`} />
      </div>

      {/* ⚠ ONE card, not three. This file cannot await a session, so it cannot
          know how many KPI cards the real page will render — and since PR B
          scoped those cards per module, a Support or Finance Admin gets two and
          a staffer with neither `users` nor `moderation` gets none. Three
          placeholders collapsing to one is a visible reflow on every load for
          everyone below super admin; one placeholder only ever grows into more,
          which reads as content arriving rather than content disappearing.
          Keeping the sm:grid-cols-2 / lg:grid-cols-3 wrapper means the single
          card lands in the same column the first real card will occupy. */}
      <div
        role="status"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* Real text, not just an aria-label: a live region is announced from
            its CONTENT, so a role="status" whose only descendants are empty
            divs announces nothing at all — silence indistinguishable from a
            dead click. The recruiter's DashboardSkeleton carries the same
            sr-only line for the same reason. */}
        <span className="sr-only">Loading platform metrics…</span>
        {[0].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
          >
            {/* Bar heights mirror KpiCard's real line boxes so the row does not
                shift when the numbers arrive: label 20px, value 32px, hint 16px,
                with KpiCard's own mt-2 / mt-1 spacing. */}
            <div className={`${BAR} h-5 w-24`} />
            <div className={`${BAR} mt-2 h-8 w-16`} />
            <div className={`${BAR} mt-1 h-4 w-32`} />
          </div>
        ))}
      </div>

      {/* Pending approvals — awaited with the KPIs in wave 1, so it belongs in
          this route-level skeleton. The trend cards below it are NOT here: they
          stream behind their own <Suspense> in page.tsx and have their own
          fallback, so duplicating them would flash two different placeholders. */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
        <div className={`${BAR} h-5 w-36`} />
        <div className={`${BAR} mt-2 h-4 w-48`} />
        <div className={`${BAR} mt-5 h-6 w-full`} />
        <div className={`${BAR} mt-3 h-6 w-full`} />
      </div>
    </div>
  );
}
