import type { PrismaClient } from '../../generated/client';

// Job functions / departments — the "Department" dropdown on the Post a Job
// form (Job.functionalAreaId → FunctionalArea). Previously unseeded, so the
// dropdown was empty; this backfills a Naukri-style catalogue.

const functionalAreas: { slug: string; name: string }[] = [
  { slug: 'engineering-software-qa', name: 'Engineering — Software & QA' },
  { slug: 'engineering-hardware-networks', name: 'Engineering — Hardware & Networks' },
  { slug: 'it-information-security', name: 'IT & Information Security' },
  { slug: 'data-science-analytics', name: 'Data Science & Analytics' },
  { slug: 'product-management', name: 'Product Management' },
  { slug: 'design-ux', name: 'Design & User Experience' },
  { slug: 'sales-business-development', name: 'Sales & Business Development' },
  { slug: 'marketing-communications', name: 'Marketing & Communications' },
  { slug: 'human-resources', name: 'Human Resources' },
  { slug: 'finance-accounting', name: 'Finance & Accounting' },
  { slug: 'operations', name: 'Operations' },
  { slug: 'customer-success-support', name: 'Customer Success & Support' },
  { slug: 'consulting', name: 'Consulting' },
  { slug: 'legal-compliance', name: 'Legal & Compliance' },
  { slug: 'administration-facilities', name: 'Administration & Facilities' },
  { slug: 'content-editorial', name: 'Content & Editorial' },
  { slug: 'project-program-management', name: 'Project & Program Management' },
  { slug: 'research-development', name: 'Research & Development' },
  { slug: 'supply-chain-logistics', name: 'Supply Chain & Logistics' },
  { slug: 'healthcare-life-sciences', name: 'Healthcare & Life Sciences' },
];

export async function seedFunctionalAreas(prisma: PrismaClient): Promise<void> {
  for (const fa of functionalAreas) {
    await prisma.functionalArea.upsert({
      where: { slug: fa.slug },
      update: {},
      create: fa,
    });
  }
  console.log(`  -> ${functionalAreas.length} functional areas upserted`);
}
