import type { PrismaClient } from '../../generated/client';

const industries: { slug: string; name: string }[] = [
  { slug: 'it-software', name: 'IT / Software' },
  { slug: 'banking-finance', name: 'Banking & Finance' },
  { slug: 'healthcare', name: 'Healthcare' },
  { slug: 'manufacturing', name: 'Manufacturing' },
  { slug: 'education', name: 'Education' },
  { slug: 'retail', name: 'Retail' },
  { slug: 'ecommerce', name: 'E-commerce' },
  { slug: 'media-advertising', name: 'Media & Advertising' },
  { slug: 'real-estate', name: 'Real Estate' },
  { slug: 'hospitality', name: 'Hospitality' },
];

export async function seedIndustries(prisma: PrismaClient): Promise<void> {
  for (const industry of industries) {
    await prisma.industry.upsert({
      where: { slug: industry.slug },
      update: {},
      create: industry,
    });
  }
  console.log(`  -> ${industries.length} industries upserted`);
}
