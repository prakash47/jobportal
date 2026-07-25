// Shared Badge fix-up for the recruiter portal's muted page canvas.
//
// @jobportal/ui's Badge fills its `neutral` variant with --color-bg-muted. That
// token is now exactly the recruiter canvas colour, so a neutral pill rendered
// directly on a page (rather than inside a white card) shows no pill at all —
// just floating text. Giving it the elevated surface plus a hairline makes it
// read as a chip on BOTH surfaces, so call sites don't have to know which one
// they're on.
//
// Applied at the CALL SITE via Badge's trailing `className` (tailwind-merge lets
// the caller win), because packages/ui/src/components/atoms/Badge.tsx is shared
// with apps/web and apps/services and must stay byte-untouched. Same technique
// JobStatusBadge already documents for its `fgClass` foreground override.
//
// Kept in a standalone module with no JSX so client components (the Post-a-Job
// wizard's skill chips) can import it without pulling a component tree into
// their bundle.
export const NEUTRAL_ON_ANY_SURFACE =
  'bg-[var(--color-bg-elevated)] ring-1 ring-inset ring-[var(--color-border)]';
