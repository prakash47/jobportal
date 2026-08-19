'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@jobportal/ui';
import {
  BROADCAST_SEGMENT_LABEL,
  formatChannels,
  formatCount,
} from '../../lib/broadcasts/format';
import type { BroadcastDetail, PreviewCountResult } from '../../lib/broadcasts/types';
import { API_URL, describeApiError } from './shared';

/**
 * Test-send, dispatch and cancel for one broadcast.
 *
 * ⚠ THE CONFIRMATION ASKS THE ADMIN TO TYPE THE RECIPIENT COUNT, not to type
 * "SEND" or to click a second button. That choice is the point of the control.
 * A fixed confirmation word becomes muscle memory within a week and stops
 * carrying any information; typing the count cannot be done without reading the
 * count, which is the single fact that most needs to reach the person's
 * attention before they dispatch. "About to send to 4,182 people" is exactly the
 * sentence someone who picked the wrong segment needs to trip over.
 *
 * There is no prior art for this in the repo — the strongest existing bar is a
 * dialog plus a ≥4-character free-text reason on a critical flag toggle. This is
 * a more dangerous action than any of those: it is the only one whose effect
 * cannot be reversed by any subsequent admin action.
 *
 * The rail is UI-only and is not the enforcement. The API independently refuses
 * a send that is not a DRAFT, has no test send, is promotional, or resolves to
 * an empty segment.
 */
export function BroadcastActions({
  broadcast,
  killed,
}: {
  broadcast: BroadcastDetail;
  /** Layer 2: killswitch.admin_broadcast_send, read server-side by the page. */
  killed: boolean;
}) {
  const router = useRouter();
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [preview, setPreview] = useState<PreviewCountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const confirmId = useId();
  const busy = loading || isPending;

  const isDraft = broadcast.status === 'DRAFT';
  const isSending = broadcast.status === 'SENDING';
  const isPromotional = broadcast.category === 'PROMOTIONAL';
  const hasTest = broadcast.testSentAt !== null;

  // Counted when the dialog opens rather than on mount, so the number the admin
  // is asked to type is as fresh as the decision they are about to make.
  useEffect(() => {
    if (!sendOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/broadcasts/preview-count`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment: broadcast.segment }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as PreviewCountResult;
        if (!cancelled) setPreview(data);
      } catch {
        // Left null — the dialog then says it could not count and the confirm
        // stays disabled, rather than accepting a send whose size is unknown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendOpen, broadcast.segment]);

  // The channel that actually determines the ledger size: an in-app-only
  // broadcast is addressed to the recruiter subset, not to the email audience.
  const reach = preview
    ? broadcast.emailEnabled
      ? preview.emailRecipients
      : preview.inAppRecipients
    : null;

  // Digits only, so "4,182" and "4182" both match what is displayed — the rail
  // is about having READ the number, not about reproducing its punctuation.
  const confirmMatches =
    reach !== null && reach > 0 && confirmText.replace(/[^\d]/g, '') === String(reach);

  async function post(path: string, action: 'test' | 'send' | 'cancel', okMessage: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/broadcasts/${broadcast.id}/${path}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await describeApiError(res, action));
      setStatus(okMessage);
      setSendOpen(false);
      setCancelOpen(false);
      setConfirmText('');
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      setErrorNonce((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {isDraft && (
          <>
            <Button
              variant="secondary"
              loading={loading && !sendOpen && !cancelOpen}
              disabled={busy}
              onClick={() =>
                void post('test-send', 'test', 'Test copy sent to your own address.')
              }
            >
              {hasTest ? 'Send another test' : 'Send me a test copy'}
            </Button>

            <Button
              disabled={busy || killed || isPromotional || !hasTest}
              onClick={() => {
                setError(null);
                setConfirmText('');
                setSendOpen(true);
              }}
              {...(killed
                ? { title: 'Sending is switched off' }
                : isPromotional
                  ? { title: 'Promotional broadcasts cannot be sent yet' }
                  : !hasTest
                    ? { title: 'Send yourself a test copy first' }
                    : {})}
            >
              Send broadcast
            </Button>
          </>
        )}

        {(isDraft || isSending) && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setError(null);
              setCancelOpen(true);
            }}
          >
            {isSending ? 'Stop sending' : 'Discard draft'}
          </Button>
        )}
      </div>

      {/* Why the Send button is disabled, in text rather than only in a title
          attribute — a title is invisible to touch and to most screen readers,
          and "the button is greyed out and I don't know why" is the single most
          common way an admin gets stuck on a console like this. */}
      {isDraft && (killed || isPromotional || !hasTest) && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          {killed
            ? 'Sending is currently switched off by a killswitch. This broadcast can still be edited and tested.'
            : isPromotional
              ? 'Promotional broadcasts cannot be sent yet — marketing consent is not enforced and there is no unsubscribe link. Change the type to an operational notice, or wait for the consent work.'
              : 'Send yourself a test copy first, so somebody has read this exact message before it goes out.'}
        </p>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this broadcast?</DialogTitle>
            <DialogDescription>
              {reach === null
                ? 'Counting recipients…'
                : `This sends “${broadcast.subject}” to ${formatCount(reach)} people — ${BROADCAST_SEGMENT_LABEL[broadcast.segment].toLowerCase()} — by ${formatChannels(broadcast.emailEnabled, broadcast.inAppEnabled).toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Stated plainly rather than implied by the word "confirm". Every
              other destructive action in this portal can be undone by another
              admin action; this one cannot, and the dialog should not let anyone
              assume otherwise. */}
          <p className="text-sm text-[var(--color-fg)]">
            An email that has been sent cannot be recalled. Sending can be stopped part-way, but
            whatever has already left has left.
          </p>

          <div className="space-y-2">
            <Label htmlFor={confirmId}>
              {reach === null
                ? 'Recipient count unavailable'
                : `Type ${formatCount(reach)} to confirm`}
            </Label>
            <Input
              id={confirmId}
              value={confirmText}
              disabled={busy || reach === null}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={reach === null ? '' : String(reach)}
            />
            <p className="text-xs text-[var(--color-fg-muted)]">
              {reach === null
                ? 'The recipient count could not be loaded, so this send cannot be confirmed. Close this and try again.'
                : 'Typing the number is the confirmation — it is there so the size of the audience is read, not clicked past.'}
            </p>
          </div>

          {error && sendOpen && (
            <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={loading}
              disabled={!confirmMatches || busy}
              onClick={() => void post('send', 'send', 'Broadcast dispatched.')}
            >
              Send to {reach === null ? '…' : formatCount(reach)} people
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSending ? 'Stop this send?' : 'Discard this draft?'}</DialogTitle>
            <DialogDescription>
              {isSending
                ? // Names what a stop can and cannot do. "Cancel" on a send
                  // already in flight sounds like an undo, and an admin who
                  // believes it undid the send will not follow up with the
                  // people who already received it.
                  `Remaining recipients will not be sent to. The ${formatCount(broadcast.progress.sent)} already sent cannot be recalled.`
                : 'This draft will be marked cancelled. Nothing has been sent, so nobody is affected.'}
            </DialogDescription>
          </DialogHeader>

          {error && cancelOpen && (
            <p key={errorNonce} role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              disabled={busy}
              onClick={() =>
                void post(
                  'cancel',
                  'cancel',
                  isSending ? 'Sending stopped.' : 'Draft discarded.',
                )
              }
            >
              {isSending ? 'Stop sending' : 'Discard draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALWAYS mounted, text-only changes. Everything a successful action
          changes — the status pill, the counts, the button set — is re-rendered
          by router.refresh() into plain elements in no live region, and Next's
          route announcer stays silent because the pathname and <title> never
          change. Without this a dispatch completes in total silence. */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {error && !sendOpen && !cancelOpen && (
        <p
          key={errorNonce}
          role="alert"
          className="rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-fg)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
