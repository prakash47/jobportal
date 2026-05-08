import { Injectable } from '@nestjs/common';
import { prisma } from '@jobportal/db';
import type { UpdateNotificationPreferencesInput } from './dto';

export interface NotificationPreferences {
  jobAlertsEnabled: boolean;
  applicationStatusEnabled: boolean;
  productNewsEnabled: boolean;
}

const DEFAULTS: NotificationPreferences = {
  jobAlertsEnabled: true,
  applicationStatusEnabled: true,
  productNewsEnabled: false,
};

// SRS §4.13.4 — preference store. Lazily provisioned: a user's first read
// returns the schema defaults without inserting a row, and the first PATCH
// upserts. This means a brand-new user with default preferences never
// occupies a DB row — the volume of these is the entire user table, so we
// avoid making the table grow with no information content.
@Injectable()
export class NotificationsPreferencesService {
  async read(userId: number): Promise<NotificationPreferences> {
    const row = await prisma.emailPreference.findUnique({
      where: { userId },
      select: {
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      },
    });
    return row ?? DEFAULTS;
  }

  async update(
    userId: number,
    patch: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    // Strip undefined keys so explicit-undefined values from a Zod-parsed
    // partial object don't survive into the Prisma input — Prisma's
    // generated types under exactOptionalPropertyTypes reject `key:
    // undefined` even though the runtime behavior is "skip this field".
    // Result is typed as Record<string, boolean> so the spread + assignment
    // are accepted without an extra cast.
    const cleanPatch: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'boolean') cleanPatch[k] = v;
    }

    const upserted = await prisma.emailPreference.upsert({
      where: { userId },
      // create-only path: anything the patch didn't set falls back to the
      // schema default, which is the same as DEFAULTS by construction.
      create: {
        userId,
        ...DEFAULTS,
        ...cleanPatch,
      },
      // update path: only the keys present in the patch are written.
      update: cleanPatch,
      select: {
        jobAlertsEnabled: true,
        applicationStatusEnabled: true,
        productNewsEnabled: true,
      },
    });
    return upserted;
  }
}
