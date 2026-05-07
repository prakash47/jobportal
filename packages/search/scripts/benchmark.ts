import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(__dirname, '../../../.env') });

import { performance } from 'node:perf_hooks';
import { searchJobs } from '../src/queries/searchJobs';
import type { SearchJobsParams } from '../src/types';

// 50 representative queries — mix of free-text, multi-filter, multi-city.
// Per the prompt: target p95 < 100 ms locally on 10k seeded jobs.
const QUERIES: SearchJobsParams[] = [
  // free-text only
  { q: 'engineer' },
  { q: 'react' },
  { q: 'python' },
  { q: 'senior frontend' },
  { q: 'data scientist' },
  { q: 'devops kubernetes' },
  { q: 'product manager' },
  { q: 'backend node' },
  { q: 'ml engineer' },
  { q: 'site reliability' },
  // city filters
  { citySlugs: ['bangalore'] },
  { citySlugs: ['mumbai'] },
  { citySlugs: ['delhi'] },
  { citySlugs: ['hyderabad', 'pune'] },
  { citySlugs: ['bangalore', 'mumbai', 'pune'] },
  // skill filters
  { skillSlugs: ['react'] },
  { skillSlugs: ['python', 'aws'] },
  { skillSlugs: ['typescript', 'react', 'nodejs'] },
  // combined
  { q: 'engineer', citySlugs: ['bangalore'] },
  { q: 'frontend', citySlugs: ['mumbai'], skillSlugs: ['react'] },
  { q: 'data', citySlugs: ['hyderabad'], skillSlugs: ['python'] },
  { citySlugs: ['bangalore'], industrySlug: 'it-software' },
  { skillSlugs: ['kubernetes'], salaryMin: 1_500_000_00 },
  // sort variants
  { q: 'engineer', sort: 'recent' },
  { q: 'engineer', sort: 'salary_desc' },
  { citySlugs: ['bangalore'], sort: 'salary_desc' },
  // experience filters
  { minExperienceMonths: 60 },
  { minExperienceMonths: 24, maxExperienceMonths: 120 },
  // posted-within
  { postedWithinDays: 7 },
  { q: 'engineer', postedWithinDays: 1 },
  // pagination
  { q: 'engineer', page: 5 },
  { q: 'engineer', page: 10 },
  // edge cases
  { q: 'thisspecificthingdoesnotexistxyz' },
  {},
  { sort: 'recent' },
  { sort: 'salary_desc' },
  // big multi-city slugs
  { citySlugs: ['bangalore', 'mumbai', 'pune', 'hyderabad', 'chennai'] },
  { skillSlugs: ['react', 'python', 'aws', 'kubernetes', 'typescript'] },
  { q: 'engineer', skillSlugs: ['react'], citySlugs: ['bangalore', 'pune'], industrySlug: 'it-software' },
  // remaining filler to reach 50
  { q: 'manager' },
  { q: 'designer' },
  { q: 'qa' },
  { q: 'staff' },
  { q: 'principal' },
  { q: 'lead' },
  { q: 'java' },
  { q: 'go' },
  { q: 'aws' },
  { q: 'remote' },
  { q: 'analyst' },
  { q: 'senior' },
];

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.min(arr.length - 1, Math.floor(arr.length * p));
  return arr[idx]!;
}

async function main(): Promise<void> {
  console.log(`[benchmark] running ${QUERIES.length} queries...`);

  // 5 warm-up queries.
  for (let i = 0; i < 5; i += 1) await searchJobs(QUERIES[i % QUERIES.length]!);

  const latencies: number[] = [];
  for (const params of QUERIES) {
    const t0 = performance.now();
    await searchJobs(params);
    latencies.push(performance.now() - t0);
  }
  latencies.sort((a, b) => a - b);

  const min = latencies[0] ?? 0;
  const p50 = pct(latencies, 0.5);
  const p95 = pct(latencies, 0.95);
  const p99 = pct(latencies, 0.99);
  const max = latencies[latencies.length - 1] ?? 0;

  console.log(`[benchmark] n=${latencies.length}`);
  console.log(`  min: ${min.toFixed(1)} ms`);
  console.log(`  p50: ${p50.toFixed(1)} ms`);
  console.log(`  p95: ${p95.toFixed(1)} ms  ${p95 < 100 ? 'PASS' : 'FAIL'} (target < 100ms)`);
  console.log(`  p99: ${p99.toFixed(1)} ms`);
  console.log(`  max: ${max.toFixed(1)} ms`);

  if (p95 >= 100) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('[benchmark] failed:', err);
  process.exit(1);
});
