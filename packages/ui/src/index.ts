// @jobportal/ui — shared design system (CLAUDE.md §2 + SRS §3.1).
// Tailwind 4 tokens live in ./styles/theme.css; lucide icons re-export from ./icons.

export * from './components';
export { cn } from './lib/cn';
// Deliberately narrow surface: just what the per-app NavigationProgress
// wrappers need for their router patches. The machine, predicate and bus
// subscription stay internal (relative imports + unit tests only).
export { isSameDocumentNav, notifyNavStart } from './lib/nav-progress';
export { ThemeProvider, useTheme, type ResolvedTheme, type Theme } from './lib/use-theme';
