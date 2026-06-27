// NOTE: async, server-only components (DailyApplyIndicator → next/headers,
// RecommendedJobs → @jobportal/search + loadSrpUserContext → Prisma) are
// deliberately NOT re-exported here. This barrel mixes client components
// ('use client': SignOutButton, ProfileForm, ProfileNav, the *Managers) with
// pure presentational ones, so a client importer must never be able to pull a
// server-only transitive dep through it — Turbopack drags the whole chain into
// the client bundle and the build breaks (see PROGRESS.md, PR #33). Import
// those two via their direct file paths instead.
export { AccountShell } from './AccountShell';
export { CompletenessIndicator } from './CompletenessIndicator';
export { DashboardHeader } from './DashboardHeader';
export { EducationManager } from './EducationManager';
export { ExperienceManager } from './ExperienceManager';
export { NextSteps, type ProfileStep } from './NextSteps';
export { ProfileForm, type ProfileFormProps } from './ProfileForm';
export { ProfileNav } from './ProfileNav';
export { ResumeManager } from './ResumeManager';
export { SignOutButton } from './SignOutButton';
export { SkillsManager } from './SkillsManager';
export { StatCard } from './StatCard';
