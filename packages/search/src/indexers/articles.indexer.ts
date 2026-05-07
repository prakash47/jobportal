import { prisma } from '@jobportal/db';
import { es, INDEX_ALIAS } from '../client';
import { articleToDoc, type ArticleInput } from '../transforms/article.transform';

export async function indexArticle(articleId: number, indexName: string = INDEX_ALIAS.articles): Promise<void> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    await removeArticle(articleId, indexName);
    return;
  }
  const doc = articleToDoc(article as unknown as ArticleInput);
  await es.index({ index: indexName, id: String(articleId), document: doc, refresh: 'wait_for' });
}

export async function removeArticle(articleId: number, indexName: string = INDEX_ALIAS.articles): Promise<void> {
  await es.delete({ index: indexName, id: String(articleId), refresh: 'wait_for' }).catch((err: { meta?: { statusCode?: number } }) => {
    if (err.meta?.statusCode === 404) return;
    throw err;
  });
}

export async function bulkIndexArticles(
  articles: ArticleInput[],
  indexName: string,
): Promise<{ indexed: number; failed: number }> {
  if (articles.length === 0) return { indexed: 0, failed: 0 };
  const operations = articles.flatMap((a) => [
    { index: { _index: indexName, _id: String(a.id) } },
    articleToDoc(a),
  ]);
  const result = await es.bulk({ operations, refresh: false });
  let failed = 0;
  if (result.errors) {
    for (const item of result.items) {
      const op = item.index ?? item.create ?? item.update ?? item.delete;
      if (op?.error) failed += 1;
    }
  }
  return { indexed: articles.length - failed, failed };
}
