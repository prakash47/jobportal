import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, type NotificationType } from '@jobportal/db';
import type {
  ListNotificationsQueryInput,
  UpdateRecruiterNotificationPreferencesInput,
} from './dto';

// L3 killswitch — emergency stop for the recruiter notifications feature. ON
// (enabled:true) means the feature is DISABLED. Checked at the top of every
// mutation (mark-read, mark-all-read, preference update). Reads (list +
// unread-count + preferences) stay ungated so a recruiter can always SEE their
// existing notifications/settings even while new ones are paused — mirrors the
// recruiter-kyc getKyc convention.
const NOTIFICATIONS_KILLSWITCH_FLAG = 'killswitch.recruiter_notifications';

const PAGE_SIZE = 20;

export interface NotificationView {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  linkUrl: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotificationListResult {
  items: NotificationView[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
}

export interface RecruiterNotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
}

// Email defaults ON (recruiters expect application/verification emails); SMS
// defaults OFF (cost-bearing channel, no provider yet — freemium Day-0 stance,
// CLAUDE.md §0).
const PREF_DEFAULTS: RecruiterNotificationPreferences = {
  emailEnabled: true,
  smsEnabled: false,
};

@Injectable()
export class RecruiterNotificationsService {
  // Paginated bell feed for the current recruiter, newest first, with the
  // unread count for the badge. Scoped to the JWT subject — never a body id.
  async list(userId: number, query: ListNotificationsQueryInput): Promise<NotificationListResult> {
    const page = query.page ?? 1;
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          linkUrl: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        linkUrl: n.linkUrl,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      unreadCount,
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  // Lightweight endpoint the bell polls for the unread badge.
  async unreadCount(userId: number): Promise<{ unreadCount: number }> {
    const unreadCount = await prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount };
  }

  // Mark one notification read. Ownership is enforced by scoping the update to
  // (id, userId): a cross-user (or unknown) id matches 0 rows. We then probe
  // ownership to distinguish "already read" (no-op success) from "not found /
  // not owned" (404 — no existence leak), mirroring the recruiter-kyc 404 rule.
  async markRead(userId: number, id: number): Promise<{ unreadCount: number }> {
    await this.assertEnabled();
    const res = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return this.unreadCount(userId);
  }

  async markAllRead(userId: number): Promise<{ unreadCount: number }> {
    await this.assertEnabled();
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unreadCount: 0 };
  }

  // Lazily provisioned like EmailPreference: a default read returns the schema
  // defaults without inserting a row.
  async getPreferences(userId: number): Promise<RecruiterNotificationPreferences> {
    const row = await prisma.recruiterNotificationPreference.findUnique({
      where: { userId },
      select: { emailEnabled: true, smsEnabled: true },
    });
    return row ?? PREF_DEFAULTS;
  }

  async updatePreferences(
    userId: number,
    patch: UpdateRecruiterNotificationPreferencesInput,
  ): Promise<RecruiterNotificationPreferences> {
    await this.assertEnabled();
    // Drop explicit-undefined keys so they don't survive into the Prisma input
    // under exactOptionalPropertyTypes (same idiom as NotificationsPreferencesService).
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'boolean') clean[k] = v;
    }

    const upserted = await prisma.recruiterNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...PREF_DEFAULTS, ...clean },
      update: clean,
      select: { emailEnabled: true, smsEnabled: true },
    });
    return upserted;
  }

  private async assertEnabled(): Promise<void> {
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Notifications are temporarily unavailable');
    }
  }
}
