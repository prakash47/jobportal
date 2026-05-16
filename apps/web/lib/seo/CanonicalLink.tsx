import { buildCanonical } from './canonical';

export interface CanonicalLinkProps {
  path: string;
  // `| undefined` explicit so callers can spread parsed search params
  // directly. Without it, exactOptionalPropertyTypes rejects the call.
  search?: string | URLSearchParams | undefined;
}

// SRS §6.3 rule 5 — every page sets a self-referencing canonical.
export function CanonicalLink({ path, search }: CanonicalLinkProps) {
  const href = buildCanonical(path, search);
  return <link rel="canonical" href={href} />;
}
