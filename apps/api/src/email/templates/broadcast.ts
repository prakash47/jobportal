import { esc, renderLayout, type Rendered } from './_layout';

/**
 * An admin-authored platform announcement (/sadmin/broadcasts).
 *
 * ⚠ THIS IS THE ONE TEMPLATE THAT IS DELIBERATELY NOT IN `templates/index.ts`.
 * Every other template is a `TemplateKind` in the `transactional-emails` queue's
 * discriminated union. A broadcast is not, because it does not travel through
 * that queue: that worker runs at BullMQ's default concurrency of 1 with no
 * rate limiter, so routing a platform-wide send through it would deliver one
 * email at a time AND head-of-line block every password reset, verification code
 * and apply confirmation behind the campaign. Broadcasts have their own queue,
 * so they need their own render entry point rather than a union arm nothing
 * would ever dispatch.
 *
 * The consequence to keep in mind: adding a kind to `TemplateMap` is what forces
 * a `PREFERENCE_GATE` decision at compile time, and this template gets no such
 * prompt. That gate is not skipped, it is made explicitly in the broadcast
 * service — OPERATIONAL sends ungated (transactional-class, like a password
 * reset), and PROMOTIONAL cannot send at all until the consent rails exist.
 *
 * The body arrives as PLAIN TEXT and every part of it is `esc()`'d here.
 * `renderLayout` treats `bodyParagraphs` as already-escaped raw HTML, so an
 * un-escaped value would put admin-typed markup into an email addressed to every
 * user on the platform.
 */
export interface BroadcastEmailPayload {
  subject: string;
  /** Plain text. Blank lines separate paragraphs; single newlines become <br>. */
  body: string;
  cta?: { label: string; url: string };
}

/**
 * Split plain text into paragraphs on blank lines, preserving single newlines as
 * line breaks within a paragraph.
 *
 * Exported for the unit test. An admin composing a maintenance notice writes in
 * a textarea and expects the shape of what they typed to survive: without this,
 * a three-paragraph announcement arrives as one wall of text, which is precisely
 * the sort of thing that is only noticed after it has reached everybody.
 */
export function toParagraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => esc(p).replace(/\n/g, '<br>'));
}

export function renderBroadcast(payload: BroadcastEmailPayload): Rendered {
  const paragraphs = toParagraphs(payload.body);

  // The preheader is the one-line preview most clients show beside the subject.
  // Built from the first paragraph rather than restating the subject, which
  // would waste the only line of context the reader gets in their inbox list.
  //
  // Sliced from the UNESCAPED body: `esc()` expands one character into up to six
  // (`&` → `&amp;`), so slicing after escaping can cut an entity in half and
  // leave `&am` in the preview. renderLayout escapes the preheader itself.
  const firstPlain = payload.body.replace(/\r\n/g, '\n').split(/\n\s*\n/)[0]?.trim() ?? '';
  const preheader = firstPlain.length > 140 ? `${firstPlain.slice(0, 139)}…` : firstPlain;

  const text = [
    payload.subject,
    '',
    payload.body.trim(),
    ...(payload.cta ? ['', `${payload.cta.label}: ${payload.cta.url}`] : []),
  ].join('\n');

  return renderLayout(payload.subject, {
    preheader,
    heading: payload.subject,
    bodyParagraphs: paragraphs,
    // Spread rather than `cta: payload.cta` — tsconfig sets
    // exactOptionalPropertyTypes, under which assigning an explicit `undefined`
    // to an optional property is a type error.
    ...(payload.cta ? { cta: payload.cta } : {}),
    text,
  });
}
