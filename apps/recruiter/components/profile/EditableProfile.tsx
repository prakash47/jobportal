'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, Textarea } from '@jobportal/ui';
import { api } from '../../lib/api-client';
import { LogoUpload } from './LogoUpload';

interface CatalogueEntry {
  id: number;
  slug: string;
  name: string;
}

// Mirrors the API CompanyType enum + COMPANY_TYPES in apps/api recruiter-profile
// dto.ts. Labels are the human-facing strings; values are the enum members.
const COMPANY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'STARTUP', label: 'Startup' },
  { value: 'INDIAN_MNC', label: 'Indian MNC' },
  { value: 'FOREIGN_MNC', label: 'Foreign MNC' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'GOVERNMENT_PSU', label: 'Government / PSU' },
  { value: 'NGO_NONPROFIT', label: 'NGO / Non-profit' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole Proprietorship' },
];

export interface EditableProfileProps {
  user: { name: string; email: string; emailVerified: boolean };
  recruiter: {
    designation: string | null;
    department: string | null;
    contactPhone: string | null;
    altPocName: string | null;
    altPocEmail: string | null;
    altPocPhone: string | null;
    workEmailVerified: boolean;
  };
  company: {
    id: number;
    name: string;
    description: string | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    companyType: string | null;
    industryId: number | null;
    headquartersCityId: number | null;
    employeeCount: string | null;
    foundedYear: number | null;
  };
  industries: CatalogueEntry[];
  cities: CatalogueEntry[];
}

export function EditableProfile(props: EditableProfileProps) {
  return (
    <div className="space-y-8">
      <YourDetailsSection
        user={props.user}
        recruiter={props.recruiter}
        verified={props.recruiter.workEmailVerified}
      />
      <CompanyDetailsSection
        company={props.company}
        industries={props.industries}
        cities={props.cities}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — recruiter-personal details (PATCH /recruiter/profile)
// ---------------------------------------------------------------------------
function YourDetailsSection({
  user,
  recruiter,
  verified,
}: {
  user: EditableProfileProps['user'];
  recruiter: EditableProfileProps['recruiter'];
  verified: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [designation, setDesignation] = useState(recruiter.designation ?? '');
  const [department, setDepartment] = useState(recruiter.department ?? '');
  const [contactPhone, setContactPhone] = useState(recruiter.contactPhone ?? '');
  const [altPocName, setAltPocName] = useState(recruiter.altPocName ?? '');
  const [altPocEmail, setAltPocEmail] = useState(recruiter.altPocEmail ?? '');
  const [altPocPhone, setAltPocPhone] = useState(recruiter.altPocPhone ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError('Your name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await api('/recruiter/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        name: name.trim(),
        designation,
        department,
        contactPhone,
        altPocName,
        altPocEmail,
        altPocPhone,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Section
      title="Your details"
      description="How you appear to candidates and teammates."
      onSave={save}
      busy={busy}
      saved={saved}
      error={error}
    >
      <Field label="Name">
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email ID">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-fg)]">{user.email}</span>
          {verified ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="warning">Unverified</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
          Your Email ID is your login and can&rsquo;t be changed here.
        </p>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Designation">
          <Input
            value={designation}
            maxLength={120}
            placeholder="e.g. Talent Acquisition Lead"
            onChange={(e) => setDesignation(e.target.value)}
          />
        </Field>
        <Field label="Department">
          <Input
            value={department}
            maxLength={120}
            placeholder="e.g. Human Resources"
            onChange={(e) => setDepartment(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Contact number">
        <Input
          value={contactPhone}
          inputMode="tel"
          maxLength={20}
          placeholder="e.g. +91 98765 43210"
          onChange={(e) => setContactPhone(e.target.value)}
        />
      </Field>

      <fieldset className="space-y-4 border-t border-[var(--color-border)] pt-4">
        <legend className="text-sm font-medium text-[var(--color-fg)]">
          Alternate point of contact
        </legend>
        <p className="-mt-1 text-xs text-[var(--color-fg-subtle)]">
          A backup person candidates or our team can reach. Optional.
        </p>
        <Field label="Name">
          <Input
            value={altPocName}
            maxLength={120}
            onChange={(e) => setAltPocName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input
              value={altPocEmail}
              type="email"
              inputMode="email"
              maxLength={200}
              onChange={(e) => setAltPocEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={altPocPhone}
              inputMode="tel"
              maxLength={20}
              onChange={(e) => setAltPocPhone(e.target.value)}
            />
          </Field>
        </div>
      </fieldset>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — company details (PATCH /recruiter/company + logo upload)
// ---------------------------------------------------------------------------
function CompanyDetailsSection({
  company,
  industries,
  cities,
}: {
  company: EditableProfileProps['company'];
  industries: CatalogueEntry[];
  cities: CatalogueEntry[];
}) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [companyType, setCompanyType] = useState(company.companyType ?? '');
  const [industryId, setIndustryId] = useState<string>(
    company.industryId != null ? String(company.industryId) : '',
  );
  const [hqCityId, setHqCityId] = useState<string>(
    company.headquartersCityId != null ? String(company.headquartersCityId) : '',
  );
  const [websiteUrl, setWebsiteUrl] = useState(company.websiteUrl ?? '');
  const [employeeCount, setEmployeeCount] = useState(company.employeeCount ?? '');
  const [foundedYear, setFoundedYear] = useState<string>(
    company.foundedYear != null ? String(company.foundedYear) : '',
  );
  const [description, setDescription] = useState(company.description ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError('Company name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await api('/recruiter/company', {
      method: 'PATCH',
      body: JSON.stringify({
        name: name.trim(),
        description,
        websiteUrl,
        companyType: companyType === '' ? null : companyType,
        industryId: industryId === '' ? null : Number(industryId),
        headquartersCityId: hqCityId === '' ? null : Number(hqCityId),
        employeeCount,
        foundedYear: foundedYear === '' ? null : Number(foundedYear),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Section
      title="Company details"
      description="Your logo and company info appear on your job posts and company page."
      onSave={save}
      busy={busy}
      saved={saved}
      error={error}
    >
      <Field label="Company logo">
        <LogoUpload companyId={company.id} companyName={company.name} logoUrl={company.logoUrl} />
      </Field>
      <Field label="Company name">
        <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company type">
          <SelectInput value={companyType} onChange={setCompanyType} placeholder="Select a type">
            {COMPANY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Industry">
          <SelectInput value={industryId} onChange={setIndustryId} placeholder="Select an industry">
            {industries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Headquarters city">
          <SelectInput value={hqCityId} onChange={setHqCityId} placeholder="Select a city">
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Website URL">
          <Input
            value={websiteUrl}
            type="url"
            inputMode="url"
            maxLength={300}
            placeholder="https://www.example.com"
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Employees">
          <Input
            value={employeeCount}
            maxLength={40}
            placeholder="e.g. 51-200"
            onChange={(e) => setEmployeeCount(e.target.value)}
          />
        </Field>
        <Field label="Founded year">
          <Input
            value={foundedYear}
            type="number"
            min={1800}
            max={2100}
            placeholder="e.g. 2015"
            onChange={(e) => setFoundedYear(e.target.value)}
          />
        </Field>
      </div>
      <Field label="About the company">
        <Textarea
          value={description}
          rows={6}
          maxLength={5000}
          placeholder="What your company does, culture, mission…"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational helpers
// ---------------------------------------------------------------------------
function Section({
  title,
  description,
  children,
  onSave,
  busy,
  saved,
  error,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  busy: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-5 rounded-md border border-[var(--color-border)] p-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--color-fg)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p>
      </header>
      <div className="space-y-4">{children}</div>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <Button variant="primary" onClick={onSave} loading={busy}>
          Save changes
        </Button>
        {saved && !busy && (
          <span className="text-sm text-[var(--color-success)]" role="status">
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// Native select styled to match the wizard's dropdowns (PostJobWizard). The
// empty-value option maps to "no selection" / clear.
function SelectInput({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)]"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
