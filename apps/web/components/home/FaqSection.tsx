import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@jobportal/ui';
import { SectionHeading } from './SectionHeading';

// FAQ accordion — structural inspiration from Naukri's recruiter-landing FAQ,
// but jobseeker-facing and answering the questions our freemium model actually
// raises. Content is hardcoded here (no CMS dependency); promote to a content
// type if it grows past ~10 entries.

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Is JobPortal free for job seekers?',
    a: 'Yes. Searching jobs, applying, saving roles, and setting up job alerts are all completely free. We will never put a paywall between you and applying to a job.',
  },
  {
    q: 'How do I apply for a job?',
    a: 'Open any job and click Apply. If you are signed in with a complete profile, your application is sent instantly and you can track its status from your Applications dashboard.',
  },
  {
    q: 'Is there a limit on how many jobs I can apply to?',
    a: 'Free accounts can apply to a set number of jobs each day, which resets every 24 hours. This keeps applications meaningful for both you and recruiters.',
  },
  {
    q: 'How do job alerts work?',
    a: 'Create an alert for any search — a role, a city, a skill — and we email you new matching jobs at the frequency you choose: instantly, daily, or weekly. Unsubscribe anytime from any email.',
  },
  {
    q: 'How do recruiters contact me?',
    a: 'When you apply, the recruiter sees your profile and can move your application through their pipeline. You will be notified of every status change by email and in your dashboard.',
  },
  {
    q: 'I am a recruiter — how do I post a job?',
    a: 'Head to the recruiter portal, create a free account, verify your work email, and post your first role in minutes. Posting is free to start.',
  },
];

export function FaqSection() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <Accordion type="single" collapsible className="mt-2 border-t border-[var(--color-border)]">
        {FAQS.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger>{f.q}</AccordionTrigger>
            <AccordionContent>{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
