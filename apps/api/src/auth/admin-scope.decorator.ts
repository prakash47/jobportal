// SRS §4.16 — the per-route scope requirement read by AdminGuard.
//
// Usage, on a method or a whole controller:
//
//   @RequireAdminScope('finance', 'EDIT')
//   @Post(':id/grant')
//
// A method-level decorator wins over a controller-level one, so a controller can
// declare its common floor (say `moderation`/`READ_ONLY`) and one destructive
// route can raise itself to `EDIT`.
//
// ── What happens when a route declares NOTHING ──────────────────────────────
// It is treated as requiring `system`/`EDIT`, i.e. SUPER_ADMIN only. This is the
// deliberate choice and it is neither of the two obvious ones:
//
//   * Defaulting to ALLOW would mean every admin route added after this PR is
//     open to every staff tier until someone remembers to annotate it. The
//     failure is silent, invisible in review, and indistinguishable from working
//     code — which is how the recruiter taxonomy ended up shipped-but-unenforced
//     in the first place (hasModuleAccess has no production callers).
//
//   * Defaulting to DENY-ALL would lock out the super admin too, so a forgotten
//     annotation would take a working console down for everybody, including the
//     one person able to fix it.
//
// Requiring `system` gets the safety of fail-closed without the outage: a new,
// un-annotated admin route is reachable by the super admin and nobody else. The
// omission shows up as "my Support Admin gets a 403 on the new screen", which is
// a bug report, not an incident and not a breach.

import { SetMetadata } from '@nestjs/common';
import type { AdminAccessLevel, AdminModule } from '@jobportal/domain/admin-permissions';

export const ADMIN_SCOPE_KEY = 'adminScope';

export type AdminScopeRequirement = {
  module: AdminModule;
  level: AdminAccessLevel;
};

export const RequireAdminScope = (module: AdminModule, level: AdminAccessLevel) =>
  SetMetadata<string, AdminScopeRequirement>(ADMIN_SCOPE_KEY, { module, level });
