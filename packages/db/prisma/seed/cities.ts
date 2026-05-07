import type { PrismaClient } from '../../generated/client';

// 50 Indian cities — top metros + tier-1/2 (sorted roughly by tech-job density).
// `country` defaults to 'India' on the City model.

const cities: { slug: string; name: string; state: string }[] = [
  { slug: 'bangalore', name: 'Bangalore', state: 'Karnataka' },
  { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  { slug: 'delhi', name: 'Delhi', state: 'Delhi' },
  { slug: 'hyderabad', name: 'Hyderabad', state: 'Telangana' },
  { slug: 'chennai', name: 'Chennai', state: 'Tamil Nadu' },
  { slug: 'pune', name: 'Pune', state: 'Maharashtra' },
  { slug: 'kolkata', name: 'Kolkata', state: 'West Bengal' },
  { slug: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat' },
  { slug: 'gurgaon', name: 'Gurgaon', state: 'Haryana' },
  { slug: 'noida', name: 'Noida', state: 'Uttar Pradesh' },
  { slug: 'jaipur', name: 'Jaipur', state: 'Rajasthan' },
  { slug: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh' },
  { slug: 'chandigarh', name: 'Chandigarh', state: 'Chandigarh' },
  { slug: 'indore', name: 'Indore', state: 'Madhya Pradesh' },
  { slug: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh' },
  { slug: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu' },
  { slug: 'kochi', name: 'Kochi', state: 'Kerala' },
  { slug: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala' },
  { slug: 'vadodara', name: 'Vadodara', state: 'Gujarat' },
  { slug: 'visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { slug: 'nashik', name: 'Nashik', state: 'Maharashtra' },
  { slug: 'nagpur', name: 'Nagpur', state: 'Maharashtra' },
  { slug: 'surat', name: 'Surat', state: 'Gujarat' },
  { slug: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh' },
  { slug: 'ludhiana', name: 'Ludhiana', state: 'Punjab' },
  { slug: 'mysuru', name: 'Mysuru', state: 'Karnataka' },
  { slug: 'mangalore', name: 'Mangalore', state: 'Karnataka' },
  { slug: 'bhubaneswar', name: 'Bhubaneswar', state: 'Odisha' },
  { slug: 'kanpur', name: 'Kanpur', state: 'Uttar Pradesh' },
  { slug: 'patna', name: 'Patna', state: 'Bihar' },
  { slug: 'agra', name: 'Agra', state: 'Uttar Pradesh' },
  { slug: 'faridabad', name: 'Faridabad', state: 'Haryana' },
  { slug: 'ghaziabad', name: 'Ghaziabad', state: 'Uttar Pradesh' },
  { slug: 'meerut', name: 'Meerut', state: 'Uttar Pradesh' },
  { slug: 'rajkot', name: 'Rajkot', state: 'Gujarat' },
  { slug: 'jabalpur', name: 'Jabalpur', state: 'Madhya Pradesh' },
  { slug: 'ranchi', name: 'Ranchi', state: 'Jharkhand' },
  { slug: 'howrah', name: 'Howrah', state: 'West Bengal' },
  { slug: 'dhanbad', name: 'Dhanbad', state: 'Jharkhand' },
  { slug: 'prayagraj', name: 'Prayagraj', state: 'Uttar Pradesh' },
  { slug: 'amritsar', name: 'Amritsar', state: 'Punjab' },
  { slug: 'aurangabad', name: 'Aurangabad', state: 'Maharashtra' },
  { slug: 'solapur', name: 'Solapur', state: 'Maharashtra' },
  { slug: 'madurai', name: 'Madurai', state: 'Tamil Nadu' },
  { slug: 'guwahati', name: 'Guwahati', state: 'Assam' },
  { slug: 'jodhpur', name: 'Jodhpur', state: 'Rajasthan' },
  { slug: 'raipur', name: 'Raipur', state: 'Chhattisgarh' },
  { slug: 'jamshedpur', name: 'Jamshedpur', state: 'Jharkhand' },
  { slug: 'tiruchirappalli', name: 'Tiruchirappalli', state: 'Tamil Nadu' },
  { slug: 'salem', name: 'Salem', state: 'Tamil Nadu' },
];

export async function seedCities(prisma: PrismaClient): Promise<void> {
  for (const city of cities) {
    await prisma.city.upsert({
      where: { slug: city.slug },
      update: {},
      create: city,
    });
  }
  console.log(`  -> ${cities.length} cities upserted`);
}
