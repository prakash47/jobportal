import { es, INDEX_ALIAS } from '../client';
import { JOBS_INDEX_MAPPING, JOBS_INDEX_SETTINGS } from './jobs.index';
import { COMPANIES_INDEX_MAPPING, COMPANIES_INDEX_SETTINGS } from './companies.index';
import { ARTICLES_INDEX_MAPPING, ARTICLES_INDEX_SETTINGS } from './articles.index';

type IndexSpec = {
  alias: string;
  settings: Record<string, unknown>;
  mapping: Record<string, unknown>;
};

const SPECS: IndexSpec[] = [
  { alias: INDEX_ALIAS.jobs, settings: JOBS_INDEX_SETTINGS, mapping: JOBS_INDEX_MAPPING },
  { alias: INDEX_ALIAS.companies, settings: COMPANIES_INDEX_SETTINGS, mapping: COMPANIES_INDEX_MAPPING },
  { alias: INDEX_ALIAS.articles, settings: ARTICLES_INDEX_SETTINGS, mapping: ARTICLES_INDEX_MAPPING },
];

// Idempotent: if the alias already points at a versioned index, do nothing.
// Otherwise create `<alias>-v1` with the right mapping and point the alias at it.
export async function bootstrapIndexes(): Promise<void> {
  for (const spec of SPECS) {
    const aliasExists = await es.indices.existsAlias({ name: spec.alias });
    if (aliasExists) {
      console.log(`[bootstrap] alias "${spec.alias}" already exists — skipping`);
      continue;
    }
    const indexName = `${spec.alias}-v1`;
    const indexExists = await es.indices.exists({ index: indexName });
    if (!indexExists) {
      await es.indices.create({
        index: indexName,
        settings: spec.settings,
        mappings: spec.mapping,
      });
      console.log(`[bootstrap] created index "${indexName}"`);
    }
    await es.indices.updateAliases({
      actions: [{ add: { index: indexName, alias: spec.alias } }],
    });
    console.log(`[bootstrap] alias "${spec.alias}" → "${indexName}"`);
  }
}

// Used by the reindex script to figure out the next version number.
export async function resolveCurrentIndexFor(alias: string): Promise<string | null> {
  const exists = await es.indices.existsAlias({ name: alias });
  if (!exists) return null;
  const aliasInfo = await es.indices.getAlias({ name: alias });
  const indexNames = Object.keys(aliasInfo);
  return indexNames[0] ?? null;
}

export function nextVersionedIndex(alias: string, currentIndex: string | null): string {
  if (!currentIndex) return `${alias}-v1`;
  const m = currentIndex.match(/-v(\d+)$/);
  const n = m ? parseInt(m[1]!, 10) + 1 : 1;
  return `${alias}-v${n}`;
}
