// Shapes returned by the admin-jobs endpoints in apps/api.
//
// Declared here rather than imported: apps/sadmin does not depend on apps/api
// (they are separate deployables), and @jobportal/types is an empty stub today.
// The existing admin console pages in apps/web mirror their API types by hand
// the same way — see app/admin/kyc-review/page.tsx.

export interface JobReviewListItem {
  id: number;
  canonicalSlug: string;
  title: string;
  status: string;
  postedAt: string;
  submittedForReviewAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  company: { id: number; name: string; slug: string } | null;
  postedBy: { id: number; name: string | null; email: string } | null;
  primaryCity: { name: string } | null;
}

export interface JobReviewList {
  hits: JobReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobReviewDetail {
  id: number;
  canonicalSlug: string;
  title: string;
  description: string;
  descriptionMarkdown: string | null;
  shortDescription: string | null;
  status: string;
  employmentType: string;
  workMode: string;
  jobType: string;
  postedAt: string;
  expiresAt: string | null;
  submittedForReviewAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  openings: number | null;
  qualifications: string | null;
  company: {
    id: number;
    name: string;
    slug: string;
    websiteUrl: string | null;
    logoUrl: string | null;
  } | null;
  postedBy: { id: number; name: string | null; email: string } | null;
  primaryCity: { name: string } | null;
  locality: { name: string } | null;
  industry: { name: string } | null;
  functionalArea: { name: string } | null;
  skills: string[];
  cities: string[];
  companyKycStatus: string;
}
