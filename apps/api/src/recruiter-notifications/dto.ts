import { z } from 'zod';

// Recruiter notification channel toggles. Both optional so the settings form can
// PATCH a single switch. .strict() rejects unknown keys (mirrors the other
// recruiter DTOs). This is a recruiter-scoped store — deliberately separate from
// the candidate-shared /me/notifications (EmailPreference) contract.
export const UpdateRecruiterNotificationPreferencesDto = z
  .object({
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
  })
  .strict();
export type UpdateRecruiterNotificationPreferencesInput = z.infer<
  typeof UpdateRecruiterNotificationPreferencesDto
>;

// Bell feed list query. page is 1-based; query params arrive as strings so we
// coerce. .strict() so a typo'd param 400s rather than being silently ignored.
export const ListNotificationsQueryDto = z
  .object({
    page: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type ListNotificationsQueryInput = z.infer<typeof ListNotificationsQueryDto>;
