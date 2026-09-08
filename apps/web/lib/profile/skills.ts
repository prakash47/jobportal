export interface SkillEntry {
  id: number;
  slug: string;
  name: string;
  category: string | null;
}

/** Matches MAX_SKILLS in apps/api/src/profile/skills.service.ts. */
export const MAX_SKILLS = 50;

/**
 * Display names for `Skill.category`, and the order they are shown in.
 *
 * The stored values are bare lowercase tags ("soft", "ml") that were never
 * meant to be read by a user. Ordering is deliberate rather than alphabetical:
 * a candidate looks for their language and framework first, and the reported
 * complaint was that the list is "mostly all IT technical skills" — so the
 * non-technical group is named plainly and is not buried at the bottom.
 */
export const CATEGORY_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'language', label: 'Languages' },
  { key: 'framework', label: 'Frameworks' },
  { key: 'database', label: 'Databases' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'tool', label: 'Tools' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'ml', label: 'Data & ML' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'soft', label: 'Soft skills' },
];

const OTHER = 'Other';

export function categoryLabel(category: string | null): string {
  if (category === null) return OTHER;
  return CATEGORY_LABELS.find((c) => c.key === category)?.label ?? OTHER;
}

export interface SkillGroup {
  label: string;
  skills: SkillEntry[];
}

/**
 * Group skills into labelled sections, in CATEGORY_LABELS order with anything
 * unrecognised collected under "Other" at the end. Empty groups are dropped so
 * a filtered search never renders a heading with nothing beneath it.
 */
export function groupByCategory(skills: SkillEntry[]): SkillGroup[] {
  const buckets = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const label = categoryLabel(skill.category);
    const bucket = buckets.get(label);
    if (bucket) bucket.push(skill);
    else buckets.set(label, [skill]);
  }

  const groups: SkillGroup[] = [];
  for (const { label } of CATEGORY_LABELS) {
    const skillsInGroup = buckets.get(label);
    if (skillsInGroup && skillsInGroup.length > 0) {
      groups.push({ label, skills: skillsInGroup });
      buckets.delete(label);
    }
  }
  // Whatever is left keeps its own label, "Other" last.
  for (const [label, skillsInGroup] of buckets) {
    if (label !== OTHER && skillsInGroup.length > 0) groups.push({ label, skills: skillsInGroup });
  }
  const other = buckets.get(OTHER);
  if (other && other.length > 0) groups.push({ label: OTHER, skills: other });
  return groups;
}

export function searchSkills(catalogue: SkillEntry[], query: string): SkillEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: SkillEntry[] = [];
  const contains: SkillEntry[] = [];
  for (const skill of catalogue) {
    const name = skill.name.toLowerCase();
    if (name.startsWith(q)) starts.push(skill);
    else if (name.includes(q)) contains.push(skill);
  }
  return [...starts, ...contains];
}

/**
 * The same normalisation the API applies (`slugifySkill`), duplicated here so
 * the UI can tell whether a typed name ALREADY exists in the catalogue.
 *
 * Without it, typing "React.js" when "react-js" is already listed would offer
 * to add a duplicate, and the server would silently resolve it to the existing
 * row — leaving the user staring at a button that appeared to do nothing.
 */
export function slugifySkill(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Can the typed text be added as a new skill?
 *
 * Returns the catalogue entry when the name already exists (so the caller can
 * select it instead of creating a duplicate), or null when it is genuinely new.
 */
export function resolveTypedSkill(
  catalogue: SkillEntry[],
  query: string,
): { kind: 'empty' } | { kind: 'existing'; skill: SkillEntry } | { kind: 'new'; name: string } {
  const name = query.trim();
  if (!name) return { kind: 'empty' };
  const slug = slugifySkill(name);
  if (!slug) return { kind: 'empty' };
  const existing = catalogue.find(
    (s) => s.slug === slug || s.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return { kind: 'existing', skill: existing };
  return { kind: 'new', name };
}
