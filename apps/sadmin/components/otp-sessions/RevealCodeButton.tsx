'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@jobportal/ui';
import { formatTimeIst } from '../../lib/otp-sessions/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Reveals one live signup code, on demand.
//
// Why this is a client island and not part of the server render: the list
// deliberately never loads the plaintext code (see OtpSessionChallenge in
// lib/otp-sessions/format.ts), so the digits only exist once an admin asks for
// them — and asking is itself the audited event. POST /admin/otp-sessions/:id/
// reveal writes a ProfileAuditAction.OTP_CODE_REVEALED row naming the admin, so
// an unread page must never fire it.
//
// Why NOT lib/admin-api.ts: that helper reads the HttpOnly cookie with
// next/headers and can only run on the server, which is exactly what makes it
// unusable from a click handler. In the browser the cookie is sent by the
// browser itself, so this uses the repo's established client-mutation shape —
// `fetch` with credentials:'include' — the same as JobDecisionForm and this
// app's own LoginForm. AdminGuard on the endpoint remains the trust boundary;
// this component is UI for it, never a gate (CLAUDE.md §4).
//
// There is no router.refresh() afterwards, unlike JobDecisionForm: revealing
// changes nothing the server rendered — the list never carried the code in the
// first place — so a refresh would be a round trip that buys nothing.

interface RevealResponse {
  code: string;
  expiresAt: string;
  verifiedAt: string | null;
}

type Outcome =
  | { kind: 'code'; code: string; expiresAt: string }
  /** The code became unusable between the page render and the click. */
  | { kind: 'dead'; message: string };

interface RevealCodeButtonProps {
  challengeId: number;
  /** "email" / "mobile" — used to make this cell self-describing out of context. */
  channelNoun: string;
  /** The address or number the code was issued to, for the same reason. */
  destination: string;
}

export function RevealCodeButton({
  challengeId,
  channelNoun,
  destination,
}: RevealCodeButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const outcomeRef = useRef<HTMLSpanElement>(null);
  /** Was the button holding focus when this reveal started? Set in reveal(). */
  const takeFocus = useRef(false);

  // Put focus back once the request settles, but only if the user was standing
  // on this button when they started it.
  //
  // Two things destroy focus here and both have to be undone. `loading` disables
  // the button for the duration of the request, and a browser blurs an element
  // it disables; then a successful reveal unmounts the button entirely and
  // replaces it with the digits. Either way focus ends up on <body>, so the next
  // Tab restarts at the top of the document — past the skip link, the whole
  // sidebar and every earlier Reveal control. With up to forty of them on a page
  // (20 attempts × 2 channels) that is the difference between reading the second
  // code for the same registrant and re-traversing the page for it.
  //
  // On success focus goes to the revealed content, which is focusable only
  // programmatically (tabIndex={-1}) and so never joins the tab order: Tab from
  // there continues into the next cell. On failure the button is still mounted,
  // so focus returns to it and the retry is one keypress away.
  useEffect(() => {
    if (busy || !takeFocus.current) return;
    takeFocus.current = false;
    const target = outcome !== null ? outcomeRef.current : buttonRef.current;
    target?.focus();
  }, [busy, outcome]);

  async function reveal(): Promise<void> {
    // Asked here, before `loading` disables the button: disabling blurs it, so
    // by the time the response lands document.activeElement is already <body>
    // and the question can no longer be answered.
    takeFocus.current = document.activeElement === buttonRef.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/otp-sessions/${challengeId}/reveal`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        // 404 is the ordinary outcome of a stale page, not a fault: finishing
        // registration deletes the verified pair and the hourly purge deletes
        // long-expired rows, so the challenge this button was rendered for can
        // simply be gone. Saying "request failed" would send an admin looking
        // for a problem that is really just a completed signup.
        const message =
          res.status === 404
            ? 'That code no longer exists — the signup either finished or was cleaned up. Ask them to start again.'
            : res.status === 401
              ? 'Your session has expired. Sign in again.'
              : typeof body?.message === 'string'
                ? body.message
                : `Request failed (${res.status})`;
        throw new Error(message);
      }

      const data = (await res.json()) as RevealResponse;

      // The page is server-rendered and does not refresh itself, so its idea of
      // "live" is as old as the tab. The response carries two of the facts that
      // can have changed since — expiresAt and verifiedAt — and both are
      // re-checked HERE, against the browser's clock at click time. Withholding
      // the digits is a UI decision, not a secrecy boundary — the code is
      // already in this response either way — but reading out a dead code costs
      // a phone call and a retry, which is the precise failure this surface
      // exists to avoid.
      //
      // The third way a code dies — five wrong entries burning its attempt
      // budget — is NOT re-checked here, because the reveal endpoint does not
      // return `attempts`. The server render does catch it (a burnt challenge
      // shows "Too many attempts" and no Reveal control at all), so this only
      // leaves a code burnt AFTER the page was rendered, which is what the
      // page's "reload before relaying" line is for.
      //
      // Loose `!= null` deliberately: a JSON body that OMITS a null field is an
      // ordinary serialiser outcome, and a strict `!== null` would read the
      // resulting `undefined` as a timestamp and mark every live code as already
      // verified — failing closed on every row.
      if (data.verifiedAt != null) {
        setOutcome({
          kind: 'dead',
          message: 'Already verified — there is nothing left to relay on this channel.',
        });
      } else if (new Date(data.expiresAt).getTime() <= Date.now()) {
        setOutcome({
          kind: 'dead',
          message: 'This code expired before it could be read. Ask them to request a new one.',
        });
      } else {
        setOutcome({ kind: 'code', code: data.code, expiresAt: data.expiresAt });
      }
    } catch (err) {
      // A dead API or a blocked origin arrives as a TypeError rather than a
      // response, and naming the URL turns "something went wrong" into something
      // actionable — the same handling LoginForm applies for the same case.
      setError(
        err instanceof TypeError
          ? `Could not reach the API at ${API_URL}.`
          : err instanceof Error && err.message
            ? err.message
            : 'Could not reveal the code.',
      );
    } finally {
      setBusy(false);
    }
  }

  // The live region wraps the control and is mounted from the first render, so
  // the swap from button to digits is announced. A role="status" element created
  // at the same moment as its content is not reliably read out, which is exactly
  // what would happen if this span only appeared once a code arrived. The
  // announcement is what tells a screen-reader user the digits arrived rather
  // than that a control simply vanished — it is still the only signal when the
  // reveal was a mouse click that never moved focus onto the button (Safari
  // does not focus buttons on click), which is why it is kept alongside the
  // focus move rather than replaced by it.
  //
  // The replacement content carries tabIndex={-1} so the effect above can put
  // focus on it: programmatically focusable, never in the tab order. Focus
  // landing inside a live region can make a screen reader read the digits twice
  // — once from the announcement, once from the focus change — which is a much
  // smaller cost than dropping a staff member's caret to <body> mid-call.
  return (
    <span className="block">
      <span role="status" className="block">
        {outcome === null ? (
          // `loading` already disables the button (see Button's isDisabled), so
          // there is no separate `disabled` prop to keep in step with it.
          <Button ref={buttonRef} variant="secondary" size="sm" onClick={reveal} loading={busy}>
            Reveal
            {/* Every live code offers a "Reveal"; a screen-reader user listing
                the page's controls otherwise hears the same bare word up to
                forty times (20 attempts × 2 channels). */}
            <span className="sr-only">
              {' '}
              {channelNoun} code for {destination}
            </span>
          </Button>
        ) : (
          <span
            ref={outcomeRef}
            tabIndex={-1}
            className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {/* The button's disambiguator disappears with the button, so the
                same context is repeated here: focus (or the announcement)
                otherwise lands on six bare digits with nothing saying whose
                they are, on a page carrying up to forty of them. */}
            <span className="sr-only">
              {channelNoun} code for {destination}:{' '}
            </span>
            {outcome.kind === 'code' ? (
              <>
                <span className="block font-medium tabular-nums tracking-[0.15em] text-[var(--color-fg)]">
                  {outcome.code}
                </span>
                {/* Absolute, never a countdown. This tab may sit open for an
                    hour, and nothing here re-renders on a timer, so a relative
                    figure computed once at reveal would still read "in 14
                    minutes" long after the code died. */}
                <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                  Expires {formatTimeIst(outcome.expiresAt)}
                </span>
              </>
            ) : (
              <span className="block text-xs text-[var(--color-fg-muted)]">{outcome.message}</span>
            )}
          </span>
        )}
      </span>

      {error !== null && (
        // Raw --color-danger was measured at 4.41:1 on the elevated card and
        // 4.02:1 once a row hovers to bg-muted — the two surfaces this cell sits
        // on, and both under the 4.5:1 AA floor for 12px text. Mixing in 30% of
        // --color-fg darkens it on light and lightens it on dark, so it stays
        // theme-aware without touching the shared theme.css. Same expression and
        // same measurements as the employer list's DANGER_TEXT, which is where
        // they were taken.
        <span
          role="alert"
          className="mt-1 block text-xs text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]"
        >
          {error}
        </span>
      )}
    </span>
  );
}
