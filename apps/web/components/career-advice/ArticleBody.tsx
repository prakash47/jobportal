// Renders the pre-computed HTML output from lib/cms/markdown into a measured
// ~70ch reading column. CLAUDE.md §2 + the Stripe-blog reference: restraint,
// generous spacing, typography hierarchy via weight + size only.
//
// We use dangerouslySetInnerHTML because the HTML has already been sanitised
// by rehype-sanitize in the markdown pipeline — see lib/cms/markdown.ts.

export interface ArticleBodyProps {
  html: string;
}

export function ArticleBody({ html }: ArticleBodyProps) {
  return (
    <article
      // eslint-disable-next-line react/no-danger -- sanitised in lib/cms/markdown
      dangerouslySetInnerHTML={{ __html: html }}
      className={[
        'prose-article',
        // Measured line length — caps at ~70ch via max-w. 17px text gives a
        // calmer cadence than the default 16px on a long-form page.
        'max-w-[70ch] text-[17px] leading-7 text-[var(--color-fg)]',
        // Light vertical rhythm. We use direct-child selectors so nested
        // lists don't double up the spacing.
        '[&>*+*]:mt-5',
        '[&>h2]:mt-10 [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:tracking-tight',
        '[&>h3]:mt-8 [&>h3]:text-xl [&>h3]:font-semibold',
        '[&>h4]:mt-6 [&>h4]:font-semibold',
        '[&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6',
        '[&>blockquote]:border-l-2 [&>blockquote]:border-[var(--color-border-strong)] [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-[var(--color-fg-muted)]',
        '[&>pre]:overflow-x-auto [&>pre]:rounded-md [&>pre]:border [&>pre]:border-[var(--color-border)] [&>pre]:p-4 [&>pre]:text-sm [&>pre]:leading-6',
        // Inline code (not inside <pre>): subtle background.
        '[&_code:not(pre_code)]:rounded [&_code:not(pre_code)]:bg-[var(--color-bg-muted)] [&_code:not(pre_code)]:px-1.5 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-[0.9em]',
        '[&_a]:text-[var(--color-primary-600)] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline',
        '[&_img]:rounded-md [&_img]:border [&_img]:border-[var(--color-border)]',
        '[&>table]:w-full [&>table]:border-collapse',
        '[&_th]:border-b [&_th]:border-[var(--color-border-strong)] [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold',
        '[&_td]:border-b [&_td]:border-[var(--color-border)] [&_td]:p-2',
      ].join(' ')}
    />
  );
}
