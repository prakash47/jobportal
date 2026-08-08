// The block-validation rule moved to @jobportal/domain so the mobile API
// applies the identical definition of a valid culture block (ADR 0002).
// Re-exported here so every existing import of this component is untouched.
export type { HighlightSection } from '@jobportal/domain/company-highlights';
export { parseHighlightSections } from '@jobportal/domain/company-highlights';
import type { HighlightSection } from '@jobportal/domain/company-highlights';

// "What it's like to work here" — the recruiter-authored culture blocks.
// Renders only when at least one valid block exists, so the section is
// entirely absent for companies that haven't filled it in.
export function CompanyHighlights({ sections }: { sections: HighlightSection[] }) {
  if (sections.length === 0) return null;

  return (
    <section
      id="highlights"
      aria-label="Highlights"
      className="scroll-mt-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">What it&rsquo;s like to work here</h2>
      <div className="mt-4 space-y-6">
        {sections.map((s, i) => (
          <div key={i} className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--color-fg)]">{s.heading}</h3>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-[var(--color-fg-muted)]">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
