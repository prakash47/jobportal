// Static FAQ content for the recruiter Help & Support section.
// Editing this file is the way FAQ content is updated (deliberate MVP choice —
// no CMS). Keep answers factual to how the portal actually behaves.

export type FaqCategory =
  | 'getting-started'
  | 'jobs'
  | 'applicants'
  | 'verification'
  | 'team'
  | 'account';

export interface FaqEntry {
  /** Kebab-case unique slug — used as the accordion item value + React key. */
  id: string;
  category: FaqCategory;
  question: string;
  /** Plain text; "\n\n" separates paragraphs. No markdown, no HTML. */
  answer: string;
}

export const FAQ_CATEGORIES: ReadonlyArray<{ key: FaqCategory; label: string }> = [
  { key: 'getting-started', label: 'Getting started' },
  { key: 'jobs', label: 'Job posting' },
  { key: 'applicants', label: 'Applicants' },
  { key: 'verification', label: 'Verification' },
  { key: 'team', label: 'Team' },
  { key: 'account', label: 'Account & settings' },
];

export const FAQ_ENTRIES: ReadonlyArray<FaqEntry> = [
  // --- Getting started -------------------------------------------------
  {
    id: 'create-recruiter-account',
    category: 'getting-started',
    question: 'How do I create a recruiter account?',
    answer:
      'Open the Career Queue recruiter portal and choose Register. You will be asked for your name, an Email ID, a password, and your company name. Registering always creates a new company on Career Queue, with you as its Owner.\n\nIf your company is already registered here, do not register again — joining an existing company is invite-only. Ask an Owner or Admin on that team to send you an invite from their Users panel.',
  },
  {
    id: 'verify-email-before-posting',
    category: 'getting-started',
    question: 'Why can I not post a job right after registering?',
    answer:
      'Job posting is enabled only after you verify your Email ID. A verification link is emailed to you when you register; clicking it unlocks posting. Until then you can sign in, set up your company profile, and invite teammates, but the portal will not accept a job post.\n\nIf the email has not arrived, check your spam or junk folder first. If it still does not turn up, raise a ticket via Help & Support, then Raise a ticket, and the team will send you a fresh link.',
  },
  {
    id: 'join-existing-company',
    category: 'getting-started',
    question: 'How do I join my company’s existing team on Career Queue?',
    answer:
      'You cannot self-register into a company that is already on Career Queue — team membership is controlled by invites. An Owner or Admin on the team invites you by email from the Users panel.\n\nYou will receive a link that is valid for 3 days and can be used once. Opening it lets you set your name and password, after which you are signed in as a member of that company.',
  },

  // --- Job posting -----------------------------------------------------
  {
    id: 'post-a-job',
    category: 'jobs',
    question: 'How do I post a job?',
    answer:
      'Open Jobs in the sidebar and choose to post a new job. The form takes the job title, description, location, skills, employment type and work mode, plus optional salary range and experience requirements. You can publish straight away or save the post as a draft and finish it later.\n\nPublishing submits the job for review by our team — it shows as “Under review” in your Jobs list until then, and goes live on the Career Queue job-seeker site and in search once approved. Posting jobs is currently free.',
  },
  {
    id: 'job-posting-limits',
    category: 'jobs',
    question: 'Is there a limit on how many jobs I can post?',
    answer:
      'Yes. Each recruiter account can publish up to 5 jobs per day and 30 jobs per month. Saving a draft does not use up a slot — only publishing counts against the limit.\n\nIf you reach a limit, the posting form tells you which window you have exhausted; you can publish again the next day (daily limit) or from the start of the next month (monthly limit).',
  },
  {
    id: 'edit-or-close-a-job',
    category: 'jobs',
    question: 'Can I edit or close a job after publishing it?',
    answer:
      'Yes. Open the job from your Jobs list to edit its details — changes to a live job are reflected on the public listing and in search shortly after you save.\n\nWhen a role is filled, use Close on the job row: the listing immediately stops appearing to job seekers. A closed or expired job can be reopened from the same list; reopening resubmits it for review, and it returns to search once approved.',
  },
  {
    id: 'job-statuses-explained',
    category: 'jobs',
    question: 'What do the job statuses Draft, Under review, Open, Closed and Expired mean?',
    answer:
      'Draft means the job is saved but not published — job seekers cannot see it. Under review means you have published it and our team is checking it before it goes live; job seekers cannot see it yet, and you are notified once it is approved. Open means it is live on the site and in search. Closed means you closed it yourself, and Expired means it passed the expiry date you set when posting; both are hidden from job seekers.\n\nIf a job needs changes we send it back to your drafts with a reason, so you can fix it and publish again. Closed and expired jobs keep their applicant list, and you can reopen either at any time from your Jobs list.',
  },

  // --- Applicants ------------------------------------------------------
  {
    id: 'view-and-manage-applicants',
    category: 'applicants',
    question: 'Where do I see the people who applied to my job?',
    answer:
      'Open Jobs in the sidebar and choose Applicants on any job you posted. Each application shows the candidate’s headline, experience, current title and expected salary; open one to see the full details, view the resume, update the application status, and keep notes that are never shown to the candidate.\n\nThe bell at the top of the portal also alerts you whenever a new application arrives on one of your jobs.',
  },
  {
    id: 'application-stages',
    category: 'applicants',
    question: 'What are the application stages and how do I move a candidate through them?',
    answer:
      'Applications move through Applied, In review, Shortlisted, Interviewed, Offered and Hired, one step at a time, and you can mark a candidate Rejected at any stage. The candidate receives an email each time you change their status.\n\nHired, Rejected and Withdrawn are final — no further changes are possible after them. Withdrawn means the candidate pulled out of the process themselves.',
  },
  {
    id: 'download-candidate-resume',
    category: 'applicants',
    question: 'How do I view a candidate’s resume?',
    answer:
      'Open the application from the Applicants list and choose to view the resume. It opens through a secure, time-limited link, so download it again from the portal rather than saving old links.\n\nIf the candidate has not uploaded a resume, the portal tells you there is none on file. Freshly uploaded resumes go through a virus scan before they can be opened, so a very recent upload may take a moment to become available.',
  },

  // --- Verification ----------------------------------------------------
  {
    id: 'what-is-company-verification',
    category: 'verification',
    question: 'What is company verification and is it mandatory?',
    answer:
      'Company verification (KYC) confirms your company’s identity with Career Queue. On the Verification page you fill in the legal name and identifiers such as GSTIN, PAN or a registration number, upload two supporting documents, and submit for review. Once approved, your company shows a Verified status in the portal.\n\nVerification is optional today — you can post jobs without it — but completing it builds trust and prepares your company for features that may require it later.',
  },
  {
    id: 'kyc-documents-and-formats',
    category: 'verification',
    question: 'Which documents do I need for verification, and in what format?',
    answer:
      'Two documents are needed: a proof of business registration (Certificate of Incorporation, GST registration certificate, Udyam registration or similar) and an ID proof of the authorised signatory (PAN, Aadhaar, Passport, Voter ID or Driving Licence).\n\nAccepted formats are PDF, PNG, JPG and WebP, up to 10 MB per file. Documents are stored privately and shared only with the review team — they are never made public.',
  },
  {
    id: 'kyc-review-and-rejection',
    category: 'verification',
    question: 'What happens after I submit verification, and what if it is rejected?',
    answer:
      'Submitting moves your verification to Pending, and your details and documents are locked while the review is in progress (and stay locked once Verified). A reviewer then marks the submission Verified or Rejected.\n\nIf it is rejected, the reason is shown on your Verification page — you can correct the details, replace documents, and resubmit. If you believe the rejection is a mistake, raise a ticket via Help & Support, then Raise a ticket.',
  },

  // --- Team ------------------------------------------------------------
  {
    id: 'invite-a-teammate',
    category: 'team',
    question: 'How do I invite a teammate to our company account?',
    answer:
      'Owners and Admins can invite teammates from the Users panel. Enter the teammate’s email, pick their role, and optionally adjust their per-module permissions before sending. Admins can invite Members only; granting the Admin or Owner role needs an Owner.\n\nThe invite is emailed as a single-use link valid for 3 days, and pending invites can be revoked from the same panel. The email must not already have an account on Career Queue — invites create a fresh account on that team.',
  },
  {
    id: 'owner-admin-member-roles',
    category: 'team',
    question: 'What is the difference between Owner, Admin and Member?',
    answer:
      'An Owner has full control of the team, including managing other Owners and Admins. An Admin can invite, edit and remove Members, but cannot change Owners or other Admins and cannot grant those roles. A Member has no team-management rights and simply works within the modules they have access to.\n\nEvery company always keeps at least one Owner — the portal blocks removing or demoting the last one.',
  },
  {
    id: 'per-module-permissions',
    category: 'team',
    question: 'How do per-module permissions work?',
    answer:
      'Each teammate’s access can be tuned per module — Jobs, Applicants, Company profile, Verification and Notifications — at one of three levels: Edit, Read-only or No access.\n\nBy default, Owners and Admins have edit access everywhere, while Members can work on jobs, applicants and their own notification settings but get read-only access to the company profile and verification. An Owner or Admin can override these defaults for any member from the Users panel.',
  },
  {
    id: 'remove-a-teammate',
    category: 'team',
    question: 'How do I remove someone from the team, and is it reversible?',
    answer:
      'Owners and Admins remove teammates from the Users panel (Admins can remove Members only). A removed teammate is deactivated, signed out of all devices, and blocked from signing in again; their past work, such as posted jobs, stays intact. You cannot remove yourself or the team’s last Owner.\n\nRemoval is reversible: invite the same email again from the Users panel and the account is reactivated immediately with the role you choose.',
  },

  // --- Account & settings ----------------------------------------------
  {
    id: 'change-password',
    category: 'account',
    question: 'How do I change my password?',
    answer:
      'Go to Settings, then Change password. Enter your current password and a new one — at least 8 characters including a number and a special character, and different from the current password.\n\nAfter the change you stay signed in on the device you used, and every other device is signed out as a safety measure.',
  },
  {
    id: 'manage-notifications',
    category: 'account',
    question: 'How do notifications work, and how do I manage them?',
    answer:
      'The bell at the top of the portal shows your in-app alerts — new applications on your jobs and decisions on your company’s verification — with an unread count. You can mark alerts read one by one or all at once, and in-app alerts are always on.\n\nUnder Settings, then Notification settings, you can switch email notifications for your account on or off. SMS notifications are not available yet and are marked coming soon.',
  },
  {
    id: 'update-company-profile-and-logo',
    category: 'account',
    question: 'How do I update our company details and logo?',
    answer:
      'Open the Profile tab. You can edit your own details there, and — with edit access to the company profile — the company’s name, description, website, company type, industry, headquarters city, size and founding year. Changes appear on your public company page on the job-seeker site.\n\nThe logo accepts PNG, JPG or WebP images up to 2 MB (SVG is not accepted). Company details are shared by your whole team; Members have read-only access to them by default.',
  },
];
