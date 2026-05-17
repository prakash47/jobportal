import { ArticleCard } from '../career-advice/ArticleCard';
import type { RecentArticle } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';

interface Props {
  articles: RecentArticle[];
}

// Reuses the same ArticleCard the /career-advice index uses — visual
// consistency is the point. Three articles max keeps the row clean across
// breakpoints (1/2/3 cols).

export function RecentArticles({ articles }: Props) {
  if (articles.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Editorial"
        title="From the JobPortal team"
        description="Practical writing on resumes, interviews, salary, and getting hired."
        cta={{ label: 'All articles', href: '/career-advice' }}
      />
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <li key={a.slug}>
            <ArticleCard {...a} />
          </li>
        ))}
      </ul>
    </section>
  );
}
