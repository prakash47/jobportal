'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BroadcastCategory, BroadcastSegment } from '@jobportal/db';
import { Button, Checkbox, Input, Label, Textarea } from '@jobportal/ui';
import {
  BROADCAST_CATEGORY_LABEL,
  BROADCAST_SEGMENT_LABEL,
  describeInAppReach,
  formatCount,
} from '../../lib/broadcasts/format';
import type { BroadcastDetail, PreviewCountResult } from '../../lib/broadcasts/types';
import { API_URL, FIELD_CLASS, describeApiError } from './shared';

/** Mirrors the API's DTO ceilings so the fields cannot overrun them. */
const SUBJECT_MAX = 150;
const BODY_MAX = 10_000;
const CTA_LABEL_MAX = 40;

const SEGMENTS: BroadcastSegment[] = ['ALL_RECRUITERS', 'ALL_CANDIDATES', 'ALL_USERS'];
const CATEGORIES: BroadcastCategory[] = ['OPERATIONAL', 'PROMOTIONAL'];

/**
 * Compose a new broadcast, or edit an existing draft.
 *
 * ⚠ The design job here is to make the BLAST RADIUS visible while the message is
 * being written, not at the moment of pressing Send. Three things carry that,
 * and none is decorative:
 *
 *  - a LIVE recipient count that re-queries whenever the segment changes, so the
 *    number is attached to the choice that produced it;
 *  - an explicit note whenever in-app is on, because in-app reaches recruiters
 *    ONLY whatever the segment says — a fact with no other visible symptom;
 *  - the promotional refusal stated at compose time rather than sprung at send,
 *    so nobody writes a campaign into a tool that will not send it.
 *
 * Writes go through apps/api so AdminGuard, the killswitch and the audit row all
 * apply. There are no server actions anywhere in this monorepo, and one here
 * would bypass all three at once.
 */
export function BroadcastComposer({ initial }: { initial?: BroadcastDetail }) {
  const router = useRouter();
  const isEdit = initial !== undefined;

  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [category, setCategory] = useState<BroadcastCategory>(initial?.category ?? 'OPERATIONAL');
  const [segment, setSegment] = useState<BroadcastSegment>(initial?.segment ?? 'ALL_RECRUITERS');
  const [emailEnabled, setEmailEnabled] = useState(initial?.emailEnabled ?? true);
  const [inAppEnabled, setInAppEnabled] = useState(initial?.inAppEnabled ?? false);
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? '');
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? '');

  const [preview, setPreview] = useState<PreviewCountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const subjectId = useId();
  const bodyId = useId();
  const categoryId = useId();
  const segmentId = useId();
  const emailId = useId();
  const inAppId = useId();
  const ctaLabelId = useId();
  const ctaUrlId = useId();

  // Covers the request AND the navigation/refresh that follows, so the form
  // cannot be re-submitted into a duplicate draft while the page is still
  // re-rendering.
  const busy = loading || isPending;

  // The live reach count. Re-queries on every segment change so the number is
  // never attached to a segment other than the one selected — a stale count on
  // this particular form would be an admin approving the wrong audience size.
  //
  // Deliberately NOT debounced: the input is a <select>, so changes are discrete
  // and rare, and a debounce would only add a window in which the displayed
  // number disagrees with the dropdown.
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/broadcasts/preview-count`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as PreviewCountResult;
        // The segment may have changed again while this was in flight; a late
        // response must not overwrite a newer one.
        if (!cancelled && data.segment === segment) setPreview(data);
      } catch {
        // A failed preview leaves the count absent rather than showing a wrong
        // one. The send path counts again server-side regardless, so nothing
        // depends on this number being present.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [segment]);

  const inAppNote = describeInAppReach(segment, inAppEnabled);
  const inAppImpossible = inAppEnabled && segment === 'ALL_CANDIDATES';
  const noChannel = !emailEnabled && !inAppEnabled;
  const ctaHalf = ctaLabel.trim() !== '' !== (ctaUrl.trim() !== '');

  const canSubmit =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !noChannel &&
    !inAppImpossible &&
    !ctaHalf &&
    !busy;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        category,
        segment,
        emailEnabled,
        inAppEnabled,
        // Omitted entirely when blank rather than sent as '' — the API's schema
        // is `.optional()` with a `min(1)`, so an empty string is a 400 while an
        // absent key is "no CTA".
        ...(ctaLabel.trim() ? { ctaLabel: ctaLabel.trim() } : {}),
        ...(ctaUrl.trim() ? { ctaUrl: ctaUrl.trim() } : {}),
      };
      const res = await fetch(
        isEdit ? `${API_URL}/admin/broadcasts/${initial.id}` : `${API_URL}/admin/broadcasts`,
        {
          method: isEdit ? 'PUT' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await describeApiError(res, 'save'));

      const saved = (await res.json()) as { id: number };
      if (isEdit) {
        // Names the consequence, not just the act: an edit invalidates the test
        // send, and an admin who does not know that will press Send and be
        // refused for a reason they cannot see on screen.
        setStatus('Draft saved. Send yourself a test copy again before sending.');
        startTransition(() => router.refresh());
      } else {
        setStatus('Draft created.');
        startTransition(() => router.push(`/broadcasts/${saved.id}`));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft. Try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6">
      <div className="space-y-2">
        <Label htmlFor={subjectId}>Subject</Label>
        <Input
          id={subjectId}
          value={subject}
          maxLength={SUBJECT_MAX}
          disabled={busy}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Scheduled maintenance on Sunday 24 August"
        />
        <p className="text-xs text-[var(--color-fg-muted)]">
          Used as the email subject line and as the heading inside the message.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={bodyId}>Message</Label>
        <Textarea
          id={bodyId}
          rows={10}
          value={body}
          maxLength={BODY_MAX}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Plain text. Leave a blank line between paragraphs.'}
        />
        {/* States both rules the renderer actually applies, because the shape of
            what arrives is otherwise only discoverable by sending a test. */}
        <p className="text-xs text-[var(--color-fg-muted)]">
          Plain text only — a blank line starts a new paragraph. HTML is not
          rendered; it is shown as written.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={categoryId}>Type</Label>
          <select
            id={categoryId}
            className={FIELD_CLASS}
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value as BroadcastCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {BROADCAST_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          {category === 'PROMOTIONAL' ? (
            // Stated HERE, at the moment of choosing, rather than sprung at
            // Send. The category is still offered — removing it would not stop
            // promotions, it would mean they get composed as operational notices
            // and go out ungated to people who opted out of marketing.
            <p className="text-xs text-[var(--color-fg)]">
              Promotional broadcasts can be drafted but <strong>cannot be sent yet</strong>:
              marketing consent is not enforced anywhere in the product, recruiters have no way to
              opt out, and there is no unsubscribe link.
            </p>
          ) : (
            <p className="text-xs text-[var(--color-fg-muted)]">
              Service, maintenance and policy notices. Sent to everyone in the segment, like a
              password reset — there is no opt-out for operational mail.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={segmentId}>Send to</Label>
          <select
            id={segmentId}
            className={FIELD_CLASS}
            value={segment}
            disabled={busy}
            onChange={(e) => setSegment(e.target.value as BroadcastSegment)}
          >
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {BROADCAST_SEGMENT_LABEL[s]}
              </option>
            ))}
          </select>
          {/* The reach figure, attached to the choice that produced it. Absent
              rather than zero while it loads or if the request failed — a "0"
              here would read as an empty segment and stop a legitimate send. */}
          <p className="text-xs text-[var(--color-fg-muted)]">
            {preview
              ? `Reaches about ${formatCount(preview.emailRecipients)} people by email` +
                (preview.inAppRecipients > 0
                  ? `, and ${formatCount(preview.inAppRecipients)} in the recruiter portal.`
                  : '.')
              : 'Counting recipients…'}
          </p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-[var(--color-fg)]">Channels</legend>
        <div className="flex items-center gap-2">
          <Checkbox
            id={emailId}
            checked={emailEnabled}
            disabled={busy}
            onCheckedChange={(v) => setEmailEnabled(v === true)}
          />
          <Label htmlFor={emailId} className="font-normal">
            Email
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={inAppId}
            checked={inAppEnabled}
            disabled={busy}
            onCheckedChange={(v) => setInAppEnabled(v === true)}
          />
          <Label htmlFor={inAppId} className="font-normal">
            In-app notification
          </Label>
        </div>
        {inAppNote && (
          <p
            className={
              inAppImpossible
                ? 'rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-muted)] px-3 py-2 text-xs text-[var(--color-fg)]'
                : 'text-xs text-[var(--color-fg-muted)]'
            }
          >
            {inAppNote}
          </p>
        )}
        {noChannel && (
          <p className="text-xs text-[var(--color-fg)]">
            Choose at least one channel — otherwise this broadcast reaches nobody.
          </p>
        )}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ctaLabelId}>Button label (optional)</Label>
          <Input
            id={ctaLabelId}
            value={ctaLabel}
            maxLength={CTA_LABEL_MAX}
            disabled={busy}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="e.g. Status page"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ctaUrlId}>Button link (optional)</Label>
          <Input
            id={ctaUrlId}
            value={ctaUrl}
            disabled={busy}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://…"
          />
          {/* Both constraints stated, because both are refusals the admin would
              otherwise discover only on submit. The email-only part matters
              most: Notification.linkUrl is a portal-relative path, so one URL
              cannot be correct in both an email and the bell. */}
          <p className="text-xs text-[var(--color-fg-muted)]">
            Must be a full https:// link. The button appears in the email only —
            in-app notifications carry no link.
          </p>
        </div>
      </div>
      {ctaHalf && (
        <p className="text-xs text-[var(--color-fg)]">
          A button needs both a label and a link, or neither.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <Button loading={loading} disabled={!canSubmit} onClick={() => void submit()}>
          {isEdit ? 'Save draft' : 'Create draft'}
        </Button>
        {/* Says what this button does NOT do. On a screen whose whole subject is
            sending to the entire platform, "Create draft" alone leaves the
            reader to guess whether pressing it sends anything. */}
        <span className="text-xs text-[var(--color-fg-muted)]">
          Nothing is sent yet — you will be able to test it first.
        </span>
      </div>

      {/* ALWAYS mounted, text-only changes. A role="status" that mounts together
          with its message is not announced, so a save would complete in total
          silence for a screen-reader user — the defect ReportDecisionForm
          documents and this portal has already had to fix once. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {error && (
        <p
          // Remount key — an identical second failure otherwise hits React's
          // Object.is bailout and announces nothing at all.
          key={errorNonce}
          role="alert"
          className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-fg)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
