import { describe, expect, it } from 'vitest';
import {
  COMPANY_PROFILE_TOTAL,
  KYC_TOTAL,
  companyProfileDone,
  computeVerificationProgress,
  filled,
  formatList,
  missingCompanyFields,
  missingKycRequirements,
  type CompanyProfileFields,
  type KycFields,
  type VerificationInput,
} from './verification';

const FULL_COMPANY: CompanyProfileFields = {
  description: 'We build things.',
  logoUrl: 'https://cdn.example.com/logo.png',
  websiteUrl: 'https://example.com',
  companyType: 'STARTUP',
  industryId: 1,
  headquartersCityId: 1,
  employeeCount: '51-200',
  foundedYear: 2016,
};

// Presence-only by design — the raw GSTIN / legal name never leave the query
// layer, so this logic only ever sees booleans.
const FULL_KYC: KycFields = {
  status: 'NOT_SUBMITTED',
  hasLegalName: true,
  hasGstNumber: true,
  hasAuthorizedPersonName: true,
  docTypes: ['BUSINESS_REGISTRATION', 'AUTHORIZED_PERSON_ID'],
  rejectionReason: null,
};

function input(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    workEmailVerified: true,
    email: 'recruiter@example.com',
    company: FULL_COMPANY,
    kyc: FULL_KYC,
    kycDisabled: false,
    ...overrides,
  };
}

describe('companyProfileDone', () => {
  it('counts every filled column', () => {
    expect(companyProfileDone(FULL_COMPANY)).toBe(COMPANY_PROFILE_TOTAL);
  });

  it('treats a null company as nothing filled', () => {
    expect(companyProfileDone(null)).toBe(0);
    expect(missingCompanyFields(null)).toHaveLength(COMPANY_PROFILE_TOTAL);
  });

  it('does not count blank or whitespace-only strings', () => {
    const done = companyProfileDone({ ...FULL_COMPANY, description: '', websiteUrl: '   ' });
    expect(done).toBe(COMPANY_PROFILE_TOTAL - 2);
    expect(missingCompanyFields({ ...FULL_COMPANY, description: '' })).toEqual(['description']);
  });

  it('counts a numeric zero as filled — 0 is a real value, not an absence', () => {
    expect(companyProfileDone({ ...FULL_COMPANY, foundedYear: 0 })).toBe(COMPANY_PROFILE_TOTAL);
  });

  it('reports missing columns by their human label', () => {
    const missing = missingCompanyFields({ ...FULL_COMPANY, logoUrl: null, industryId: null });
    expect(missing).toEqual(['logo', 'industry']);
  });
});

describe('missingKycRequirements', () => {
  it('is empty when all five predicates are satisfied', () => {
    expect(missingKycRequirements(FULL_KYC)).toEqual([]);
  });

  // These five strings and their order mirror the API's own `missing[]` in
  // recruiter-kyc.service.ts. If this test fails because the API changed, the
  // dashboard must change with it — otherwise it tells recruiters they are
  // ready to submit when submit would be rejected.
  it('lists all five requirements when nothing has been provided', () => {
    expect(missingKycRequirements(null)).toEqual([
      'legal company name',
      'GST number',
      'authorized person name',
      'business registration document',
      'authorized person ID proof',
    ]);
    expect(missingKycRequirements(null)).toHaveLength(KYC_TOTAL);
  });

  it('detects each missing identifier independently', () => {
    expect(missingKycRequirements({ ...FULL_KYC, hasLegalName: false })).toEqual([
      'legal company name',
    ]);
    expect(missingKycRequirements({ ...FULL_KYC, hasGstNumber: false })).toEqual(['GST number']);
    expect(missingKycRequirements({ ...FULL_KYC, hasAuthorizedPersonName: false })).toEqual([
      'authorized person name',
    ]);
  });

  // The query layer reduces the identifiers to booleans with this same helper,
  // so a whitespace-only GSTIN must not count as provided.
  it('treats blank and whitespace-only identifiers as absent via filled()', () => {
    expect(filled('  ')).toBe(false);
    expect(filled('')).toBe(false);
    expect(filled(null)).toBe(false);
    expect(filled('29ABCDE1234F1Z5')).toBe(true);
  });

  it('detects each missing document independently', () => {
    expect(missingKycRequirements({ ...FULL_KYC, docTypes: ['AUTHORIZED_PERSON_ID'] })).toEqual([
      'business registration document',
    ]);
    expect(missingKycRequirements({ ...FULL_KYC, docTypes: ['BUSINESS_REGISTRATION'] })).toEqual([
      'authorized person ID proof',
    ]);
  });

  it('ignores document types it does not recognise', () => {
    expect(missingKycRequirements({ ...FULL_KYC, docTypes: ['SOMETHING_ELSE'] })).toHaveLength(2);
  });
});

describe('formatList', () => {
  it('renders zero, one, two and three items readably', () => {
    expect(formatList([])).toBe('');
    expect(formatList(['a'])).toBe('a');
    expect(formatList(['a', 'b'])).toBe('a and b');
    expect(formatList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('computeVerificationProgress — steps', () => {
  it('builds the three steps in order', () => {
    const p = computeVerificationProgress(input());
    expect(p.steps.map((s) => s.key)).toEqual(['work-email', 'company-profile', 'kyc']);
    expect(p.stepsTotal).toBe(3);
  });

  it('marks the work-email step done and names the inbox when it is not', () => {
    const done = computeVerificationProgress(input()).steps[0]!;
    expect(done.state).toBe('DONE');
    expect(done.detail).toBeNull();

    const todo = computeVerificationProgress(
      input({ workEmailVerified: false, email: 'me@corp.com' }),
    ).steps[0]!;
    expect(todo.state).toBe('TODO');
    expect(todo.detail).toContain('me@corp.com');
    // No resend endpoint exists, so the step must not link anywhere.
    expect(todo.href).toBeNull();
  });

  it('reports partial company-profile progress with what is left', () => {
    const step = computeVerificationProgress(
      input({ company: { ...FULL_COMPANY, logoUrl: null, foundedYear: null } }),
    ).steps[1]!;
    expect(step.state).toBe('TODO');
    expect(step.done).toBe(6);
    expect(step.total).toBe(COMPANY_PROFILE_TOTAL);
    expect(step.href).toBe('/profile');
    expect(step.detail).toBe('Still missing: logo and founded year.');
  });
});

describe('computeVerificationProgress — KYC state machine', () => {
  const kycStep = (kyc: KycFields | null) => computeVerificationProgress(input({ kyc })).steps[2]!;

  it('VERIFIED counts as fully done', () => {
    const step = kycStep({ ...FULL_KYC, status: 'VERIFIED' });
    expect(step.state).toBe('DONE');
    expect(step.done).toBe(KYC_TOTAL);
    expect(step.detail).toBeNull();
  });

  it('PENDING counts as done from the recruiter side and reads as under review', () => {
    const step = kycStep({ ...FULL_KYC, status: 'PENDING' });
    expect(step.state).toBe('IN_REVIEW');
    expect(step.done).toBe(KYC_TOTAL);
    expect(computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'PENDING' } })).stepsDone)
      .toBe(3);
  });

  it('REJECTED surfaces the reviewer reason and does not count as complete', () => {
    const step = kycStep({
      ...FULL_KYC,
      status: 'REJECTED',
      rejectionReason: 'GST certificate was unreadable.',
    });
    expect(step.state).toBe('ACTION_NEEDED');
    expect(step.detail).toBe('GST certificate was unreadable.');
    expect(
      computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'REJECTED' } })).stepsDone,
    ).toBe(2);
  });

  it('REJECTED falls back to generic copy when no reason was recorded', () => {
    expect(kycStep({ ...FULL_KYC, status: 'REJECTED', rejectionReason: '   ' }).detail).toBe(
      'Your submission needs changes before it can be approved.',
    );
  });

  it('a missing KYC row is identical to NOT_SUBMITTED', () => {
    const step = kycStep(null);
    expect(step.state).toBe('TODO');
    expect(step.done).toBe(0);
    expect(step.ctaLabel).toBe('Start verification');
    expect(step.detail).toContain('legal company name');
  });

  it('offers to continue once some requirements are already met', () => {
    const step = kycStep({ ...FULL_KYC, docTypes: [] });
    expect(step.done).toBe(3);
    expect(step.ctaLabel).toBe('Continue verification');
  });
});

describe('computeVerificationProgress — killswitch', () => {
  it('drops the KYC step entirely when the feature is switched off', () => {
    const p = computeVerificationProgress(input({ kyc: null, kycDisabled: true }));
    expect(p.steps.map((s) => s.key)).toEqual(['work-email', 'company-profile']);
    expect(p.stepsTotal).toBe(2);
    // Never link into /kyc, which 404s while the killswitch is on.
    expect(p.steps.some((s) => s.href === '/kyc')).toBe(false);
  });

  it('does not hold a switched-off feature against the recruiter', () => {
    const p = computeVerificationProgress(input({ kyc: null, kycDisabled: true }));
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
  });

  // Regression: the all-clear summary used to be a fixed sentence claiming
  // "company verification approved". With the killswitch on there is no KYC
  // step at all, so that sentence told the recruiter something untrue.
  it('never claims company verification when the KYC step was removed', () => {
    const p = computeVerificationProgress(input({ kyc: null, kycDisabled: true }));
    const summary = formatList(p.steps.map((s) => s.doneSummary));
    expect(summary).toBe('email confirmed and company profile complete');
    expect(summary).not.toContain('verification');
  });

  it('does claim company verification when KYC really was approved', () => {
    const p = computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'VERIFIED' } }));
    expect(formatList(p.steps.map((s) => s.doneSummary))).toBe(
      'email confirmed, company profile complete and company verification approved',
    );
  });
});

describe('computeVerificationProgress — totals', () => {
  it('is 100% and complete when every step is done', () => {
    const p = computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'VERIFIED' } }));
    expect(p.stepsDone).toBe(3);
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
  });

  it('is 0% when nothing has been started', () => {
    const p = computeVerificationProgress(
      input({ workEmailVerified: false, company: null, kyc: null }),
    );
    expect(p.stepsDone).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
  });

  it('weights each step equally rather than pooling sub-items', () => {
    // Email done, profile and KYC untouched. Equal thirds => 33%.
    // Pooling all 14 atomic checks would give 1/14 = 7% instead.
    const p = computeVerificationProgress(input({ company: null, kyc: null }));
    expect(p.percent).toBe(33);
  });

  it('gives fractional credit inside a step', () => {
    // Email 1/1 + profile 4/8 + KYC 0/5 => (1 + 0.5 + 0) / 3 = 50%.
    const p = computeVerificationProgress(
      input({
        company: {
          ...FULL_COMPANY,
          companyType: null,
          industryId: null,
          headquartersCityId: null,
          employeeCount: null,
        },
        kyc: null,
      }),
    );
    expect(p.steps[1]!.done).toBe(4);
    expect(p.percent).toBe(50);
  });

  // Regression: a REJECTED row still has all five requirements on file — the
  // API cannot reach PENDING without them and a review writes only the status
  // and reason. Crediting that as 5/5 drove the bar to 100% while the headline
  // beside it still read "2 of 3 complete", and screen readers were told
  // "Verification 100% complete" on an account that had just been turned down.
  it('never shows a full bar on a rejected submission', () => {
    const p = computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'REJECTED' } }));
    expect(p.steps[2]!.done).toBe(KYC_TOTAL); // all five ARE on file...
    expect(p.steps[2]!.fractionComplete).toBeLessThan(1); // ...but the step is not finished
    expect(p.stepsDone).toBe(2);
    expect(p.percent).toBeLessThan(100);
    expect(p.percent).toBe(93);
  });

  // The bar and the counter must never contradict each other, in any state.
  it('reaches 100% only when the headline counter is also complete', () => {
    const cases: VerificationInput[] = [
      input(),
      input({ workEmailVerified: false }),
      input({ company: null }),
      input({ kyc: null }),
      input({ kyc: { ...FULL_KYC, status: 'PENDING' } }),
      input({ kyc: { ...FULL_KYC, status: 'REJECTED' } }),
      input({ kyc: { ...FULL_KYC, status: 'VERIFIED' } }),
      input({ kyc: null, kycDisabled: true }),
      input({ workEmailVerified: false, company: null, kyc: null }),
      input({ company: { ...FULL_COMPANY, logoUrl: null }, kyc: { ...FULL_KYC, status: 'REJECTED' } }),
    ];
    for (const c of cases) {
      const p = computeVerificationProgress(c);
      expect(p.percent === 100).toBe(p.complete);
    }
  });

  it('counts a submitted-but-unreviewed KYC toward the total', () => {
    const p = computeVerificationProgress(input({ kyc: { ...FULL_KYC, status: 'PENDING' } }));
    expect(p.percent).toBe(100);
    // ...but the card must not claim "verified" until it is actually approved.
    expect(p.steps.every((s) => s.state === 'DONE')).toBe(false);
  });
});
