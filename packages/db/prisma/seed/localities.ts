import type { PrismaClient } from '../../generated/client';

// Curated sub-city areas/localities for the major hiring cities — the second
// level of the Post a Job "City → Area" selector (Locality → City). Keyed by
// city slug (must match seed/cities.ts); the city id is resolved at seed time.
// Cities not listed here simply have no areas yet (the Area field is optional).

const LOCALITIES_BY_CITY: Record<string, string[]> = {
  bangalore: [
    'Koramangala',
    'Indiranagar',
    'Whitefield',
    'Electronic City',
    'HSR Layout',
    'Marathahalli',
    'MG Road',
    'Jayanagar',
    'Bellandur',
    'Hebbal',
  ],
  mumbai: [
    'Andheri',
    'Bandra Kurla Complex',
    'Powai',
    'Lower Parel',
    'Goregaon',
    'Malad',
    'Navi Mumbai',
    'Thane',
  ],
  delhi: ['Connaught Place', 'Nehru Place', 'Saket', 'Okhla', 'Dwarka', 'Rohini', 'Aerocity'],
  hyderabad: [
    'HITEC City',
    'Gachibowli',
    'Madhapur',
    'Banjara Hills',
    'Kondapur',
    'Begumpet',
    'Financial District',
  ],
  chennai: ['OMR', 'Guindy', 'T Nagar', 'Ambattur', 'Perungudi', 'Velachery', 'Taramani'],
  pune: ['Hinjewadi', 'Kharadi', 'Magarpatta', 'Baner', 'Viman Nagar', 'Wakad', 'Yerwada'],
  kolkata: ['Salt Lake Sector V', 'New Town', 'Park Street', 'Rajarhat', 'Ballygunge'],
  gurgaon: ['Cyber City', 'Udyog Vihar', 'Sohna Road', 'Golf Course Road', 'MG Road', 'Sector 44'],
  noida: ['Sector 62', 'Sector 63', 'Sector 16', 'Sector 135', 'Sector 18', 'Sector 125'],
  ahmedabad: ['SG Highway', 'Prahlad Nagar', 'Navrangpura', 'Bodakdev', 'Satellite'],
  kochi: ['Infopark Kakkanad', 'Kakkanad', 'MG Road', 'Edappally'],
  chandigarh: ['IT Park', 'Sector 17', 'Sector 34', 'Industrial Area'],
  coimbatore: ['Peelamedu', 'Saravanampatti', 'RS Puram', 'Singanallur'],
  jaipur: ['Malviya Nagar', 'Mansarovar', 'Vaishali Nagar', 'C-Scheme'],
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function seedLocalities(prisma: PrismaClient): Promise<void> {
  let count = 0;
  for (const [citySlug, names] of Object.entries(LOCALITIES_BY_CITY)) {
    const city = await prisma.city.findUnique({ where: { slug: citySlug }, select: { id: true } });
    if (!city) {
      console.warn(`  ! locality seed: city '${citySlug}' not found — skipping its areas`);
      continue;
    }
    for (const name of names) {
      // Globally-unique slug: prefix with the city so two cities can share an
      // area name (e.g. "MG Road" in Delhi and Kochi).
      const slug = `${citySlug}-${slugify(name)}`;
      await prisma.locality.upsert({
        where: { slug },
        update: {},
        create: { slug, name, cityId: city.id },
      });
      count += 1;
    }
  }
  console.log(`  -> ${count} localities upserted`);
}
