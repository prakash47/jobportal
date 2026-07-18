import { companyTypeLabel, hostOf } from './company-format';

export interface CompanyQuickFactsProps {
  industryName: string | null;
  companyType: string | null;
  foundedYear: number | null;
  employeeCount: string | null;
  hqCityName: string | null;
  websiteUrl: string | null;
}

interface Fact {
  label: string;
  value: React.ReactNode;
}

// Left-rail reference card: the durable company facts as a clean definition
// list. Only rows with real data render — a company that hasn't set its type
// or website simply shows fewer rows (no "N/A" filler).
export function CompanyQuickFacts({
  industryName,
  companyType,
  foundedYear,
  employeeCount,
  hqCityName,
  websiteUrl,
}: CompanyQuickFactsProps) {
  const typeLabel = companyTypeLabel(companyType);
  const facts: Fact[] = [];

  if (industryName) facts.push({ label: 'Industry', value: industryName });
  if (typeLabel) facts.push({ label: 'Company type', value: typeLabel });
  if (foundedYear !== null) facts.push({ label: 'Founded', value: foundedYear });
  if (employeeCount) facts.push({ label: 'Employees', value: employeeCount });
  if (hqCityName) facts.push({ label: 'Headquarters', value: hqCityName });
  if (websiteUrl) {
    facts.push({
      label: 'Website',
      value: (
        <a
          href={websiteUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="break-words text-[var(--color-accent-700)] hover:underline"
        >
          {hostOf(websiteUrl)}
        </a>
      ),
    });
  }

  if (facts.length === 0) return null;

  return (
    <section
      aria-label="Company facts"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-fg)]">Quick facts</h2>
      <dl className="space-y-3">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-[var(--color-fg-muted)]">{f.label}</dt>
            <dd className="text-sm font-medium text-[var(--color-fg)]">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
