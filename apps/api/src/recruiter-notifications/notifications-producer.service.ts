import { Injectable } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma } from '@jobportal/db';

// Same killswitch as the read/write service — when ON, the whole feature is
// paused, so the producer stops creating rows (a silent no-op; callers treat
// this as fire-and-log).
const NOTIFICATIONS_KILLSWITCH_FLAG = 'killswitch.recruiter_notifications';

// Writes recruiter in-app notification rows at the source events. Called
// fire-and-log from shared services (candidate apply, admin KYC review) so a
// failure here NEVER breaks the primary action — callers wrap the call in
// .catch(log). The in-app row is the only delivery channel today; email/SMS
// fan-out (gated by RecruiterNotificationPreference) is a deferred follow-up.
@Injectable()
export class NotificationsProducerService {
  // A new application landed on one of a recruiter's jobs. recruiterUserId is
  // Job.postedById, which is nullable — a job whose poster was removed has no
  // recipient, so we skip silently.
  async notifyNewApplication(input: {
    recruiterUserId: number | null;
    jobId: number;
    jobTitle: string;
    candidateName: string;
  }): Promise<void> {
    if (input.recruiterUserId == null) return;
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) return;

    await prisma.notification.create({
      data: {
        userId: input.recruiterUserId,
        type: 'NEW_APPLICATION',
        title: 'New application',
        body: `${input.candidateName} applied to ${input.jobTitle}`,
        linkUrl: `/jobs/${input.jobId}/applicants`,
      },
    });
  }

  // An admin approved or rejected a company's verification. Verification is
  // company-level (multiple recruiters share one Company), so every recruiter on
  // the company is notified. Resolves the recipients + company name here to keep
  // the calling admin service thin.
  async notifyKycDecision(input: {
    companyId: number;
    decision: 'VERIFIED' | 'REJECTED';
    rejectionReason?: string | null;
  }): Promise<void> {
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) return;

    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { name: true, recruiters: { select: { userId: true } } },
    });
    if (!company || company.recruiters.length === 0) return;

    const verified = input.decision === 'VERIFIED';
    const reason = input.rejectionReason?.trim();
    const title = verified ? 'Company verified' : 'Company verification rejected';
    const body = verified
      ? `${company.name} has been verified. A verified badge now appears across your recruiter account.`
      : reason && reason.length > 0
        ? `Your company verification was not approved: ${reason}`
        : 'Your company verification was not approved. Please review your details and documents, then resubmit.';

    const rows: Prisma.NotificationCreateManyInput[] = company.recruiters.map((r) => ({
      userId: r.userId,
      type: verified ? 'KYC_VERIFIED' : 'KYC_REJECTED',
      title,
      body,
      linkUrl: '/kyc',
    }));
    await prisma.notification.createMany({ data: rows });
  }
}
