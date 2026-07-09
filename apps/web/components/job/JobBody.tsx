// Renders the recruiter's job description. When a Markdown body is present
// (Post a Job Phase 4) it is rendered through the shared, sanitized article
// pipeline (rehype-sanitize — no raw HTML/scripts). Legacy jobs have no
// Markdown and fall back to the original plain-text paragraph render, so this
// change is zero-regression for existing postings.

import { renderArticleMarkdown } from '../../lib/cms/markdown';

export interface JobBodyProps {
  description: string;
  descriptionMarkdown?: string | null;
}

const PROSE =
  'text-[15px] leading-relaxed text-[var(--color-fg)] ' +
  '[&_p]:my-3 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-base ' +
  '[&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-medium [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold ' +
  '[&_a]:text-[var(--color-primary-600)] [&_a]:underline';

export async function JobBody({ description, descriptionMarkdown }: JobBodyProps) {
  const md = descriptionMarkdown?.trim();

  if (md) {
    const html = await renderArticleMarkdown(md);
    return (
      <section aria-label="Job description" className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">About the role</h2>
        <div className={PROSE} dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    );
  }

  const paragraphs = description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <section aria-label="Job description" className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">About the role</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-[var(--color-fg)]">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
