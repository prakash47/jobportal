'use client';

import { useId, useState } from 'react';
import type { ContentReportReason } from '@jobportal/db';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  RadioGroup,
  RadioItem,
  Textarea,
} from '@jobportal/ui';
import { Flag } from '@jobportal/ui/icons';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASON_ORDER,
  reportErrorMessage,
} from '../../lib/job/report';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ReportJobButtonProps {
  jobId: number;
}

// "Report this job" — the intake half of the moderation queue.
//
// Rendered only when moderation.reports.enabled is on; that check is the PAGE's
// (L2), and it is UX only. POST /v1/reports re-checks the same flag server-side
// (L3) and is the non-bypassable one.
//
// Deliberately available to logged-out visitors: this page is public and most of
// its traffic is anonymous, so a sign-in wall here would suppress exactly the
// fake-job reports worth having. That is why this does NOT follow SaveButton's
// `isAuthed` → redirect-to-login shape.
export function ReportJobButton({ jobId }: ReportJobButtonProps) {
  // useId, not hand-written strings: this page already renders an apply form and
  // a save control, and several jobs' markup can coexist in the router cache.
  // Duplicate ids would silently mis-associate labels. (COLLABORATION.md §4.3.)
  const reasonLabelId = useId();
  const detailsId = useId();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Every open starts clean. Without this, reopening after an error shows the
  // previous failure, and after a success shows the thank-you with no way back.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason(null);
      setDetails('');
      setError(null);
      setDone(false);
    }
  }

  async function onSubmit() {
    if (reason === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The endpoint accepts anonymous reports, but a signed-in reporter
        // should be attributed — that is what enables the one-report-per-person
        // rule. The cookie is HttpOnly and the API is a different origin.
        credentials: 'include',
        body: JSON.stringify({
          targetType: 'JOB',
          jobId,
          reason,
          // Omitted entirely when blank rather than sent as '' — the DTO would
          // normalise it anyway, but not sending it keeps the wire shape honest.
          ...(details.trim().length > 0 ? { details: details.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(reportErrorMessage(res.status));
        return;
      }
      setDone(true);
    } catch {
      // Network/CORS failure — no status to map, so the generic branch. Passing
      // 0 keeps the copy in one place rather than duplicating the fallback here.
      setError(reportErrorMessage(0));
    } finally {
      setBusy(false);
    }
  }

  const overLimit = details.trim().length > REPORT_DETAILS_MAX;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" leadingIcon={<Flag className="size-4" />}>
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Thanks for letting us know</DialogTitle>
              <DialogDescription>
                Our team will review this posting. We don&rsquo;t share who reported a job, and we
                may not be able to update you on the outcome.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report this job</DialogTitle>
              <DialogDescription>
                Tell us what&rsquo;s wrong with this posting. Reports go to our moderation team, not
                to the employer.
              </DialogDescription>
            </DialogHeader>

            {/* RadioGroup renders a div, so the grouping label is wired with
                aria-labelledby rather than a <fieldset>/<legend>. */}
            <div className="grid gap-2">
              <span id={reasonLabelId} className="text-sm font-medium text-[var(--color-fg)]">
                Reason
              </span>
              <RadioGroup
                aria-labelledby={reasonLabelId}
                // `null` (not undefined) for "nothing chosen yet": the group
                // stays controlled from first render, and exactOptionalPropertyTypes
                // rejects an explicit undefined here.
                value={reason}
                onValueChange={(v) => setReason(v as ContentReportReason)}
              >
                {REPORT_REASON_ORDER.map((r) => {
                  // One id per radio, derived from the stable useId root so it
                  // is unique across every instance on the page.
                  const id = `${reasonLabelId}-${r}`;
                  return (
                    <div key={r} className="flex items-center gap-2.5">
                      <RadioItem value={r} id={id} />
                      <Label htmlFor={id} className="font-normal">
                        {REPORT_REASON_LABELS[r]}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={detailsId}>Anything else? (optional)</Label>
              <Textarea
                id={detailsId}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                invalid={overLimit}
                placeholder="What made this posting look wrong?"
              />
              {overLimit && (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  Please keep this under {REPORT_DETAILS_MAX.toLocaleString('en-IN')} characters.
                </p>
              )}
            </div>

            {error !== null && (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onSubmit} loading={busy} disabled={reason === null || overLimit}>
                Submit report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
