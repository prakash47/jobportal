import { Badge } from '@jobportal/ui';
import { Briefcase, IndianRupee, MapPin } from '@jobportal/ui/icons';

function formatSalaryPaise(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  // Stored as paise (1 INR = 100 paise). Display as INR lakh / crore.
  const toLpa = (v: number) => {
    const lakhs = v / 100_000_00;
    if (lakhs >= 100) return `${(lakhs / 100).toFixed(1)} Cr`;
    return `${lakhs.toFixed(1)} L`;
  };
  if (min !== null && max !== null) return `₹${toLpa(min)} – ₹${toLpa(max)}`;
  if (min !== null) return `₹${toLpa(min)}+`;
  return `up to ₹${toLpa(max as number)}`;
}

function formatExperienceYears(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `up to ${max} yrs`;
}

export interface JobMetaProps {
  cityNames: string[];
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  skillNames: string[];
}

export function JobMeta({
  cityNames,
  salaryMinPaise,
  salaryMaxPaise,
  experienceMinYears,
  experienceMaxYears,
  skillNames,
}: JobMetaProps) {
  const salary = formatSalaryPaise(salaryMinPaise, salaryMaxPaise);
  const exp = formatExperienceYears(experienceMinYears, experienceMaxYears);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--color-fg-muted)]">
        {cityNames.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {cityNames.join(', ')}
          </span>
        )}
        {exp && (
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="size-4" aria-hidden="true" />
            {exp}
          </span>
        )}
        {salary && (
          <span className="inline-flex items-center gap-1.5">
            <IndianRupee className="size-4" aria-hidden="true" />
            {salary}
          </span>
        )}
      </div>
      {skillNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skillNames.map((s) => (
            <Badge key={s} variant="neutral">
              {s}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
