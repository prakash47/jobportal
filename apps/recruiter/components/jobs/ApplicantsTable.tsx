'use client';

import { useState } from 'react';
import { Badge, type BadgeVariant } from '@jobportal/ui';
import { ApplicantDrawer } from './ApplicantDrawer';

type ApplicationStatus =
  | 'APPLIED'
  | 'IN_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEWED'
  | 'OFFERED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

const STATUS_VARIANT: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: 'neutral',
  IN_REVIEW: 'warning',
  SHORTLISTED: 'warning',
  INTERVIEWED: 'warning',
  OFFERED: 'success',
  HIRED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  IN_REVIEW: 'In review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEWED: 'Interviewed',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

const fmt = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const fmtExperience = (months: number | null): string => {
  if (months === null) return '—';
  const years = Math.round((months / 12) * 10) / 10;
  return `${years}y`;
};

export interface ApplicantRow {
  id: number;
  status: ApplicationStatus;
  appliedAt: string;
  recruiterNotes: string | null;
  user: {
    name: string;
    email: string;
    candidate: {
      headline: string | null;
      experienceMonths: number | null;
      currentTitle: string | null;
      expectedSalaryMinPaise: number | null;
      expectedSalaryMaxPaise: number | null;
      activeResumeId: number | null;
    } | null;
  };
}

export function ApplicantsTable({
  rows,
  emptyTitle,
}: {
  rows: ApplicantRow[];
  /** Filter-aware empty title; when set, the empty state reflects the active filter. */
  emptyTitle?: string | undefined;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">
          {emptyTitle ?? 'No applicants yet'}
        </p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {emptyTitle
            ? 'Try a different filter, or view All to see everyone.'
            : 'When a candidate applies, they show up here with their headline, experience, and resume.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-left text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Headline</th>
              <th className="px-4 py-2.5">Exp</th>
              <th className="px-4 py-2.5">Applied</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-bg-muted)]"
              >
                <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{r.user.name}</td>
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">
                  {r.user.candidate?.headline ?? r.user.candidate?.currentTitle ?? '—'}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-fg-muted)]">
                  {fmtExperience(r.user.candidate?.experienceMonths ?? null)}
                </td>
                <td className="px-4 py-3 text-[var(--color-fg-muted)]">{fmt(r.appliedAt)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <ApplicantDrawer
          open={openId !== null}
          onOpenChange={(o) => !o && setOpenId(null)}
          applicant={open}
        />
      )}
    </>
  );
}
