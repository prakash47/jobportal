// JobPortal — ESLint flat config (single source of truth for the whole monorepo).
//
// WHY THIS FILE EXISTS
// --------------------
// Until now `pnpm lint` could not fail. ESLint and Prettier were not installed
// anywhere, there were no git hooks and no CI, and `next lint` — which four of
// the five apps invoked — was REMOVED in Next 16, so the script errored out as
// an unknown command instead of checking anything. CLAUDE.md §10 has always
// asked for lint; this is the first version of it that actually runs.
//
// HOW IT IS WIRED
// ---------------
// One config at the repo root, and every workspace's `lint` script is
// `eslint .`. Flat config resolves from the working directory upward, so each
// package finds this file, while Turborepo still parallelises and caches the
// task per package the way `typecheck` and `test` already do.
//
// HOW STRICT IT IS, AND WHY
// -------------------------
// Deliberately calibrated to pass CLEAN on 1,100+ existing files. A lint that
// lands with thousands of errors is a lint everybody turns off in week one, so
// correctness rules are errors, judgement calls are warnings, and anything tsc
// already reports is switched off here rather than reported twice.
//
// Ratcheting it up later is easy and safe; the useful order is (1) clear the
// existing warnings, (2) promote them to errors, (3) consider the
// type-checked typescript-eslint presets, which need `projectService` and cost
// real time on a tree this size.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import next from 'eslint-config-next';

/** Apps that are actually Next.js. `apps/api` is NestJS and gets none of this. */
const NEXT_APPS = ['apps/web', 'apps/recruiter', 'apps/sadmin', 'apps/services'];

/**
 * Everything that renders React — the four Next apps plus the shared component
 * library.
 *
 * `packages/ui` is included deliberately. It is the most-reused code in the
 * repo, so a hooks bug there is a bug everywhere at once; and it already
 * contains an `eslint-disable react/no-array-index-key` written by someone who
 * assumed lint existed. Leaving the plugin unscoped to it turned that comment
 * into a hard error ("Definition for rule was not found") rather than the
 * suppression it was meant to be.
 */
const REACT_FILES = [...NEXT_APPS, 'packages/ui'].map((dir) => `${dir}/**/*.{ts,tsx}`);

// eslint-config-next ships its rules in ONE entry scoped to `**/*.{js,jsx,...}`
// — i.e. every file in whatever tree it is loaded from. At the root of a
// monorepo that would apply React, jsx-a11y and @next/next rules to the NestJS
// API and to the framework-free packages, where they are meaningless (and where
// `@next/next/no-html-link-for-pages` in particular reports nonsense). So the
// rule-bearing entries are re-scoped to the Next apps.
//
// The entries WITHOUT rules are dropped on purpose: one of them exists only to
// re-register the `@typescript-eslint` plugin, and flat config throws when two
// different plugin objects are registered under the same name — typescript-eslint
// below already provides it. The other is a set of global ignores written
// relative to the config file, so `.next/**` would only ever match a build at
// the repo root, never `apps/web/.next/**`; the ignores block below covers it
// properly instead.
const nextConfigs = next
  .filter((entry) => entry.rules && Object.keys(entry.rules).length > 0)
  .map((entry) => ({ ...entry, name: 'jobportal/next', files: REACT_FILES }));

export default tseslint.config(
  // ---------------------------------------------------------------------------
  // Never look at these.
  // ---------------------------------------------------------------------------
  {
    name: 'jobportal/ignores',
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      // Prisma 7 generates its client into the repo (schema.prisma sets
      // `output = "../generated"`). It is machine-written, enormous, and not
      // ours to fix.
      'packages/db/generated/**',
      '**/next-env.d.ts',
      // This file and the other config files are linted; the compiled output
      // of anything is not.
      '**/*.min.js',
    ],
  },

  // ---------------------------------------------------------------------------
  // Baseline for every source file.
  // ---------------------------------------------------------------------------
  js.configs.recommended,
  tseslint.configs.recommended,

  {
    name: 'jobportal/base',
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      // Server components, client components, workers and NestJS providers all
      // live in this tree, so both global sets are in scope. Narrowing this per
      // directory would be more precise but buys nothing: `no-undef` is off for
      // TypeScript anyway (tsc does it better), and these globals only exist to
      // keep the plain-JS config files honest.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // --- Off because tsc already reports it, and two reports of one problem
      // --- is how people learn to ignore the second one. -----------------------
      // tsconfig.base.json sets noUnusedLocals + noUnusedParameters.
      '@typescript-eslint/no-unused-vars': 'off',
      // TypeScript resolves identifiers; no-undef on TS produces false positives
      // on types and globals it cannot see.
      'no-undef': 'off',

      // --- Real bugs. ----------------------------------------------------------
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-return-await': 'off',
      '@typescript-eslint/return-await': 'off', // needs type info; revisit with projectService
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-template-curly-in-string': 'error',
      'array-callback-return': ['error', { allowImplicit: true }],
      // `catch {}` that swallows silently is how the OTP and asset-URL bugs hid.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // --- Judgement calls: visible, not blocking. -----------------------------
      // CLAUDE.md §10: "No `any` without a justification comment." ESLint cannot
      // check for the comment, and there are ~125 existing uses, most of them
      // deliberate. A warning keeps every one of them in view without turning
      // the gate red on day one.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // --- Deliberately OFF, with reasons. ------------------------------------
      // Ubiquitous and correct in this codebase: `!` after a Prisma
      // findUniqueOrThrow-style narrow, or on a value a guard has established.
      // The dangerous SPECIFIC case — asserting a session that is null for every
      // logged-out request — is banned by name further down, which is precise
      // where a blanket ban would be noise.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Fires on NestJS constructor parameter properties and on Zod's inferred
      // types; not worth the churn.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Next.js apps only: React Hooks, a11y, and the Next-specific rules.
  // ---------------------------------------------------------------------------
  ...nextConfigs,

  {
    name: 'jobportal/next-overrides',
    files: REACT_FILES,
    rules: {
      // Unambiguous, and already clean across the repo: a conditional hook call
      // is always a bug.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // --- The React Compiler rules, new in eslint-plugin-react-hooks v7. -----
      // These are WARNINGS rather than errors, and that is a deliberate,
      // reversible decision rather than an evasion. They flag 20 real sites
      // today (13 set-state-in-effect, 5 immutability, 2 refs), and clearing
      // one is a component refactor - moving derived state out of an effect,
      // restructuring a ref read - not a config change. Two reasons not to do
      // that here:
      //
      //   1. Thirteen of the twenty are in apps/recruiter and apps/sadmin,
      //      which belong to other developers (CLAUDE.md §15). Refactoring
      //      their components inside a lint-setup change is exactly the kind of
      //      surprise the ownership rule exists to prevent. Per-owner counts
      //      are in the WORKLOG notice.
      //   2. The remaining seven are in apps/web, and a behavioural refactor
      //      smuggled into a tooling PR is how a "safe" change becomes a
      //      regression.
      //
      // They are visible in every editor and in `pnpm lint` output from day
      // one. Promote to 'error' per app as each owner clears their sites.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',

      // --- Rules the codebase already assumed existed. -------------------------
      // Four files carry `eslint-disable-next-line react/no-danger` /
      // `react/no-array-index-key` comments with written justifications, from
      // developers who expected lint to be running. Enabling the rules turns
      // those comments back into meaningful, reviewed suppressions instead of
      // dead text - and means the NEXT unsanitised innerHTML has to argue for
      // itself.
      'react/no-danger': 'error',
      // Warn, not error: an index key is only wrong for a list that REORDERS or
      // has items inserted/removed. Most of the 13 current sites render a
      // derived, stable list - split paragraphs, FAQ entries, company
      // highlights - where the index is genuinely the identity and the rule is
      // a false positive. Flagging them is still worth it (the next one might
      // be a sortable table), but failing the gate on them is not.
      'react/no-array-index-key': 'warn',

      // React 19 + the Next compiler: no import needed, and prop-types is a
      // JS-era mechanism that TypeScript replaces.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Unescaped apostrophes in copy. The strings here are British/Indian
      // English prose with apostrophes everywhere; escaping them all would make
      // the copy unreadable in source for no rendered difference.
      'react/no-unescaped-entities': 'off',
      // Pages-Router only. This repo is App Router throughout, so the rule
      // cannot find a `pages/` directory and warns about its own absence on
      // every run.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // The session guard — the lint half of bugfix/anon-render-null-session.
  // ---------------------------------------------------------------------------
  {
    name: 'jobportal/session-guard',
    // apps/web ONLY, on purpose. apps/recruiter has seven identical sites
    // (jobs, jobs/[id], jobs/[id]/edit, jobs/[id]/applicants, kyc, post-job,
    // profile) and that surface belongs to another developer — a notice is
    // raised in WORKLOG.md rather than an edit, per CLAUDE.md §15. Add
    // 'apps/recruiter/**/*.{ts,tsx}' to this list the day those are fixed.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // `(await readUserFromCookie())!` — the exact expression that made
          // every logged-out request to a dashboard route throw. A layout and
          // its page render CONCURRENTLY in the App Router, so an ancestor
          // layout's redirect() does NOT gate the page body, and the assertion
          // is false for every anonymous request.
          selector:
            'TSNonNullExpression > AwaitExpression > CallExpression[callee.name=/^(readUserFromCookie|getHeaderUser)$/]',
          message:
            'readUserFromCookie()/getHeaderUser() return null for every logged-out request, and a page body still runs while an ancestor layout is redirecting. Use requireUser() from lib/auth/require-user — it returns non-null claims or redirects.',
        },
        {
          // The same lie without the await.
          selector:
            'TSNonNullExpression > CallExpression[callee.name=/^(readUserFromCookie|getHeaderUser)$/]',
          message:
            'readUserFromCookie()/getHeaderUser() return null for every logged-out request. Use requireUser() from lib/auth/require-user.',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // NestJS API.
  // ---------------------------------------------------------------------------
  {
    name: 'jobportal/api',
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest's DI decorators and its `implements` contracts routinely produce
      // empty-bodied classes and interface-shaped types.
      '@typescript-eslint/no-extraneous-class': 'off',
      // The API logs deliberately, through Nest's Logger and through console in
      // bootstrap paths.
      'no-console': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Quarantine: another developer's file, one known finding. DELETE THIS BLOCK
  // once they have cleared it.
  // ---------------------------------------------------------------------------
  {
    name: 'jobportal/recruiter-auth-quarantine',
    files: ['apps/api/src/recruiter-auth/**/*.ts'],
    rules: {
      // The password regex is copy-pasted in three files and escapes `[` inside
      // a character class, where the escape does nothing. Two of the three are
      // fixed in this change; this one belongs to the recruiter developer
      // (CLAUDE.md §15), so it is downgraded here rather than edited, and
      // raised as a WORKLOG notice instead. Scoped to one directory so the rule
      // keeps full force everywhere else.
      'no-useless-escape': 'warn',
    },
  },

  // ---------------------------------------------------------------------------
  // Tests and tooling.
  // ---------------------------------------------------------------------------
  {
    name: 'jobportal/tests',
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      // A test that asserts on a deliberately malformed value needs `any`, and
      // a test that proves a guard fires needs the very shape the guard bans.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },

  {
    name: 'jobportal/scripts-and-config',
    files: [
      '**/*.config.{ts,mts,js,mjs,cjs}',
      '**/scripts/**/*.{ts,js,mjs}',
      'packages/db/prisma/**/*.ts',
      'eslint.config.mjs',
    ],
    languageOptions: { globals: globals.node },
    rules: {
      // Seeds, migrations and one-off scripts are meant to print.
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
