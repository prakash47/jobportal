import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma, type Candidate } from '@jobportal/db';
import { buildDiff, isDiffEmpty } from './audit';
import { computeCompleteness } from './completeness';
import type { ProfilePatchInput } from './dto';
import { stripUndefined } from './strip-undefined';

// What the GET /me/profile endpoint returns. Server-side joins User + Candidate
// so the web layer is a single network round-trip.
export interface ProfileView {
  user: { id: number; email: string; name: string; phone: string | null; emailVerified: boolean };
  candidate: Candidate;
  educationCount: number;
  experienceCount: number;
}

@Injectable()
export class ProfileService {
  async getProfile(userId: number): Promise<ProfileView> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, emailVerified: true },
    });
    if (!user) throw new NotFoundException('User not found');

    let candidate = await prisma.candidate.findUnique({ where: { userId } });
    // Lazily provision the Candidate row on first profile read — registration
    // creates the User but the Candidate gets filled in here on demand.
    if (!candidate) {
      candidate = await prisma.candidate.create({ data: { userId } });
    }

    const [educationCount, experienceCount] = await Promise.all([
      prisma.education.count({ where: { candidateId: candidate.id } }),
      prisma.workExperience.count({ where: { candidateId: candidate.id } }),
    ]);

    return { user, candidate, experienceCount, educationCount };
  }

  async updateProfile(userId: number, input: ProfilePatchInput): Promise<ProfileView> {
    // Validate the industry FK up front so a bad id is a clean 404, not a raw
    // Postgres FK-violation 500 from the update below.
    if (input.industryId !== undefined) {
      const industry = await prisma.industry.findUnique({
        where: { id: input.industryId },
        select: { id: true },
      });
      if (!industry) throw new NotFoundException('Industry not found');
    }

    const before = await this.getProfile(userId);

    // Split the input: name + phone live on User, the rest on Candidate.
    const { name, phone, ...candidateFields } = input;

    const userPatch = stripUndefined({ name, phone }) as unknown as Prisma.UserUpdateInput;
    const candidatePatch = stripUndefined({
      ...candidateFields,
    }) as unknown as Prisma.CandidateUpdateInput;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userPatch });
      }
      if (Object.keys(candidatePatch).length > 0) {
        await tx.candidate.update({
          where: { userId },
          data: candidatePatch,
        });
      }

      // Recompute completeness server-side regardless — Education / Experience
      // counts feed into the score and may have changed since last write.
      const [user, candidate, educationCount, experienceCount] = await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: userId } }),
        tx.candidate.findUniqueOrThrow({ where: { userId } }),
        tx.education.count({ where: { candidate: { userId } } }),
        tx.workExperience.count({ where: { candidate: { userId } } }),
      ]);

      const score = computeCompleteness({
        name: user.name,
        phone: user.phone,
        headline: candidate.headline,
        summary: candidate.summary,
        experienceMonths: candidate.experienceMonths,
        currentTitle: candidate.currentTitle,
        currentCompanyId: candidate.currentCompanyId,
        currentCompanyName: candidate.currentCompanyName,
        expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
        noticePeriodDays: candidate.noticePeriodDays,
        preferredCityIds: candidate.preferredCityIds,
        skillIds: candidate.skillIds,
        educationCount,
        experienceCount,
        hasActiveResume: candidate.activeResumeId !== null,
      });
      if (score !== candidate.profileCompleteness) {
        await tx.candidate.update({ where: { userId }, data: { profileCompleteness: score } });
      }
    });

    const after = await this.getProfile(userId);

    // Audit row — diff covers User-side and Candidate-side fields.
    const diff = buildDiff(
      flatten(before.user, before.candidate),
      flatten(after.user, after.candidate),
    );
    if (!isDiffEmpty(diff)) {
      await prisma.profileAuditLog.create({
        data: {
          userId,
          action: 'PROFILE_UPDATE',
          diff: diff as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return after;
  }
}

// Pulls the audit-relevant fields off a (User, Candidate) pair into a single
// flat record so buildDiff() can scan them in one pass.
function flatten(u: ProfileView['user'], c: Candidate): Record<string, unknown> {
  return {
    name: u.name,
    phone: u.phone,
    headline: c.headline,
    summary: c.summary,
    experienceMonths: c.experienceMonths,
    currentTitle: c.currentTitle,
    currentCompanyId: c.currentCompanyId,
    currentSalaryPaise: c.currentSalaryPaise,
    expectedSalaryMinPaise: c.expectedSalaryMinPaise,
    expectedSalaryMaxPaise: c.expectedSalaryMaxPaise,
    noticePeriodDays: c.noticePeriodDays,
    preferredCityIds: c.preferredCityIds,
    preferredWorkModes: c.preferredWorkModes,
    preferredJobTypes: c.preferredJobTypes,
    workStatus: c.workStatus,
    lookingFor: c.lookingFor,
    currentCompanyName: c.currentCompanyName,
    currentCityName: c.currentCityName,
    industryId: c.industryId,
    gender: c.gender,
  };
}

// Exposed so other profile services (education/experience/skills) can recompute
// the completeness score after their own writes without duplicating the
// Candidate fetch.
export async function recomputeCompleteness(userId: number): Promise<void> {
  const candidate = await prisma.candidate.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, phone: true } },
    },
  });
  if (!candidate) return;
  const [educationCount, experienceCount] = await Promise.all([
    prisma.education.count({ where: { candidateId: candidate.id } }),
    prisma.workExperience.count({ where: { candidateId: candidate.id } }),
  ]);
  const score = computeCompleteness({
    name: candidate.user.name,
    phone: candidate.user.phone,
    headline: candidate.headline,
    summary: candidate.summary,
    experienceMonths: candidate.experienceMonths,
    currentTitle: candidate.currentTitle,
    currentCompanyId: candidate.currentCompanyId,
    currentCompanyName: candidate.currentCompanyName,
    expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
    noticePeriodDays: candidate.noticePeriodDays,
    preferredCityIds: candidate.preferredCityIds,
    skillIds: candidate.skillIds,
    educationCount,
    experienceCount,
    hasActiveResume: candidate.activeResumeId !== null,
  });
  if (score !== candidate.profileCompleteness) {
    await prisma.candidate.update({ where: { userId }, data: { profileCompleteness: score } });
  }
}
