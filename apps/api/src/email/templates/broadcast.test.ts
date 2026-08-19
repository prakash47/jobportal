import { describe, expect, it } from 'vitest';
import { renderBroadcast, toParagraphs } from './broadcast';

describe('toParagraphs', () => {
  it('splits on blank lines and keeps single newlines as line breaks', () => {
    // An admin writes a maintenance notice in a textarea and expects its shape
    // to survive. Without this a three-paragraph announcement arrives as one
    // wall of text — the sort of thing only noticed after it reached everybody.
    expect(toParagraphs('One.\n\nTwo.\nStill two.')).toEqual(['One.', 'Two.<br>Still two.']);
  });

  it('drops empty paragraphs from ragged spacing', () => {
    expect(toParagraphs('A.\n\n\n\n   \n\nB.')).toEqual(['A.', 'B.']);
  });

  it('normalises CRLF, so a paste from Windows is not one paragraph', () => {
    expect(toParagraphs('A.\r\n\r\nB.')).toEqual(['A.', 'B.']);
  });

  it('ESCAPES the admin-authored body', () => {
    // renderLayout treats bodyParagraphs as already-escaped RAW HTML (its own
    // comment says so), so an un-escaped value would put admin-typed markup into
    // an email addressed to every user on the platform.
    expect(toParagraphs('<script>alert(1)</script>')).toEqual([
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    ]);
    expect(toParagraphs('Fish & chips')).toEqual(['Fish &amp; chips']);
  });
});

describe('renderBroadcast', () => {
  const base = { subject: 'Scheduled maintenance', body: 'We are down 02:00 to 04:00 IST.' };

  it('produces both an HTML and a plain-text alternate', () => {
    const out = renderBroadcast(base);
    expect(out.subject).toBe('Scheduled maintenance');
    expect(out.html).toContain('We are down 02:00 to 04:00 IST.');
    expect(out.text).toContain('We are down 02:00 to 04:00 IST.');
  });

  it('omits the CTA block entirely when there is no CTA', () => {
    const out = renderBroadcast(base);
    expect(out.html).not.toContain('display:inline-block;padding:10px 18px');
  });

  it('renders a CTA button and repeats the URL in the text alternate', () => {
    // In HTML the URL hides inside the button; in plain text it has to be
    // visible inline or the CTA is unreachable for that reader.
    const out = renderBroadcast({
      ...base,
      cta: { label: 'Status page', url: 'https://careerqueue.in/status' },
    });
    expect(out.html).toContain('https://careerqueue.in/status');
    expect(out.html).toContain('Status page');
    expect(out.text).toContain('Status page: https://careerqueue.in/status');
  });

  it('escapes markup in the subject as well as the body', () => {
    const out = renderBroadcast({ subject: '<b>Down</b>', body: 'x' });
    expect(out.html).toContain('&lt;b&gt;Down&lt;/b&gt;');
    expect(out.html).not.toContain('<b>Down</b>');
  });

  it('builds the preheader from the UNESCAPED body so an entity is never cut in half', () => {
    // esc() expands one character into up to six (& -> &amp;), so slicing after
    // escaping can leave a fragment like "&am" in the inbox preview line.
    const body = `${'a'.repeat(135)} R&D update continues here`;
    const out = renderBroadcast({ subject: 'S', body });
    expect(out.html).not.toContain('&am&');
    // The preheader is escaped by renderLayout, so a whole entity survives.
    expect(out.html).toContain('&amp;');
  });

  it('truncates a long preheader with an ellipsis rather than dumping the whole body', () => {
    const out = renderBroadcast({ subject: 'S', body: 'x'.repeat(400) });
    // The preheader span is the first element in the body.
    const preheader = out.html.split('mso-hide:all;">')[1]?.split('</span>')[0] ?? '';
    expect(preheader.length).toBeLessThanOrEqual(140);
    expect(preheader.endsWith('…')).toBe(true);
  });

  it('keeps the unsubscribe footer the shared layout guarantees', () => {
    // An operational broadcast is transactional-class and carries exactly the
    // same footer as every other email in the product — consistent by design
    // rather than by omission.
    const out = renderBroadcast(base);
    expect(out.html).toContain('Manage notification preferences');
    expect(out.text).toContain('Manage notification preferences');
  });
});
