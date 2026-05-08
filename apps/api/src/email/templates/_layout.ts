// SRS §4.13.3 — shared HTML/text shell. All templates compose through here
// so the unsubscribe footer + plain-text alternate are guaranteed to exist.
// Visual style follows CLAUDE.md §2: white bg, neutral text, restrained
// blue accent, no marketing imagery, single CTA. Inter is declared in the
// font stack but Outlook strips webfonts; the fallback to system-ui keeps
// the result readable rather than landing in Times New Roman.

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutInput {
  preheader: string; // hidden one-line preview text shown by most clients
  heading: string;
  // Body paragraphs as already-escaped HTML strings. Each becomes its own
  // <p>. Pass plain text — the caller is responsible for escaping anything
  // that came from user input via `esc()`.
  bodyParagraphs: string[];
  // Optional single CTA. Templates without an action (e.g. registration
  // confirmation) leave this undefined — the layout simply omits the
  // button.
  cta?: { label: string; url: string };
  // Plain-text alternate. Built by the caller because the natural way to
  // express "the same thing without HTML" is template-specific (URL handling
  // in particular: in HTML the URL goes inside the CTA, in text it has to
  // be visible inline).
  text: string;
}

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://jobportal.com';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLayout(subject: string, input: LayoutInput): Rendered {
  const ctaBlock = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr><td>
    <a href="${esc(input.cta.url)}"
       style="display:inline-block;padding:10px 18px;background:#2557d6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">${esc(input.cta.label)}</a>
  </td></tr>
</table>`
    : '';

  const paragraphs = input.bodyParagraphs
    .map((p) => `<p style="margin:0 0 16px 0;">${p}</p>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:#111827;font-size:15px;line-height:1.55;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(input.preheader)}</span>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <tr><td>
      <div style="font-size:13px;color:#6b7280;margin-bottom:24px;letter-spacing:0.02em;">JobPortal</div>
      <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;line-height:1.35;color:#111827;">${esc(input.heading)}</h1>
      ${paragraphs}
      ${ctaBlock}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px 0;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 6px 0;">
        You received this email because you have an account on JobPortal.
      </p>
      <p style="font-size:12px;color:#6b7280;margin:0;">
        <a href="${WEB_URL}/settings/notifications" style="color:#6b7280;text-decoration:underline;">Manage notification preferences</a>
        &nbsp;·&nbsp;
        <a href="${WEB_URL}/settings/notifications?unsubscribe=1" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  // Plain-text alternate — simple footer added by us so callers don't have
  // to remember the unsubscribe link in two places.
  const text =
    input.text.trimEnd() +
    `\n\n--\nManage notification preferences: ${WEB_URL}/settings/notifications\nUnsubscribe: ${WEB_URL}/settings/notifications?unsubscribe=1\n`;

  return { subject, html, text };
}
