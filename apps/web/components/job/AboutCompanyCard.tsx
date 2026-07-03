import Link from 'next/link';
import { ArrowRight, LinkIcon } from '@jobportal/ui/icons';
import { CompanyLogo } from '../companies/CompanyLogo';

export interface AboutCompanyCardProps {
  companyId: number;
  companyName: string;
  companySlug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  industryName: string | null;
}

// Strips the scheme/path so an external site reads as a clean domain.
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Left-rail company card: logo + name + industry, an optional website link, and
// a link through to the full company profile.
export function AboutCompanyCard({
  companyId,
  companyName,
  companySlug,
  logoUrl,
  websiteUrl,
  industryName,
}: AboutCompanyCardProps) {
  const profileHref = `/company/${companySlug}-overview-${companyId}`;

  return (
    <section
      aria-label="About the company"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-fg)]">About the company</h2>
      <div className="flex items-center gap-3">
        <CompanyLogo companyId={companyId} name={companyName} logoUrl={logoUrl} size={44} />
        <div className="min-w-0">
          <Link
            href={profileHref}
            className="block truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
          >
            {companyName}
          </Link>
          {industryName && (
            <p className="mt-0.5 truncate text-xs text-[var(--color-fg-muted)]">{industryName}</p>
          )}
        </div>
      </div>

      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          <LinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{hostOf(websiteUrl)}</span>
        </a>
      )}

      <Link
        href={profileHref}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-600)] hover:underline"
      >
        View company profile
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
