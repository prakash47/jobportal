# @jobportal/api

NestJS 11 BFF for all clients. Modular controllers per SRS §10.1 (jobs, companies, auth, candidates, recruiters, feature-flags, subscriptions, alerts).

**Production subdomain:** `api`

## Scripts

```bash
pnpm --filter @jobportal/api dev       # http://localhost:4000
pnpm --filter @jobportal/api build
pnpm --filter @jobportal/api typecheck
```

## Health check

`GET /health` returns `{ "status": "ok" }`.
