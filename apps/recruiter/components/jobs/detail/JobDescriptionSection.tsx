import { FileText } from '@jobportal/ui/icons';

export interface JobDescriptionSectionProps {
  description: string;
}

// §2 Job description — the full freeform JD (Roles & Responsibilities, required
// skills prose, qualifications narrative, and any additional requirements the
// recruiter typed). Rendered from the always-present plain-text `description`
// column: split into paragraphs on blank lines, single newlines preserved
// (whitespace-pre-line) so bullet-style lines stay legible. Plain text rendered
// as React text nodes — no HTML injection surface, no markdown dependency
// (the rich descriptionMarkdown pipeline is apps/web-only; a shared-package
// promotion is a deliberate follow-up).
export function JobDescriptionSection({ description }: JobDescriptionSectionProps) {
  const paragraphs = description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <section
      aria-labelledby="job-description-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <h2
        id="job-description-heading"
        className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]"
      >
        <FileText className="size-4 text-[var(--color-fg-muted)]" aria-hidden="true" />
        Job description
      </h2>
      {paragraphs.length > 0 ? (
        <div className="space-y-3 text-sm leading-relaxed text-[var(--color-fg)]">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-fg-muted)]">No description provided.</p>
      )}
    </section>
  );
}
