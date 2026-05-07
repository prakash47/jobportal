# @jobportal/ui

Shared design system. Tailwind 4 CSS-first tokens + accessible React primitives. References: Linear, Stripe, Vercel.

## Public API

```ts
// Atoms
import { Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Badge, Avatar, Label } from '@jobportal/ui';

// Layout
import { AppShell, Container, Stack, Grid, Divider } from '@jobportal/ui';

// Molecules
import { Card, Dialog, Popover, Tooltip, Tabs, Accordion, EmptyState, Pagination, Breadcrumbs, Skeleton } from '@jobportal/ui';

// Toasts (mount <Toaster /> once, call toast(...) anywhere)
import { Toaster, toast } from '@jobportal/ui';

// Theme + utils
import { ThemeProvider, useTheme, cn } from '@jobportal/ui';

// Icons (lucide-react re-exports)
import { Search, Bell, ChevronDown } from '@jobportal/ui/icons';
```

## How tokens work

All design tokens live in `src/styles/theme.css` as Tailwind 4 `@theme` variables — there is **no `tailwind.config.ts`**. Apps import the theme right after Tailwind itself:

```css
/* apps/web/app/globals.css */
@import "tailwindcss";
@import "@jobportal/ui/styles/theme.css";
```

Components consume tokens through Tailwind utilities (`bg-[var(--color-primary-600)]`, `text-[var(--color-fg-muted)]`, `border-[var(--color-border)]`), so dark-mode just works when an ancestor sets `data-theme="dark"`.

## Dark mode

```tsx
import { ThemeProvider } from '@jobportal/ui';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

`useTheme()` returns `{ theme, resolvedTheme, setTheme }`. Defaults to `system` on first load; persists to `localStorage`.

## Storybook

```bash
pnpm --filter @jobportal/ui storybook
```

Boots Storybook 8 on `http://localhost:6006`. The toolbar has a Light/Dark theme switcher.

## Design rules (CLAUDE.md §2)

- Restrained palette — neutrals + one accent (primary blue) + semantic. **No teal.** **No gradients except functional.**
- Borders for separation, not shadows. Shadows reserved for elevation cues (modals, popovers).
- Inter, weight + size for hierarchy (not color).
- 4px spacing grid, 1200px container max.
- 150–250 ms ease-out animations. No bouncy motion.
- WCAG 2.1 AA — focus rings, keyboard nav, `prefers-reduced-motion`, contrast 4.5:1 body / 3:1 large.
- Acceptance test: would this look at home next to linear.app?

## Architecture notes

For the full rationale (token strategy, why Radix, dark-mode mechanics, alternatives considered), see [`docs/adr/0003-design-system-tokens.md`](../../docs/adr/0003-design-system-tokens.md) — local-only, kept on the dev machine.
