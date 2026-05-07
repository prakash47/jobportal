export interface CompanyAboutProps {
  description: string | null;
}

export function CompanyAbout({ description }: CompanyAboutProps) {
  if (!description || description.trim().length === 0) {
    return (
      <section aria-label="About">
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">About</h2>
        <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
          This company hasn&rsquo;t added a description yet.
        </p>
      </section>
    );
  }

  const paragraphs = description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <section aria-label="About" className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">About</h2>
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
