import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type JobAlert } from '@jobportal/db';
import type { AlertCreateInput, AlertUpdateInput } from './dto';

const MAX_ALERTS_PER_USER = 10;

@Injectable()
export class AlertsService {
  async list(userId: number): Promise<JobAlert[]> {
    return prisma.jobAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: number, id: number): Promise<JobAlert> {
    const row = await prisma.jobAlert.findUnique({ where: { id } });
    // Cross-user 404 (no existence leak), same pattern as withdraw.
    if (!row || row.userId !== userId) throw new NotFoundException('Alert not found');
    return row;
  }

  async create(userId: number, input: AlertCreateInput): Promise<JobAlert> {
    // SRS §4.5.1 — cap of 10 active+paused alerts per user. Counted
    // pre-insert; race window is acceptable given the small cap and the
    // friendly 409 we raise on overflow.
    const count = await prisma.jobAlert.count({ where: { userId } });
    if (count >= MAX_ALERTS_PER_USER) {
      throw new ConflictException(`You can have at most ${MAX_ALERTS_PER_USER} alerts.`);
    }
    return prisma.jobAlert.create({
      data: {
        userId,
        name: input.name,
        query: input.query as unknown as Prisma.InputJsonValue,
        frequency: input.frequency,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(userId: number, id: number, input: AlertUpdateInput): Promise<JobAlert> {
    await this.get(userId, id); // ownership 404
    const data: Prisma.JobAlertUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.frequency !== undefined) data.frequency = input.frequency;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.query !== undefined) {
      data.query = input.query as unknown as Prisma.InputJsonValue;
    }
    return prisma.jobAlert.update({ where: { id }, data });
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.get(userId, id);
    await prisma.jobAlert.delete({ where: { id } });
  }

  // SRS §4.5.6 — token-based unsubscribe. Public (no JWT); the token is the
  // capability. Returns the alert name so the landing page can confirm which
  // alert was paused. Idempotent: re-visiting the link is a no-op.
  async unsubscribeByToken(token: string): Promise<{ alertName: string }> {
    const alert = await prisma.jobAlert.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, name: true, isActive: true },
    });
    if (!alert) throw new NotFoundException('Unsubscribe link not recognised.');
    if (alert.isActive) {
      await prisma.jobAlert.update({ where: { id: alert.id }, data: { isActive: false } });
    }
    return { alertName: alert.name };
  }

  // SRS §4.5.5 — server-side check used by the controller to gate the manual
  // 'send test' endpoint. Worker independently re-checks the killswitch on
  // every job.
  async canRunTest(): Promise<boolean> {
    // Lazy import to keep alerts module self-contained.
    const { isFlagEnabled } = await import('@jobportal/feature-flags');
    return !(await isFlagEnabled('killswitch.job_alerts'));
  }

  async assertCanRunTestOrFail(): Promise<void> {
    if (!(await this.canRunTest())) {
      throw new ForbiddenException('Job alerts are temporarily disabled.');
    }
  }
}
