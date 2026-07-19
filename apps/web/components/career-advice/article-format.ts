// Small presentation helpers shared across the career-advice components.

export const formatArticleDate = (d: Date): string =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// A tag slug ("early-career") → a display label ("Early career"). Sentence-case
// (first word capitalised) reads calmer than Title Case for topic chips.
export function tagLabel(slug: string): string {
  const spaced = slug.replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Author → up-to-2-letter monogram for the avatar fallback (no author photos in
// the data model — authorName is a plain string).
export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return (parts[0]?.[0] ?? '·').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
