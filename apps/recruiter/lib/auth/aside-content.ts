// Copy for the brand aside on the public (auth) pages — the navy panel beside
// the sign-in / sign-up form (see components/auth/AuthSplit.tsx).
//
// Each page picks its own entry by key and passes it to <AuthSplit>. That is
// deliberate: the panel used to live in the (auth) layout and resolve itself
// from the request pathname, which LOOKED tidier and was broken — the App
// Router does not re-render a shared layout when you navigate between two of
// its own children, and the /login <-> /register links are exactly that
// navigation, so the panel kept the previous route's copy and illustration
// until a hard reload. Owning the panel at the page level also keeps both
// routes statically prerenderable, since nothing reads a dynamic request API.
//
// Every claim below has to be true of the shipped product: a jobs list, an
// applicants list with stages, dashboard insights, and company KYC all exist.
// No counts, no customer names, nothing that needs a number we don't have.

/** Icon keys, resolved to components in AuthAside — this module stays JSX-free. */
export type AsideIcon = 'briefcase' | 'users' | 'shield' | 'trend';

/** Which flat brand SVG the panel renders (components/auth/illustrations). */
export type AsideIllustration = 'pipeline' | 'post-job';

export interface AsidePoint {
  icon: AsideIcon;
  label: string;
}

export interface AsideContent {
  eyebrow: string;
  headline: string;
  body: string;
  points: readonly AsidePoint[];
  illustration: AsideIllustration;
}

export type AsideKey = 'login' | 'register' | 'brand';

export const ASIDE_CONTENT: Readonly<Record<AsideKey, AsideContent>> = {
  login: {
    eyebrow: 'Recruiter portal',
    headline: 'Welcome back to your hiring desk.',
    body: 'Your jobs, applicants and company profile are exactly where you left them.',
    points: [
      { icon: 'briefcase', label: 'Every posting in one list' },
      { icon: 'users', label: 'Applicants tracked by stage' },
      { icon: 'trend', label: 'Dashboard insights at a glance' },
    ],
    illustration: 'pipeline',
  },

  register: {
    eyebrow: 'Create your account',
    headline: 'Start hiring on Career Queue.',
    body: 'Post a job, reach candidates across India, and manage every application from one place.',
    points: [
      { icon: 'briefcase', label: 'Post a job in minutes' },
      { icon: 'users', label: 'Shortlist and respond in one place' },
      { icon: 'shield', label: 'Verify your company to build trust' },
    ],
    illustration: 'post-job',
  },

  // Used by /verify-email/[token] and /accept-invite/[token]. Deliberately
  // brand-level: it has to read sensibly beside an invite-acceptance form as
  // well as a verification confirmation, neither of which is a sign-up.
  brand: {
    eyebrow: 'Recruiter portal',
    headline: 'Hiring, without the clutter.',
    body: 'One place to post jobs, track every applicant, and manage your company profile.',
    points: [
      { icon: 'briefcase', label: 'Every posting in one list' },
      { icon: 'users', label: 'Applicants tracked by stage' },
      { icon: 'shield', label: 'Verified company profiles' },
    ],
    illustration: 'pipeline',
  },
};

/** Every panel, for the invariant tests. Not used at render time. */
export const ASIDE_KEYS: readonly AsideKey[] = ['login', 'register', 'brand'];
