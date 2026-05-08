# @jobportal/feature-flags

Backend-controlled feature flag system. Implements SRS §7.

## Public API

```ts
import { isFlagEnabled, setFlag, listFlags, getFlag, FLAG } from '@jobportal/feature-flags';

// Evaluate
const allowed = await isFlagEnabled(FLAG.FEAT_BULK_APPLY, { userId: 42, tier: 'PREMIUM' });

// Toggle (admin) — actor.role must be 'ADMIN' and actor.userId > 0; setFlag throws otherwise.
await setFlag(FLAG.SERVICES_RESUME_WRITING, { enabled: true }, { userId: 1, role: 'ADMIN' }, 'launching service');

// List / get
const all = await listFlags();
const flag = await getFlag(FLAG.SUBSCRIPTION_SYSTEM);
```

## Three-layer enforcement (mandatory)

Per CLAUDE.md §4 + SRS §7.12. UI gating alone is **not** enough; every paid feature MUST gate at all three layers.

### Layer 1 — Next.js middleware (route gate)

```ts
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { isFlagEnabled } from '@jobportal/feature-flags';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/services/')) {
    const slug = pathname.split('/')[2] ?? '';
    const key = `services.${slug.replaceAll('-', '_')}.enabled`;
    if (!(await isFlagEnabled(key))) return new NextResponse(null, { status: 404 });
  }
}
```

### Layer 2 — Page server component

```tsx
// apps/web/app/pricing/page.tsx
import { isFlagEnabled, FLAG } from '@jobportal/feature-flags';
import { notFound } from 'next/navigation';

export default async function PricingPage() {
  if (!(await isFlagEnabled(FLAG.PRICING_PAGE_VISIBLE))) notFound();
  // ...
}
```

### Layer 3 — API endpoint (last line of defense, non-bypassable)

```ts
// apps/api/src/applications/applications.controller.ts
@Post('bulk-apply')
async bulkApply(@CurrentUser() user: User) {
  const allowed = await isFlagEnabled(FLAG.FEAT_BULK_APPLY, { userId: user.id, tier: user.tier });
  if (!allowed) throw new ForbiddenException('Upgrade required');
  // ...
}
```

## Caching (SRS §7.6)

- **L1 — in-process LRU** with 30s TTL (one Map per Node process).
- **L2 — Redis** keyed `flag:<key>` with same 30s TTL.
- **Invalidation** — `setFlag()` deletes the Redis key and publishes on the `flag:invalidate` channel. Subscribers (Next servers + NestJS BFF) clear their local LRU on receipt.

If Redis is unreachable, the evaluator falls through to the DB without crashing — degraded perf, not broken.

## Audit log

Every `setFlag()` writes a `FlagAuditLog` row (before, after, actor, reason). Surfaced via `GET /api/admin/audit-log?type=feature_flag`.

## Slack alerts

Critical flag changes post a webhook to `SLACK_WEBHOOK_URL`. Falls back to `console.log` when the env var is unset. Critical keys:

- `services.menu.visible`
- `subscription.system.enabled`
- `killswitch.job_alerts`
- `killswitch.resume_uploads`
- `killswitch.new_registrations`

## Tests

```bash
pnpm --filter @jobportal/feature-flags test
```

Unit tests cover the pure evaluator (one case per FlagType plus admin-grant precedence) and the percentage-rollout hash distribution. The cache + Redis paths are exercised manually in `pnpm db:seed` and during admin toggles; a full integration test arrives with the admin console feature branch.

## Architecture notes

For the full rationale (alternatives considered, trade-offs, edge cases), see [`docs/adr/0001-feature-flag-architecture.md`](../../docs/adr/0001-feature-flag-architecture.md) — local-only, kept on the dev machine.
