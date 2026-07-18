import Image from 'next/image';

export interface PostedByCardProps {
  /** The posting author's display name (User.name). */
  name: string;
  /** Avatar URL (User.image — set only for OAuth logins); null → initials. */
  image: string | null;
  /** Recruiter.designation (nullable) → falls back to a neutral role label. */
  designation: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return (parts[0]?.[0] ?? '·').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// §7 Posted by — identity of the team member who created this posting (SRS
// §4.9). Name lives on User.name, the (optional) photo on User.image, and the
// designation on the linked Recruiter row. Seeded LOCAL recruiters have no
// image, so an initials avatar is the common path (mirrors CompanyLogo's
// unoptimized-image + initials fallback so an external avatar host needs no
// next.config allowlist entry). PR B adds a Collaborate action to this card.
export function PostedByCard({ name, image, designation }: PostedByCardProps) {
  return (
    <section
      aria-labelledby="posted-by-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="posted-by-heading" className="mb-3 text-sm font-semibold text-[var(--color-fg)]">
        Posted by
      </h2>
      <div className="flex items-center gap-3">
        {image ? (
          <Image
            src={image}
            alt=""
            width={44}
            height={44}
            // Avatar is an already-sized external asset (OAuth provider); serve
            // as-is to skip the optimizer's proxy-fetch (CompanyLogo pattern).
            unoptimized
            className="size-11 shrink-0 rounded-full border border-[var(--color-border)] object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-muted)] text-sm font-semibold text-[var(--color-fg)]"
          >
            {initials(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-fg)]">{name}</p>
          <p className="truncate text-xs text-[var(--color-fg-muted)]">
            {designation ?? 'Recruiter'}
          </p>
        </div>
      </div>
    </section>
  );
}
