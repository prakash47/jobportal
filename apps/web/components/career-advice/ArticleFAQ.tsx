import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@jobportal/ui';

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface ArticleFAQProps {
  faqs: FaqEntry[];
}

// Calm Q/A list. Single-expand-at-a-time accordion to keep the visual line
// short. The page only renders this section when the article actually has
// FAQs; the FAQPage JSON-LD is also gated on the same condition.
export function ArticleFAQ({ faqs }: ArticleFAQProps) {
  if (faqs.length === 0) return null;
  return (
    <section className="space-y-4 border-t border-[var(--color-border)] pt-8" aria-label="Frequently asked questions">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--color-fg)]">
        Frequently asked
      </h2>
      <Accordion type="single" collapsible className="max-w-[70ch]">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={String(i)}>
            <AccordionTrigger>{f.question}</AccordionTrigger>
            <AccordionContent>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-[var(--color-fg)]">
                {f.answer}
              </p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
