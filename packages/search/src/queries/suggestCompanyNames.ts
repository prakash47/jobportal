import { es, INDEX_ALIAS } from '../client';
import type { SuggestResult } from '../types';

export async function suggestCompanyNames(prefix: string, size = 8): Promise<SuggestResult> {
  if (!prefix.trim()) return { suggestions: [] };

  const result = await es.search({
    index: INDEX_ALIAS.companies,
    suggest: {
      company_names: {
        prefix,
        completion: {
          field: 'name_suggest',
          size,
          skip_duplicates: true,
        },
      },
    },
    _source: false,
    size: 0,
  });

  const options = result.suggest?.company_names?.[0]?.options;
  const arr = Array.isArray(options) ? options : [];
  return { suggestions: arr.map((o) => o.text) };
}
