// NOTE: the async, server-only components in this folder (DailyApplyIndicator →
// next/headers, RecommendedJobs → @jobportal/search + loadSrpUserContext →
// Prisma) are deliberately NOT re-exported here. This barrel mixes client
// components ('use client': ProfileForm, the *Managers) with pure presentational
// ones, so a client importer must never be able to pull a server-only transitive
// dep through it — Turbopack drags the whole chain into the client bundle and
// the build breaks (see PROGRESS.md, PR #33). Import those two via their direct
// file paths instead.
export { CompletenessIndicator } from './CompletenessIndicator';
export { EducationOnboardingForm } from './EducationOnboardingForm';
export { ExperienceManager } from './ExperienceManager';
export { NextSteps, type ProfileStep } from './NextSteps';
export { ProfileForm, type ProfileFormProps } from './ProfileForm';
export { ResumeManager } from './ResumeManager';
export { SkillsManager } from './SkillsManager';
export { StatCard } from './StatCard';
