export { CompanyAbout, type CompanyAboutProps } from './CompanyAbout';
export { CompanyCard, type CompanyCardProps } from './CompanyCard';
// NB: CompanyFilters + IndustryShowcase are 'use client' and are deep-imported
// directly by app/companies/page.tsx (not re-exported here) so this barrel — which
// also carries Prisma-importing server components — never risks pulling server
// code into a client bundle. Same rule applies to the company-profile client
// leaves: CompanyShareButton + CompanyProfileNav are deep-imported by their
// parents, not routed through this barrel.
export { CompanyHero, type CompanyHeroProps } from './CompanyHero';
export { CompanyHighlights, parseHighlightSections, type HighlightSection } from './CompanyHighlights';
export { CompanyHiringRail, type CompanyHiringRailProps } from './CompanyHiringRail';
export { CompanyLogo, type CompanyLogoProps } from './CompanyLogo';
export { CompanyOpenings } from './CompanyOpenings';
export { CompanyProfileHero, type CompanyProfileHeroProps } from './CompanyProfileHero';
export { CompanyQuickFacts, type CompanyQuickFactsProps } from './CompanyQuickFacts';
export { CompanyReviews, type CompanyReviewsProps } from './CompanyReviews';
export { CompanyStatStrip, type CompanyStatStripProps } from './CompanyStatStrip';
export { IndustryFilter, type IndustryFilterProps } from './IndustryFilter';
export { RatingStars, type RatingStarsProps } from './RatingStars';
export {
  RelatedCompanies,
  type RelatedCompany,
  type RelatedCompaniesProps,
} from './RelatedCompanies';
export { VerifiedBadge } from './VerifiedBadge';
