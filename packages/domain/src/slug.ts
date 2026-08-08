// SRS §6.1 URL Slug Taxonomy:
//   1. Lowercase only
//   2. Hyphen-separated words
//   3. Numeric ID at the end (slug can drift; permalink stays)
//   4. Multi-value paths use "-and-" (sorted alphabetically)
//   5. No trailing slash

export type ParsedJobSlug = { slug: string; id: number };

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Every `id` column in this schema is a Prisma `Int` (Postgres int4). A slug
// carrying a larger number is not a slug for some far-future row — it is
// unparseable, because no row can ever have that id. Rejecting it HERE rather
// than downstream is what keeps `/job/x-2147483648` a 404 instead of a 500:
// the regex happily matches any run of digits, and handing the result to
// Prisma makes findUnique THROW rather than return null.
//
// Shared, so it fixes the website and the API together — the SSR pages and
// GET /v1/jobs/:slug both funnel through these parsers. All three parsers use
// it; company and working-at slugs had the identical hole.
const MAX_INT32 = 2_147_483_647;

function isUsableId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= MAX_INT32;
}

// "sales-executive-acme-12345" → { slug: "sales-executive-acme", id: 12345 }
export function parseJobSlug(input: string): ParsedJobSlug | null {
  const m = input.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (!isUsableId(id)) return null;
  return { slug: m[1]!, id };
}

export function buildJobSlug(opts: { title: string; id: number }): string {
  return `${slugify(opts.title)}-${opts.id}`;
}

// "infosys-overview-13832" → { slug: "infosys", id: 13832 }
// "tata-consultancy-services-overview-2114" → { slug: "tata-consultancy-services", id: 2114 }
export function parseCompanySlug(input: string): ParsedJobSlug | null {
  const m = input.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)-overview-(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (!isUsableId(id)) return null;
  return { slug: m[1]!, id };
}

export function buildCompanySlug(opts: { name: string; id: number }): string {
  return `${slugify(opts.name)}-overview-${opts.id}`;
}

// "working-at-tcs-2114" → { slug: "tcs", id: 2114 }
export function parseWorkingAtSlug(input: string): ParsedJobSlug | null {
  const m = input.match(/^working-at-([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (!isUsableId(id)) return null;
  return { slug: m[1]!, id };
}

export function buildWorkingAtSlug(opts: { name: string; id: number }): string {
  return `working-at-${slugify(opts.name)}-${opts.id}`;
}

// "jobs-in-mumbai-and-pune-and-bangalore" → ["mumbai", "pune", "bangalore"] (preserves input order)
// "jobs-in-bangalore" → ["bangalore"]
// Returns null if the prefix doesn't match.
export function parseMultiCitySlug(input: string): string[] | null {
  if (!input.startsWith('jobs-in-')) return null;
  const rest = input.slice('jobs-in-'.length);
  if (!rest) return null;
  const cities = rest.split('-and-');
  if (cities.some((c) => c.length === 0 || !/^[a-z0-9-]+$/.test(c))) return null;
  return cities;
}

// ["pune", "mumbai", "bangalore"] → "jobs-in-bangalore-and-mumbai-and-pune"
export function buildMultiCitySlug(cities: string[]): string {
  if (cities.length === 0) throw new Error('buildMultiCitySlug requires at least one city');
  const sorted = [...cities].sort();
  return `jobs-in-${sorted.join('-and-')}`;
}

// "{skill}-jobs-in-{city}" patterns. Skills can be multi-word, cities can too.
// "python-jobs-in-pune" → { skill: "python", cities: ["pune"] }
// "machine-learning-jobs-in-bangalore-and-pune" → { skill: "machine-learning", cities: ["bangalore", "pune"] }
export function parseSkillJobsInCitySlug(
  input: string,
): { skill: string; cities: string[] } | null {
  // The string must contain `-jobs-in-`. Skill is everything before it; cities are after.
  const idx = input.indexOf('-jobs-in-');
  if (idx <= 0) return null;
  const skill = input.slice(0, idx);
  const citiesPart = input.slice(idx + '-jobs-in-'.length);
  if (!skill || !citiesPart) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) return null;
  const cities = citiesPart.split('-and-');
  if (cities.some((c) => c.length === 0 || !/^[a-z0-9-]+$/.test(c))) return null;
  return { skill, cities };
}
