export interface HighlightSection {
  heading: string;
  body: string;
  imageUrl?: string;
}

// Narrows the loosely-typed Company.workingAtSections Json (SRS §4.7.6 — a
// CMS-managed array of { heading, body, imageUrl? } blocks) into a safe,
// rendered shape. Anything malformed is skipped rather than crashing the page.
export function parseHighlightSections(raw: unknown): HighlightSection[] {
  if (!Array.isArray(raw)) return [];
  const out: HighlightSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const heading = typeof rec.heading === 'string' ? rec.heading.trim() : '';
    const body = typeof rec.body === 'string' ? rec.body.trim() : '';
    if (heading.length === 0 || body.length === 0) continue;
    out.push({
      heading,
      body,
      ...(typeof rec.imageUrl === 'string' && rec.imageUrl.length > 0
        ? { imageUrl: rec.imageUrl }
        : {}),
    });
  }
  return out;
}

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
