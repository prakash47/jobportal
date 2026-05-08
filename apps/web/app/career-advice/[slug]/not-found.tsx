import Link from 'next/link';
import { Button } from '@jobportal/ui';

export default function ArticleNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-medium text-[var(--color-fg-subtle)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
        Article not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-fg-muted)]">
        This article may have been archived or never published. Browse the latest writing
        from the editorial team.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild variant="primary">
          <Link href="/career-advice">All articles</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
