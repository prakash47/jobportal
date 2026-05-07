export const COMPANIES_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
};

export const COMPANIES_INDEX_MAPPING = {
  dynamic: 'strict' as const,
  properties: {
    id:                   { type: 'long' as const },
    slug:                 { type: 'keyword' as const },
    name:                 {
      type: 'text' as const,
      fields: { raw: { type: 'keyword' as const, ignore_above: 256 } },
    },
    description:          { type: 'text' as const },
    industrySlug:         { type: 'keyword' as const },
    industryId:           { type: 'long' as const },
    headquartersCitySlug: { type: 'keyword' as const },
    headquartersCityId:   { type: 'long' as const },
    logoUrl:              { type: 'keyword' as const, index: false },
    websiteUrl:           { type: 'keyword' as const, index: false },
    name_suggest:         { type: 'completion' as const },
  },
};
