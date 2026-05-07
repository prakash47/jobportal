// Renders the recruiter's description as plain paragraphs split on blank
// lines. Safer than dangerouslySetInnerHTML — the Phase 2 recruiter portal
// (SRS §4.9.5) will introduce a Tiptap-backed sanitised HTML pipeline; for
// MVP the description is a long string with line breaks.

export interface JobBodyProps {
  description: string;
}

export function JobBody({ description }: JobBodyProps) {
  const paragraphs = description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <section aria-label="Job description" className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">About the role</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-[var(--color-fg)]">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
