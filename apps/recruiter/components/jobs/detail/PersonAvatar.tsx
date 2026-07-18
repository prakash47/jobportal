import Image from 'next/image';

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return (parts[0]?.[0] ?? '·').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * A person's avatar: their photo (User.image) or an initials fallback. Mirrors
 * CompanyLogo's unoptimized-image approach so an external avatar host needs no
 * next.config allowlist entry. Presentational + hook-free, so it can be imported
 * by both server (PostedByCard) and client (CollaborateDialog) components.
 */
export function PersonAvatar({
  name,
  image,
  size,
  title,
}: {
  name: string;
  image: string | null;
  size: number;
  title?: string;
}) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        unoptimized
        title={title}
        className="shrink-0 rounded-full border border-[var(--color-border)] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      title={title}
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-muted)] text-xs font-semibold text-[var(--color-fg)]"
    >
      {personInitials(name)}
    </span>
  );
}
