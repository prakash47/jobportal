// SRS §4.3.7 — completeness as a small calm number, not a Naukri-style
// progress-bar gimmick (CLAUDE.md §2). A thin ring + percentage is enough.

export function CompletenessIndicator({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label={`Profile completeness ${pct}%`}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="2"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--color-primary-600)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-sm font-semibold tabular-nums text-[var(--color-fg)]">{pct}%</span>
        <span className="text-xs text-[var(--color-fg-muted)]">complete</span>
      </div>
    </div>
  );
}
