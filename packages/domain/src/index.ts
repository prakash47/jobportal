// @jobportal/domain — logic that BOTH the server-rendered website and the REST
// API must agree on.
//
// Why this package exists (ADR 0002 decision 2): all of it used to live in
// `apps/web/lib`, which `apps/api` cannot import — there is no dependency
// between the two apps and no path alias for one. Six of the nine mobile
// endpoints need these exact rules, so building them without this package
// meant each endpoint copy-pasting what it needed, leaving the slug parser,
// the visibility rules and the SRP param mapping in two places, silently
// drifting from the website forever.
//
// Prefer the SUBPATH imports (`@jobportal/domain/slug`) over this barrel.
// The barrel pulls in `home-queries`, which reaches Prisma at import time —
// fine for a server, wasteful for a consumer that only wanted to parse a slug.
//
// What deliberately did NOT move: `apps/web/lib/cms/markdown.ts`. It is the
// Shiki/unified pipeline, it is ESM-only against a CommonJS API build, and the
// owner's ADR 0002 decision 3 (return raw markdown to the mobile client)
// removes the reason to share it.

export * from './slug';
export * from './job-visibility';
export * from './srp-params';
export * from './company-params';
export * from './company-highlights';
export * from './article-params';
export * from './home-queries';
