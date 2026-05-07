import { es, INDEX_ALIAS } from '../client';
import type { SuggestResult } from '../types';

// FR-4.14.7 — type-ahead via Elasticsearch completion suggester (replaces
// SRS's Meilisearch prefix search per CLAUDE.md §1).
export async function suggestJobTitles(prefix: string, size = 8): Promise<SuggestResult> {
  if (!prefix.trim()) return { suggestions: [] };

  const result = await es.search({
    index: INDEX_ALIAS.jobs,
    suggest: {
      job_titles: {
        prefix,
        completion: {
          field: 'title_suggest',
          size,
          skip_duplicates: true,
        },
      },
    },
    _source: false,
    size: 0,
  });

  const options = result.suggest?.job_titles?.[0]?.options;
  const arr = Array.isArray(options) ? options : [];
  return { suggestions: arr.map((o) => o.text) };
}
