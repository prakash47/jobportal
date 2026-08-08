export interface HighlightSection {
  heading: string;
  body: string;
  imageUrl?: string;
}

// Narrows the loosely-typed Company.workingAtSections Json (SRS §4.7.6 — a
// CMS-managed array of { heading, body, imageUrl? } blocks) into a safe,
// rendered shape. Anything malformed is skipped rather than crashing the page.
//
// Shared rather than duplicated: this decides what counts as a VALID culture
// block, and the website and the mobile API must not disagree about it — a
// block one surface renders and the other drops would look like missing data
// to whoever noticed. It lives here for the same reason the slug and
// visibility rules do (ADR 0002).
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
      // Conditional spread, not `imageUrl: undefined` — the repo runs
      // exactOptionalPropertyTypes, which rejects an explicit undefined for an
      // optional property.
      ...(typeof rec.imageUrl === 'string' && rec.imageUrl.length > 0
        ? { imageUrl: rec.imageUrl }
        : {}),
    });
  }
  return out;
}
