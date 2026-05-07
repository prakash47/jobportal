# @jobportal/services

Paid services site for JobPortal (resume reviews, career help). Next.js 16 (App Router, Turbopack, React 19.2).

**Production subdomain:** `resume`

This site is gated behind feature flags — it's hidden on Day 0 (per CLAUDE.md §0 freemium-on-launch).

## Scripts

```bash
pnpm --filter @jobportal/services dev       # http://localhost:3002
pnpm --filter @jobportal/services build
pnpm --filter @jobportal/services typecheck
```
