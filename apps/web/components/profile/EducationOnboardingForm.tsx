'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { api } from '../../lib/profile/api-client';
import { EducationStep, type EduSection } from '../onboarding/EducationStep';
import { CLASS12_DEGREE } from '../onboarding/education-constants';

export interface EducationOnboardingFormProps {
  currentYear: number;
  degree: EduSection;
  class12: EduSection;
}

// Dashboard education editor that reuses the exact onboarding EducationStep form
// (First degree + Class 12 sections) and its upsert semantics. Each section maps
// to one Education row: POST /me/education for a new row, PATCH /me/education/:id
// for an existing one. The Class 12 row is discriminated by the CLASS12_DEGREE
// sentinel so it round-trips on the next load — identical to onboarding.
export function EducationOnboardingForm({
  currentYear,
  degree: initialDegree,
  class12: initialClass12,
}: EducationOnboardingFormProps) {
  const router = useRouter();
  const [degree, setDegree] = useState<EduSection>(initialDegree);
  const [class12, setClass12] = useState<EduSection>(initialClass12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Upsert one section. Returns false (and sets `error`) on a real failure; an
  // empty section (no institute) is a no-op success (skipped). Mirrors the
  // onboarding wizard's saveEducationSection exactly.
  async function saveSection(
    section: EduSection,
    setSection: Dispatch<SetStateAction<EduSection>>,
    isClass12: boolean,
  ): Promise<boolean> {
    const institute = section.institute.trim();
    if (!institute) return true; // empty section — nothing to save

    const degreeName = isClass12 ? CLASS12_DEGREE : section.degree.trim();
    if (!isClass12 && !degreeName) {
      setError('Please enter your degree name.');
      return false;
    }
    if (!isClass12 && degreeName.toLowerCase() === CLASS12_DEGREE.toLowerCase()) {
      setError('Please enter a specific degree name (not "Class XII").');
      return false;
    }
    if (!section.startYear) {
      setError('Please select a starting year.');
      return false;
    }
    const startYear = Number(section.startYear);

    const body: Record<string, unknown> = { institute, degree: degreeName, startYear };
    if (section.fieldOfStudy.trim()) body.fieldOfStudy = section.fieldOfStudy.trim();
    if (section.pursuing) {
      body.endYear = null; // ongoing — null ⇔ currently pursuing
    } else {
      if (!section.endYear) {
        setError('Select an ending year, or tick "Currently pursuing".');
        return false;
      }
      const endYear = Number(section.endYear);
      if (endYear < startYear) {
        setError('Ending year must be the same as or after the starting year.');
        return false;
      }
      body.endYear = endYear;
    }
    if (!isClass12 && section.grade.trim()) body.grade = section.grade.trim();

    if (section.id != null) {
      const res = await api(`/me/education/${section.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.message);
        return false;
      }
    } else {
      const res = await api<{ id: number }>('/me/education', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(res.message);
        return false;
      }
      const newId = res.data.id;
      setSection((s) => ({ ...s, id: newId }));
    }
    return true;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const okDegree = await saveSection(degree, setDegree, false);
    if (!okDegree) {
      setBusy(false);
      return;
    }
    const okClass12 = await saveSection(class12, setClass12, true);
    setBusy(false);
    if (!okClass12) return;

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <EducationStep
        currentYear={currentYear}
        degree={degree}
        onDegreeChange={(patch) => setDegree((d) => ({ ...d, ...patch }))}
        class12={class12}
        onClass12Change={(patch) => setClass12((c) => ({ ...c, ...patch }))}
      />
      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-6">
        <Button type="submit" loading={busy}>
          Save changes
        </Button>
        {saved && <span className="text-sm text-[var(--color-success)]">Saved</span>}
        {error && (
          <span role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
