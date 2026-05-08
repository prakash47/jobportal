import { z } from 'zod';

// SRS §4.13.4 — three category toggles. Strict (.strict()) so a typo'd
// extra field is rejected with 400 rather than silently ignored.
export const UpdateNotificationPreferencesDto = z
  .object({
    jobAlertsEnabled: z.boolean().optional(),
    applicationStatusEnabled: z.boolean().optional(),
    productNewsEnabled: z.boolean().optional(),
  })
  .strict();
export type UpdateNotificationPreferencesInput = z.infer<
  typeof UpdateNotificationPreferencesDto
>;
