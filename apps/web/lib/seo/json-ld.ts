// Typed builders for the Schema.org JSON-LD types we render. Each fn returns a
// plain object suitable for JSON.stringify; the <JsonLd /> component below
// renders it inside <script type="application/ld+json">.

type SchemaContext = { '@context': 'https://schema.org' };

// ItemList — used on every SRP and category landing (SRS §6 / §4.1.6).
export type ItemListEntry = { name: string; url: string };

export function itemList(opts: { name: string; items: ItemListEntry[] }) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'ItemList' as const,
    name: opts.name,
    itemListElement: opts.items.map((item, i) => ({
      '@type': 'ListItem' as const,
      position: i + 1,
      url: item.url,
      name: item.name,
    })),
  };
}

// BreadcrumbList — sitelinks (SRS §6).
export type BreadcrumbEntry = { name: string; url: string };

export function breadcrumbList(crumbs: BreadcrumbEntry[]) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'BreadcrumbList' as const,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem' as const,
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

// JobPosting — Google for Jobs spec.
// https://developers.google.com/search/docs/appearance/structured-data/job-posting
export interface JobPostingInput {
  title: string;
  description: string;          // HTML allowed by spec
  datePosted: string;           // ISO 8601
  validThrough?: string;        // ISO 8601
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'TEMPORARY' | 'INTERN' | 'VOLUNTEER' | 'PER_DIEM' | 'OTHER';
  hiringOrganization: { name: string; sameAs?: string; logo?: string };
  jobLocation?: { addressLocality: string; addressRegion?: string; addressCountry?: string };
  baseSalary?: { currency: string; minValue?: number; maxValue?: number; unitText?: 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR' };
  identifier?: { name: string; value: string };
  directApply?: boolean;
  // Months of prior experience required (Google for Jobs spec). We pass
  // months — schema.org accepts an OccupationalExperienceRequirements node.
  experienceRequirements?: { monthsOfExperience: number };
  // Canonical URL for this posting (Google recommends url for direct-apply).
  url?: string;
}

export function jobPosting(input: JobPostingInput) {
  const out: Record<string, unknown> & SchemaContext = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: input.title,
    description: input.description,
    datePosted: input.datePosted,
    hiringOrganization: {
      '@type': 'Organization',
      name: input.hiringOrganization.name,
      ...(input.hiringOrganization.sameAs ? { sameAs: input.hiringOrganization.sameAs } : {}),
      ...(input.hiringOrganization.logo ? { logo: input.hiringOrganization.logo } : {}),
    },
  };
  if (input.validThrough) out['validThrough'] = input.validThrough;
  if (input.employmentType) out['employmentType'] = input.employmentType;
  if (input.jobLocation) {
    out['jobLocation'] = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: input.jobLocation.addressLocality,
        ...(input.jobLocation.addressRegion ? { addressRegion: input.jobLocation.addressRegion } : {}),
        ...(input.jobLocation.addressCountry ? { addressCountry: input.jobLocation.addressCountry } : {}),
      },
    };
  }
  if (input.baseSalary) {
    out['baseSalary'] = {
      '@type': 'MonetaryAmount',
      currency: input.baseSalary.currency,
      value: {
        '@type': 'QuantitativeValue',
        ...(input.baseSalary.minValue !== undefined ? { minValue: input.baseSalary.minValue } : {}),
        ...(input.baseSalary.maxValue !== undefined ? { maxValue: input.baseSalary.maxValue } : {}),
        ...(input.baseSalary.unitText ? { unitText: input.baseSalary.unitText } : {}),
      },
    };
  }
  if (input.identifier) {
    out['identifier'] = {
      '@type': 'PropertyValue',
      name: input.identifier.name,
      value: input.identifier.value,
    };
  }
  if (input.directApply !== undefined) out['directApply'] = input.directApply;
  if (input.experienceRequirements) {
    out['experienceRequirements'] = {
      '@type': 'OccupationalExperienceRequirements',
      monthsOfExperience: input.experienceRequirements.monthsOfExperience,
    };
  }
  if (input.url) out['url'] = input.url;
  return out;
}

// Organization — company profile pages.
export interface OrganizationInput {
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
  description?: string;
}

export function organization(input: OrganizationInput) {
  const out: Record<string, unknown> & SchemaContext = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
  };
  if (input.logo) out['logo'] = input.logo;
  if (input.sameAs && input.sameAs.length > 0) out['sameAs'] = input.sameAs;
  if (input.description) out['description'] = input.description;
  return out;
}

// Article — career-advice posts.
export interface ArticleInput {
  headline: string;
  datePublished: string;
  dateModified?: string;
  author: { name: string; url?: string };
  image?: string | string[];
  description?: string;
  articleBody?: string;
}

export function article(input: ArticleInput) {
  const out: Record<string, unknown> & SchemaContext = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    datePublished: input.datePublished,
    author: {
      '@type': 'Person',
      name: input.author.name,
      ...(input.author.url ? { url: input.author.url } : {}),
    },
  };
  if (input.dateModified) out['dateModified'] = input.dateModified;
  if (input.image) out['image'] = input.image;
  if (input.description) out['description'] = input.description;
  if (input.articleBody) out['articleBody'] = input.articleBody;
  return out;
}

// FAQPage — career-advice posts with Q&A.
export type FaqEntry = { question: string; answer: string };

export function faqPage(entries: FaqEntry[]) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'FAQPage' as const,
    mainEntity: entries.map((e) => ({
      '@type': 'Question' as const,
      name: e.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: e.answer,
      },
    })),
  };
}
