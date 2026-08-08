// SRS §4.14.2-4.14.4 — searchable / filterable / sortable contract.

export const JOBS_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
  refresh_interval: '1s',
  analysis: {
    analyzer: {
      english_stemmed: {
        type: 'custom' as const,
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'english_stop', 'english_stemmer'],
      },
    },
    filter: {
      english_stop: { type: 'stop', stopwords: '_english_' },
      english_stemmer: { type: 'stemmer', language: 'english' },
    },
  },
};

export const JOBS_INDEX_MAPPING = {
  dynamic: 'strict' as const,
  properties: {
    id:               { type: 'long' as const },
    canonicalSlug:    { type: 'keyword' as const },

    // FR-4.14.2 — searchable
    title:            {
      type: 'text' as const,
      analyzer: 'english_stemmed',
      fields: { raw: { type: 'keyword' as const, ignore_above: 256 } },
    },
    description:      { type: 'text' as const, analyzer: 'english_stemmed' },
    shortDescription: { type: 'text' as const, analyzer: 'english_stemmed' },
    companyName:      {
      type: 'text' as const,
      analyzer: 'english_stemmed',
      fields: { raw: { type: 'keyword' as const, ignore_above: 256 } },
    },
    skills:           { type: 'text' as const, analyzer: 'english_stemmed' },

    // FR-4.14.3 — filterable
    companyId:        { type: 'long' as const },
    companySlug:      { type: 'keyword' as const },
    skillSlugs:       { type: 'keyword' as const },
    skillIds:         { type: 'long' as const },
    citySlugs:        { type: 'keyword' as const },
    cityIds:          { type: 'long' as const },
    primaryCitySlug:  { type: 'keyword' as const },
    industrySlug:     { type: 'keyword' as const },
    industryId:       { type: 'long' as const },
    functionalAreaSlug: { type: 'keyword' as const },
    status:           { type: 'keyword' as const },
    employmentType:   { type: 'keyword' as const },
    workMode:         { type: 'keyword' as const },
    minExperienceMonths: { type: 'integer' as const },
    maxExperienceMonths: { type: 'integer' as const },

    // FR-4.14.3 + 4.14.4 — sortable
    salaryMin:        { type: 'long' as const },
    salaryMax:        { type: 'long' as const },
    postedAt:         { type: 'date' as const },
    expiresAt:        { type: 'date' as const },

    // FR-4.14.7 — type-ahead via completion suggester
    title_suggest:    { type: 'completion' as const },
  },
};
