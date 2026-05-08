import { z } from 'zod';

const SubscriptionTierEnum = z.enum(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']);

export const FlagPatchSchema = z.object({
  enabled: z.boolean().optional(),
  percentage: z.number().int().min(0).max(100).nullable().optional(),
  targetUserIds: z.array(z.number().int().positive()).optional(),
  requiredTiers: z.array(SubscriptionTierEnum).optional(),
  cohorts: z.array(z.string().min(1)).optional(),
  reason: z.string().min(1).max(500).optional(),
});

export type FlagPatchDto = z.infer<typeof FlagPatchSchema>;

export const AuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    flagKey: z.string().min(1).max(120).optional(),
  })
  .strict();

export type AuditLogQueryDto = z.infer<typeof AuditLogQuerySchema>;
