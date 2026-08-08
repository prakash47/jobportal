// Request-scoped cache wrapper around the shared homepage loader.
//
// The queries themselves moved to `@jobportal/domain/home-queries` so
// `apps/api` can run the identical aggregate for the mobile home feed
// (ADR 0002). React's `cache()` could NOT move with them: it is RSC-only and
// inert outside a React request, so a package shared with NestJS must not
// depend on it.
//
// It stays here because it is load-bearing for the website specifically —
// several server components call `loadHomePageData()` in the same render, and
// without the dedup each one would re-run the whole 10-query aggregate.
import { cache } from 'react';
import { loadHomePageData as loadUncached } from '@jobportal/domain/home-queries';

export const loadHomePageData = cache(loadUncached);

// Types and the unit-tested hydration helper pass straight through, so every
// existing import site keeps resolving from this path.
export type {
  HomePageData,
  IndustryItem,
  PopularItem,
  RoleItem,
  FeaturedCompany,
  FeaturedJob,
  RecentArticle,
} from '@jobportal/domain/home-queries';
export { hydratePopularItems } from '@jobportal/domain/home-queries';
