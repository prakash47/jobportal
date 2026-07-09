'use client';

import { useState } from 'react';
import { Button } from '@jobportal/ui';
import { jobTypeMeta, type JobType } from '../../lib/job-types';
import { PostJobWizard, type PostJobWizardProps, type WizardInitialValues } from './PostJobWizard';
import { JobTypeSelector } from './JobTypeSelector';
import { TemplatePicker, type PastJobSummary } from './TemplatePicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Stage = 'start' | 'template' | 'type' | 'form';

// Shape of GET /recruiter/jobs/:id we consume for template prefill.
interface FetchedJob {
  title: string;
  description: string;
  shortDescription: string | null;
  skillIds: number[];
  primaryCityId: number | null;
  cityIds: number[];
  industryId: number | null;
  functionalAreaId: number | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  workMode: 'ONSITE' | 'REMOTE' | 'HYBRID';
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
}

type WizardPassthrough = Pick<
  PostJobWizardProps,
  'skills' | 'cities' | 'industries' | 'functionalAreas' | 'quota'
>;

interface PostJobFlowProps extends WizardPassthrough {
  pastJobs: PastJobSummary[];
  availability: Record<JobType, boolean>;
}

// Orchestrates the pre-wizard steps: Start → (Create new → Job type) OR
// (Start from a previous job → Template picker) → the posting form. Holds the
// chosen job type + any template prefill, then hands off to PostJobWizard.
export function PostJobFlow({ pastJobs, availability, ...wizardProps }: PostJobFlowProps) {
  const [stage, setStage] = useState<Stage>('start');
  const [jobType, setJobType] = useState<JobType>('FREE');
  const [initialValues, setInitialValues] = useState<WizardInitialValues | undefined>(undefined);
  const [templateJobId, setTemplateJobId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  function backToStart() {
    setStage('start');
    setInitialValues(undefined);
    setTemplateJobId(null);
    setTemplateError(null);
  }

  function onTypeSelect(type: JobType) {
    setJobType(type);
    setInitialValues(undefined);
    setTemplateJobId(null);
    setStage('form');
  }

  async function onTemplateSelect(jobId: number) {
    setLoadingId(jobId);
    setTemplateError(null);
    try {
      const res = await fetch(`${API_URL}/recruiter/jobs/${jobId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Could not load that job (${res.status})`);
      const job = (await res.json()) as FetchedJob;
      setInitialValues({
        title: job.title,
        description: job.description,
        shortDescription: job.shortDescription,
        skillIds: job.skillIds ?? [],
        primaryCityId: job.primaryCityId,
        cityIds: job.cityIds ?? [],
        industryId: job.industryId,
        functionalAreaId: job.functionalAreaId,
        employmentType: job.employmentType,
        workMode: job.workMode,
        experienceMinYears: job.experienceMinYears,
        experienceMaxYears: job.experienceMaxYears,
        salaryMinPaise: job.salaryMinPaise,
        salaryMaxPaise: job.salaryMaxPaise,
      });
      // No jobType column yet (Phase 3) — infer Internship from an INTERN
      // employment type, else default to Free.
      setJobType(job.employmentType === 'INTERN' ? 'INTERNSHIP' : 'FREE');
      setTemplateJobId(jobId);
      setStage('form');
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Could not load that job');
    } finally {
      setLoadingId(null);
    }
  }

  if (stage === 'start') {
    const hasPast = pastJobs.length > 0;
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StartCard
          title="Create a new job"
          description="Start from a blank form and choose how the role should be posted."
          actionLabel="Start fresh"
          onClick={() => setStage('type')}
        />
        <StartCard
          title="Start from a previous job"
          description={
            hasPast
              ? 'Copy the details of one of your past postings, then review and edit.'
              : 'You have no previous postings yet — post one first to reuse it later.'
          }
          actionLabel="Choose a template"
          onClick={() => setStage('template')}
          disabled={!hasPast}
        />
      </div>
    );
  }

  if (stage === 'template') {
    return (
      <TemplatePicker
        pastJobs={pastJobs}
        onSelect={onTemplateSelect}
        onBack={backToStart}
        loadingId={loadingId}
        error={templateError}
      />
    );
  }

  if (stage === 'type') {
    return <JobTypeSelector availability={availability} onSelect={onTypeSelect} onBack={backToStart} />;
  }

  // stage === 'form'
  const meta = jobTypeMeta(jobType);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 px-4 py-2.5">
        <p className="text-sm text-[var(--color-fg-muted)]">
          Posting a <span className="font-medium text-[var(--color-fg)]">{meta.label}</span>
          {templateJobId !== null && ' · copied from a previous job'}
        </p>
        <Button variant="ghost" onClick={backToStart}>
          Start over
        </Button>
      </div>

      {templateJobId !== null && (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)]">
          Details were copied from a previous job. Review everything — especially the
          location and salary — before publishing.
        </p>
      )}

      <PostJobWizard
        // Remount when the selection changes so the wizard re-seeds from the new
        // template / job type instead of keeping stale state.
        key={`${jobType}-${templateJobId ?? 'new'}`}
        {...wizardProps}
        jobType={jobType}
        initialValues={initialValues}
      />
    </div>
  );
}

function StartCard({
  title,
  description,
  actionLabel,
  onClick,
  disabled = false,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-[var(--color-border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-[var(--color-fg-muted)]">{description}</p>
      <div className="mt-4">
        <Button variant="primary" onClick={onClick} disabled={disabled} className="w-full">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
