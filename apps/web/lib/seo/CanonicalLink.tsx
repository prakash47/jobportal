import { buildCanonical } from './canonical';

export interface CanonicalLinkProps {
  path: string;
  search?: string | URLSearchParams;
}

// SRS §6.3 rule 5 — every page sets a self-referencing canonical.
export function CanonicalLink({ path, search }: CanonicalLinkProps) {
  const href = buildCanonical(path, search);
  return <link rel="canonical" href={href} />;
}
