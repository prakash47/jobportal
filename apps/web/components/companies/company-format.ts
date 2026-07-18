// Presentation helpers shared across the company-profile components. Kept
// framework-free (pure functions + a label map) so both server and client
// components can import them.

// Mirrors the Prisma `CompanyType` enum. Nullable on the model, so callers
// guard for the absent case before formatting.
export const COMPANY_TYPE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  INDIAN_MNC: 'Indian MNC',
  FOREIGN_MNC: 'Foreign MNC',
  PRIVATE: 'Private',
  PUBLIC: 'Public',
  GOVERNMENT_PSU: 'Government / PSU',
  NGO_NONPROFIT: 'NGO / Non-profit',
  PARTNERSHIP: 'Partnership',
  SOLE_PROPRIETORSHIP: 'Sole proprietorship',
};

export function companyTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return COMPANY_TYPE_LABELS[type] ?? null;
}

// Strips scheme + leading www so an external URL reads as a clean domain.
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
