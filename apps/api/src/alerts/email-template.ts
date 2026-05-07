// SRS §4.5.3 + CLAUDE.md §2 — minimal alert email. Plain white background,
// Inter via system font fallback (most clients strip web fonts), single
// accent CTA. NOT a marketing newsletter — no header image, no social
// buttons, no gradients. Inline styles only because most email clients
// strip <style>.

const FONT_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export interface AlertEmailJob {
  title: string;
  companyName: string;
  canonicalSlug: string;
  primaryCity: string | null;
  salary: string | null;
}

export interface AlertEmailInput {
  alertName: string;
  jobs: AlertEmailJob[];
  // Absolute URLs because email clients can't resolve relatives.
  manageAlertsUrl: string;
  unsubscribeUrl: string;
  jobUrlPrefix: string; // e.g. https://www.jobportal.com/job
  searchUrl: string; // 'View all matches' CTA
}

export interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

const escape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildAlertEmail(input: AlertEmailInput): AlertEmail {
  const count = input.jobs.length;
  const subject =
    count === 1
      ? `1 new match for "${input.alertName}"`
      : `${count} new matches for "${input.alertName}"`;

  const rows = input.jobs
    .map((j) => {
      const meta = [j.companyName, j.primaryCity, j.salary].filter(Boolean).join(' · ');
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;">
            <a href="${escape(input.jobUrlPrefix)}/${escape(j.canonicalSlug)}"
               style="color:#111;text-decoration:none;font-weight:600;font-size:15px;">
              ${escape(j.title)}
            </a>
            <div style="color:#666;font-size:13px;margin-top:2px;">${escape(meta)}</div>
          </td>
        </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff;font-family:${FONT_STACK};color:#111;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:#fff;padding:40px 24px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="max-width:560px;">
          <tr>
            <td style="padding-bottom:8px;font-size:13px;color:#666;letter-spacing:0.04em;text-transform:uppercase;">
              JobPortal
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;font-size:20px;font-weight:600;color:#111;">
              ${escape(subject)}
            </td>
          </tr>
          <tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr>
          <tr>
            <td style="padding-top:24px;">
              <a href="${escape(input.searchUrl)}"
                 style="display:inline-block;padding:10px 18px;background:#111;color:#fff;
                        text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
                View all matches
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:40px;border-top:1px solid #eee;font-size:12px;color:#888;">
              <a href="${escape(input.manageAlertsUrl)}" style="color:#888;">Manage your alerts</a>
              &nbsp;·&nbsp;
              <a href="${escape(input.unsubscribeUrl)}" style="color:#888;">Unsubscribe from this alert</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text fallback for clients that prefer it (some users still set this).
  const textRows = input.jobs
    .map(
      (j) =>
        `- ${j.title} — ${j.companyName}${j.primaryCity ? ` (${j.primaryCity})` : ''}\n  ${input.jobUrlPrefix}/${j.canonicalSlug}`,
    )
    .join('\n\n');
  const text = [
    subject,
    '',
    textRows,
    '',
    `View all matches: ${input.searchUrl}`,
    '',
    `Manage your alerts: ${input.manageAlertsUrl}`,
    `Unsubscribe from this alert: ${input.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
