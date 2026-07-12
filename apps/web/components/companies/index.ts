export { CompanyAbout, type CompanyAboutProps } from './CompanyAbout';
export { CompanyCard, type CompanyCardProps } from './CompanyCard';
// NB: CompanyFilters + IndustryShowcase are 'use client' and are deep-imported
// directly by app/companies/page.tsx (not re-exported here) so this barrel — which
// also carries Prisma-importing server components — never risks pulling server
// code into a client bundle.
export { CompanyHero, type CompanyHeroProps } from './CompanyHero';
export { CompanyLogo, type CompanyLogoProps } from './CompanyLogo';
export { CompanyOpenings } from './CompanyOpenings';
export { CompanyReviews } from './CompanyReviews';
export { IndustryFilter, type IndustryFilterProps } from './IndustryFilter';
export { RatingStars, type RatingStarsProps } from './RatingStars';
