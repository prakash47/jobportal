// @jobportal/ui — shared design system (CLAUDE.md §2 + SRS §3.1).
// Tailwind 4 tokens live in ./styles/theme.css; lucide icons re-export from ./icons.

export * from './components';
export { cn } from './lib/cn';
export {
  NavProgressMachine,
  isEligibleNavClick,
  notifyNavStart,
  onNavStart,
} from './lib/nav-progress';
export { ThemeProvider, useTheme, type ResolvedTheme, type Theme } from './lib/use-theme';
