export const ARTICLES_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
};

export const ARTICLES_INDEX_MAPPING = {
  dynamic: 'strict' as const,
  properties: {
    id:            { type: 'long' as const },
    slug:          { type: 'keyword' as const },
    title:         {
      type: 'text' as const,
      fields: { raw: { type: 'keyword' as const, ignore_above: 256 } },
    },
    body:          { type: 'text' as const },
    excerpt:       { type: 'text' as const },
    authorName:    { type: 'keyword' as const },
    status:        { type: 'keyword' as const },
    publishedAt:   { type: 'date' as const },
    title_suggest: { type: 'completion' as const },
  },
};
