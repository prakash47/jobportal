import { Injectable } from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma, type SupportTicketStatus } from '@jobportal/db';

// Human-readable status label for the bell notification body.
const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

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

  // Support staff replied to, or changed the status of, one of the recruiter's
  // tickets. Notifies just the ticket owner (tickets are creator-scoped). Called
  // fire-and-log from the admin support console — wrap in .catch(log).
  async notifyTicketUpdate(input: {
    recruiterUserId: number;
    ticketId: number;
    subject: string;
    kind: 'reply' | 'status';
    status?: SupportTicketStatus;
  }): Promise<void> {
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) return;

    const isReply = input.kind === 'reply';
    const title = isReply
      ? 'Support replied to your ticket'
      : 'Your support ticket status changed';
    const body =
      isReply || !input.status
        ? input.subject
        : `"${input.subject}" is now ${STATUS_LABEL[input.status]}`;

    await prisma.notification.create({
      data: {
        userId: input.recruiterUserId,
        type: 'SUPPORT_TICKET_UPDATED',
        title,
        body,
        linkUrl: `/support/tickets/${input.ticketId}`,
      },
    });
  }

  // A job owner added this recruiter as a collaborator (Job Detail → Collaborate).
  // Notifies just the added teammate; linkUrl deep-links to the job detail page,
  // which the collaborator can now open (owner-or-collaborator guard). Called
  // fire-and-log from the collaborators service — wrap in .catch(log).
  async notifyJobCollaboration(input: {
    recruiterUserId: number;
    jobId: number;
    jobTitle: string;
    invitedByName: string;
  }): Promise<void> {
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) return;

    await prisma.notification.create({
      data: {
        userId: input.recruiterUserId,
        type: 'JOB_COLLABORATION',
        title: 'Added as a collaborator',
        body: `${input.invitedByName} added you as a collaborator on ${input.jobTitle}`,
        linkUrl: `/jobs/${input.jobId}`,
      },
    });
  }

  // An admin approved a posting that was waiting in review, or sent it back to
  // the recruiter with a reason (moderation.jobs.enabled). Notifies the job's
  // OWNER only — unlike a KYC decision, which is company-level and notifies
  // every recruiter on the company, a posting belongs to the person who posted
  // it. Called fire-and-log from the admin service — wrap in .catch(log).
  //
  // recruiterUserId is Job.postedById, which is nullable (SetNull when a
  // recruiter departs), so the caller passes null for an orphaned job and this
  // is a no-op rather than a crash — the same guard notifyNewApplication uses.
  async notifyJobModerationDecision(input: {
    recruiterUserId: number | null;
    jobId: number;
    jobTitle: string;
    decision: 'APPROVED' | 'REJECTED';
    rejectionReason?: string | null;
  }): Promise<void> {
    if (await isFlagEnabled(NOTIFICATIONS_KILLSWITCH_FLAG)) return;
    if (input.recruiterUserId == null) return;

    const approved = input.decision === 'APPROVED';
    const reason = input.rejectionReason?.trim();

    await prisma.notification.create({
      data: {
        userId: input.recruiterUserId,
        type: approved ? 'JOB_APPROVED' : 'JOB_REJECTED',
        title: approved ? 'Job approved and live' : 'Job needs changes',
        body: approved
          ? `"${input.jobTitle}" has been approved and is now live.`
          : reason
            ? `"${input.jobTitle}" was not approved: ${reason}`
            : // Same generic fallback notifyKycDecision uses — the API requires a
              // reason on reject, so this only covers a legacy/blank row.
              `"${input.jobTitle}" was not approved. Review it and submit again.`,
        // A rejected job is back in DRAFT, so the job detail page is where the
        // recruiter can read the reason and resubmit. Recruiter-portal-relative:
        // NotificationBell does router.push() inside apps/recruiter.
        linkUrl: `/jobs/${input.jobId}`,
      },
    });
  }
}
