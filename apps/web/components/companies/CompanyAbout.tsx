export interface CompanyAboutProps {
  description: string | null;
}

// Card container + section anchor added for the redesigned profile layout;
// the paragraph-splitting logic is unchanged.
export function CompanyAbout({ description }: CompanyAboutProps) {
  const hasBody = Boolean(description && description.trim().length > 0);

  return (
    <section
      id="about"
      aria-label="About"
      className="scroll-mt-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">About</h2>
      {!hasBody ? (
        <p className="mt-3 text-sm text-[var(--color-fg-muted)]">
          This company hasn&rsquo;t added a description yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--color-fg)]">
          {description!
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
            .map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
