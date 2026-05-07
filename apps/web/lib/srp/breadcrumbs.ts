import type { BreadcrumbEntry } from '../seo/json-ld';

function origin(): string {
  return process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
}

export function homeOnly(): BreadcrumbEntry[] {
  return [{ name: 'Home', url: `${origin()}/` }];
}

export function skillBreadcrumb(skillName: string, skillSlug: string): BreadcrumbEntry[] {
  return [
    { name: 'Home', url: `${origin()}/` },
    { name: `${skillName} jobs`, url: `${origin()}/${skillSlug}-jobs` },
  ];
}

export function cityBreadcrumb(cityNames: string[], canonicalPath: string): BreadcrumbEntry[] {
  const label =
    cityNames.length === 1 ? `Jobs in ${cityNames[0]}` : `Jobs in ${cityNames.join(', ')}`;
  return [
    { name: 'Home', url: `${origin()}/` },
    { name: label, url: `${origin()}${canonicalPath}` },
  ];
}

export function skillCityBreadcrumb(
  skillName: string,
  skillSlug: string,
  cityNames: string[],
  canonicalPath: string,
): BreadcrumbEntry[] {
  const cityLabel =
    cityNames.length === 1 ? `Jobs in ${cityNames[0]}` : `Jobs in ${cityNames.join(', ')}`;
  return [
    { name: 'Home', url: `${origin()}/` },
    { name: `${skillName} jobs`, url: `${origin()}/${skillSlug}-jobs` },
    { name: cityLabel, url: `${origin()}${canonicalPath}` },
  ];
}
