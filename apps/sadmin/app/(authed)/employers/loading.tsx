// Route-level streaming boundary: the shell (navy rail + top bar) paints
// immediately while the company page and its recruiter teams resolve.
//
// The bars are NOT the shared @jobportal/ui <Skeleton>. That component fills
// with --color-bg-muted, which is exactly this shell's canvas colour, so any
// skeleton sitting directly on the canvas is invisible. --color-border reads
// against both the canvas and the white cards.
//
// data-wide matches the real page so the content column does not change width
// when the data lands.
const BAR = 'animate-pulse rounded bg-[var(--color-border)]';

export default function EmployersLoading() {
  return (
    <div data-wide className="space-y-6">
      <div>
        {/* Heights match the real header exactly: h-8 = the h1's 32px line box,
            then the two lines the subtitle occupies at this column width. */}
        <div className={`${BAR} h-8 w-72`} />
        <div className={`${BAR} mt-1.5 h-4 w-full max-w-2xl`} />
        <div className={`${BAR} mt-1.5 h-4 w-80`} />
      </div>

      {/* The "N employers" count line. */}
      <div className={`${BAR} h-5 w-28`} />

      <div
        role="status"
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
      >
        {/* Real text, not just an aria-label: a live region is announced from its
            CONTENT, so a role="status" whose only descendants are empty divs
            announces nothing at all — silence indistinguishable from a dead
            click. The dashboard skeleton carries the same line for the same
            reason. */}
        <span className="sr-only">Loading employers…</span>
        {/* One header row plus six body rows, at the real table's 44px rhythm. */}
        <div className={`${BAR} h-4 w-full`} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${BAR} mt-4 h-8 w-full`} />
        ))}
      </div>
    </div>
  );
}
