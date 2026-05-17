// Demo data — synthetic Indian job market.
//
// Goal (PROGRESS.md chip #10): make /home and /jobs / /companies render
// against realistic-looking data so we can demo to stakeholders without
// scraping a competitor (illegal + brand-risky — see CLAUDE.md §9).
//
// Every company name here is fictional. Salaries are in INR LPA bands
// that match what's actually paid for these roles in India in 2026.
// Posting dates are spread across the last ~30 days so the "posted
// within" filter has a believable distribution.
//
// Re-running this seed is idempotent: companies + recruiters + jobs
// upsert by their canonical slug; reviews are deleted-and-reinserted
// per company so the count + denorm averageRating stay consistent.
//
// To run: `pnpm db:seed:demo` (after reference data has been seeded
// via the normal `pnpm db:seed`).

import argon2 from 'argon2';
import type { PrismaClient } from '../../generated/client';

// ============================================================
// Companies — 12, spread across the 10 seeded industries
// ============================================================

interface CompanyTemplate {
  slug: string;
  name: string;
  description: string;
  industrySlug: string;
  hqCitySlug: string;
  employeeCount: string;
  foundedYear: number;
}

const COMPANIES: CompanyTemplate[] = [
  {
    slug: 'nimbus-cloud-systems',
    name: 'Nimbus Cloud Systems',
    description:
      'Cloud-native infrastructure and developer tools for Indian enterprises. We build the backbone that powers a third of the country\'s SaaS startups.',
    industrySlug: 'it-software',
    hqCitySlug: 'bangalore',
    employeeCount: '1,000-5,000',
    foundedYear: 2014,
  },
  {
    slug: 'veridian-analytics',
    name: 'Veridian Analytics',
    description:
      'Data and ML platform for retail, BFSI, and pharma. Helping 400+ enterprise customers turn operational data into measurable business outcomes.',
    industrySlug: 'it-software',
    hqCitySlug: 'hyderabad',
    employeeCount: '500-1,000',
    foundedYear: 2017,
  },
  {
    slug: 'sahaj-pay',
    name: 'Sahaj Pay',
    description:
      'Payments infrastructure for Indian businesses. UPI, cards, recurring, and cross-border — one API, one dashboard, one team.',
    industrySlug: 'banking-finance',
    hqCitySlug: 'mumbai',
    employeeCount: '200-500',
    foundedYear: 2019,
  },
  {
    slug: 'lumen-health',
    name: 'Lumen Health',
    description:
      'Patient-first hospital software covering OPD, IPD, pharmacy, and diagnostics. Trusted by 60+ multi-specialty hospitals across India.',
    industrySlug: 'healthcare',
    hqCitySlug: 'bangalore',
    employeeCount: '200-500',
    foundedYear: 2018,
  },
  {
    slug: 'pathshala-learning',
    name: 'Pathshala Learning',
    description:
      'Online classes and personalised practice for K-12 students. Working with 800 schools and 1.2M students across 14 states.',
    industrySlug: 'education',
    hqCitySlug: 'pune',
    employeeCount: '500-1,000',
    foundedYear: 2020,
  },
  {
    slug: 'kirana-stack',
    name: 'Kirana Stack',
    description:
      'POS, inventory, and credit for India\'s 13M kirana stores. Now live in 280 cities with 90,000 active merchants on the platform.',
    industrySlug: 'retail',
    hqCitySlug: 'delhi',
    employeeCount: '100-500',
    foundedYear: 2021,
  },
  {
    slug: 'rasta-logistics',
    name: 'Rasta Logistics',
    description:
      'Tech-first 3PL for D2C brands. Same-day in metros, two-day pan-India, with real-time visibility down to the SKU.',
    industrySlug: 'ecommerce',
    hqCitySlug: 'gurgaon',
    employeeCount: '1,000-5,000',
    foundedYear: 2015,
  },
  {
    slug: 'margdarshi-media',
    name: 'Margdarshi Media',
    description:
      'Vernacular-first digital publishing across Hindi, Tamil, Telugu, and Marathi. Reaching 28M readers a month.',
    industrySlug: 'media-advertising',
    hqCitySlug: 'mumbai',
    employeeCount: '200-500',
    foundedYear: 2016,
  },
  {
    slug: 'anvaya-realty',
    name: 'Anvaya Realty',
    description:
      'Residential and commercial real-estate across South India. 14 active projects, ~6M sq ft delivered.',
    industrySlug: 'real-estate',
    hqCitySlug: 'bangalore',
    employeeCount: '500-1,000',
    foundedYear: 2009,
  },
  {
    slug: 'tarang-hotels',
    name: 'Tarang Hotels & Resorts',
    description:
      'A chain of 22 boutique hotels and 9 resorts across the Western Ghats, Goa, and Kerala backwaters.',
    industrySlug: 'hospitality',
    hqCitySlug: 'chennai',
    employeeCount: '1,000-5,000',
    foundedYear: 2012,
  },
  {
    slug: 'suchak-manufacturing',
    name: 'Suchak Manufacturing',
    description:
      'Precision auto components for two-wheeler and tractor OEMs. Three plants across Pune and Aurangabad, ~₹1,400 cr annual revenue.',
    industrySlug: 'manufacturing',
    hqCitySlug: 'pune',
    employeeCount: '5,000-10,000',
    foundedYear: 2002,
  },
  {
    slug: 'sutra-labs',
    name: 'Sutra Labs',
    description:
      'Applied AI for healthcare imaging — radiology workflow automation, screening, and second-read tools. YC W22.',
    industrySlug: 'it-software',
    hqCitySlug: 'bangalore',
    employeeCount: '50-200',
    foundedYear: 2022,
  },
];

// ============================================================
// Recruiters — 8 (one per top-hiring company; each can post jobs)
// ============================================================

interface RecruiterTemplate {
  companySlug: string;
  email: string;
  workEmail: string;
  name: string;
  designation: string;
}

const RECRUITERS: RecruiterTemplate[] = [
  {
    companySlug: 'nimbus-cloud-systems',
    email: 'priya.sharma+demo@jobportal.dev',
    workEmail: 'priya.sharma@nimbuscloud.demo',
    name: 'Priya Sharma',
    designation: 'Senior Talent Partner',
  },
  {
    companySlug: 'veridian-analytics',
    email: 'rohan.mehta+demo@jobportal.dev',
    workEmail: 'rohan.mehta@veridian.demo',
    name: 'Rohan Mehta',
    designation: 'Head of Talent',
  },
  {
    companySlug: 'sahaj-pay',
    email: 'aditi.iyer+demo@jobportal.dev',
    workEmail: 'aditi.iyer@sahajpay.demo',
    name: 'Aditi Iyer',
    designation: 'Talent Lead',
  },
  {
    companySlug: 'lumen-health',
    email: 'karthik.reddy+demo@jobportal.dev',
    workEmail: 'karthik.reddy@lumenhealth.demo',
    name: 'Karthik Reddy',
    designation: 'People Operations Manager',
  },
  {
    companySlug: 'pathshala-learning',
    email: 'aarti.singh+demo@jobportal.dev',
    workEmail: 'aarti.singh@pathshala.demo',
    name: 'Aarti Singh',
    designation: 'Recruiting Manager',
  },
  {
    companySlug: 'kirana-stack',
    email: 'vivek.patel+demo@jobportal.dev',
    workEmail: 'vivek.patel@kiranastack.demo',
    name: 'Vivek Patel',
    designation: 'Talent Acquisition',
  },
  {
    companySlug: 'rasta-logistics',
    email: 'neha.kapoor+demo@jobportal.dev',
    workEmail: 'neha.kapoor@rasta.demo',
    name: 'Neha Kapoor',
    designation: 'Senior Recruiter',
  },
  {
    companySlug: 'sutra-labs',
    email: 'sanjay.verma+demo@jobportal.dev',
    workEmail: 'sanjay.verma@sutralabs.demo',
    name: 'Sanjay Verma',
    designation: 'Founding Recruiter',
  },
];

// All demo recruiters share one password so they're easy to log into for
// demo purposes. Production seed wouldn't do this. The hash is computed
// once per run.
const DEMO_RECRUITER_PASSWORD = 'demo-recruiter-pass-2026!';

// ============================================================
// Reviews — 3-5 per company, mix of positive/neutral/critical
// ============================================================

interface ReviewTemplate {
  companySlug: string;
  rating: number; // 1-5
  title: string;
  body: string;
}

const REVIEWS: ReviewTemplate[] = [
  // Nimbus Cloud Systems — strong tech, mature processes
  { companySlug: 'nimbus-cloud-systems', rating: 5, title: 'Great place to build at scale', body: 'Genuinely high-quality engineering work, calm review culture, no late-night Slack pings. Comp is in the top decile for Bangalore.' },
  { companySlug: 'nimbus-cloud-systems', rating: 4, title: 'Solid place, mature org', body: 'Good benefits and a real engineering manager track. The pace is steady rather than frantic, which suits me; some folks find it slow.' },
  { companySlug: 'nimbus-cloud-systems', rating: 4, title: 'Career growth is real here', body: 'Promotions are tied to documented impact, not who you know. Cross-team rotations are encouraged.' },
  { companySlug: 'nimbus-cloud-systems', rating: 3, title: 'Strong eng, weaker product', body: 'Engineering is great. Product management is hit-or-miss and roadmaps shift more than they should.' },

  // Veridian Analytics — data culture, intense
  { companySlug: 'veridian-analytics', rating: 5, title: 'Best data work I have done', body: 'Real customers, real stakes, no toy dashboards. Senior leadership is technically sharp.' },
  { companySlug: 'veridian-analytics', rating: 4, title: 'Demanding but worth it', body: 'Long hours during go-lives but real comp upside and the learning curve is steep in a good way.' },
  { companySlug: 'veridian-analytics', rating: 3, title: 'Intense, somewhat siloed', body: 'Data and engineering teams don\'t talk enough. Good leaders but middle management is mixed.' },

  // Sahaj Pay — fintech, strong product
  { companySlug: 'sahaj-pay', rating: 5, title: 'Move fast, ship clean', body: 'PR review culture is great, on-call is manageable, founders genuinely care about engineering quality.' },
  { companySlug: 'sahaj-pay', rating: 4, title: 'Great product team', body: 'PMs are deeply technical, design is treated as a first-class function. Hybrid policy works well.' },
  { companySlug: 'sahaj-pay', rating: 5, title: 'Top-decile fintech', body: 'Comp matches the best in the market. Equity is real.' },
  { companySlug: 'sahaj-pay', rating: 4, title: 'Strong technical bar', body: 'Hiring bar is high which keeps the team strong. Onboarding can be a bit fast though.' },

  // Lumen Health — healthcare SaaS
  { companySlug: 'lumen-health', rating: 4, title: 'Mission-driven, hospital-grade reliability', body: 'Codebase is mature, testing culture is real (because lives depend on it). Pay is competitive.' },
  { companySlug: 'lumen-health', rating: 4, title: 'Healthcare done right', body: 'Real impact when you ship — a feature you build today affects patient care tomorrow.' },
  { companySlug: 'lumen-health', rating: 3, title: 'Slower release cadence', body: 'Quarterly releases (for good regulatory reasons), but it can feel slow vs pure SaaS.' },

  // Pathshala Learning — edtech, mission heavy
  { companySlug: 'pathshala-learning', rating: 4, title: 'Mission you can believe in', body: 'Working with 800 schools is a different feeling than B2C. Real conversations with teachers and principals.' },
  { companySlug: 'pathshala-learning', rating: 3, title: 'Edtech is hard', body: 'School seasonality means uneven workload. Comp is fair but not top-tier.' },
  { companySlug: 'pathshala-learning', rating: 4, title: 'Solid managers', body: 'My EM is a great coach and that has changed my career trajectory.' },

  // Kirana Stack — early-stage, intense
  { companySlug: 'kirana-stack', rating: 5, title: 'Best startup decision I made', body: 'Tiny team, real ownership, founders sit next to engineering. If you want pace, this is it.' },
  { companySlug: 'kirana-stack', rating: 4, title: 'Bootstrap energy in a Series B', body: 'Still feels like a Series A despite the funding. Long hours but you ship things that matter.' },
  { companySlug: 'kirana-stack', rating: 3, title: 'Wear-many-hats culture', body: 'Good if you like ambiguity, less good if you want structure.' },

  // Rasta Logistics — operational, growing fast
  { companySlug: 'rasta-logistics', rating: 4, title: 'Real ops + real tech', body: 'Built logistics tech from scratch — control tower, allocations, mile-by-mile tracking. Career-defining work.' },
  { companySlug: 'rasta-logistics', rating: 3, title: 'Growing pains', body: '5x revenue growth means processes lag. Some teams are firefighting, others have it figured out.' },
  { companySlug: 'rasta-logistics', rating: 4, title: 'Better than I expected', body: 'Stable team, good benefits, NCR office is well set up.' },
  { companySlug: 'rasta-logistics', rating: 3, title: 'Logistics is operational', body: '24/7 ops means on-call is real. Comp is fair but not exceptional.' },

  // Margdarshi Media — content, journalist culture
  { companySlug: 'margdarshi-media', rating: 4, title: 'Journalism with a tech spine', body: 'Engineers respect editorial, editorial respects engineers. Rare in media.' },
  { companySlug: 'margdarshi-media', rating: 4, title: 'Strong editorial standards', body: 'No clickbait pressure. Vernacular content reach is genuinely impactful.' },
  { companySlug: 'margdarshi-media', rating: 3, title: 'Media pay is media pay', body: 'Comp lower than pure SaaS but the work is more meaningful.' },

  // Anvaya Realty — established, traditional
  { companySlug: 'anvaya-realty', rating: 3, title: 'Old-school but stable', body: 'Decisions take longer than I\'d like but the company is rock-solid. Good for mid-career stability.' },
  { companySlug: 'anvaya-realty', rating: 4, title: 'Strong delivery culture', body: 'Project handovers are on time more often than not, which is rare in real estate.' },
  { companySlug: 'anvaya-realty', rating: 2, title: 'Hierarchical', body: 'You need three signoffs to change a font. Not for everyone.' },

  // Tarang Hotels — hospitality, people-centric
  { companySlug: 'tarang-hotels', rating: 4, title: 'Hospitality with heart', body: 'Family-run feel even at this size. Good place if you genuinely like guest-facing work.' },
  { companySlug: 'tarang-hotels', rating: 4, title: 'Properties are stunning', body: 'Locations are amazing and staff retention is high. Pay scales are standard for the industry.' },
  { companySlug: 'tarang-hotels', rating: 3, title: 'Shifts are shifts', body: 'It\'s hospitality — weekends and holidays are work days. Plan accordingly.' },

  // Suchak Manufacturing — old-economy, strong fundamentals
  { companySlug: 'suchak-manufacturing', rating: 4, title: 'Old-economy stability', body: 'Profitable, debt-free, treats employees well. Less glamorous than SaaS but more durable.' },
  { companySlug: 'suchak-manufacturing', rating: 3, title: 'Modernising slowly', body: 'Digitisation has started but slowly. Plant floor culture is still very traditional.' },
  { companySlug: 'suchak-manufacturing', rating: 4, title: 'Engineering depth is real', body: 'Materials engineering and process engineering teams are among the best in the auto-component sector.' },

  // Sutra Labs — early AI startup
  { companySlug: 'sutra-labs', rating: 5, title: 'Best technical team I have worked with', body: '15 people, every one of them is an ML or systems person who genuinely ships. Founders are ex-Google Health.' },
  { companySlug: 'sutra-labs', rating: 4, title: 'YC-fast, AI-hard', body: 'High ambiguity, high autonomy. Comp is mostly equity but the equity is real.' },
];

// ============================================================
// Jobs — 50, spread across companies, cities, skills, seniority
// ============================================================

interface JobTemplate {
  companySlug: string;
  title: string;
  shortDescription: string;
  description: string;
  citySlug: string;
  skillSlugs: string[];
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'INTERN';
  workMode: 'ONSITE' | 'REMOTE' | 'HYBRID';
  experienceMinYears: number;
  experienceMaxYears: number;
  salaryMinLpa: number | null;
  salaryMaxLpa: number | null;
  daysAgo: number;
}

// LPA = lakh per annum. 1 LPA = ₹1,00,000 = ₹100,000 INR/year.
// salaryMinPaise = LPA * 100_000 (INR) * 100 (paise) = LPA * 10_000_000.
const LPA_TO_PAISE = 10_000_000;

const JOBS: JobTemplate[] = [
  // === Nimbus Cloud Systems (7 jobs, IT/Software, Bangalore-heavy) ===
  { companySlug: 'nimbus-cloud-systems', title: 'Senior Backend Engineer (Go)', shortDescription: 'Build the core API platform that powers our managed Postgres and Kafka services.', description: 'Join the platform team that builds and operates Nimbus\'s managed Postgres and Kafka. You\'ll own one of the control-plane services end-to-end — design, code, on-call. We use Go, gRPC, Postgres, and Kubernetes. Expecting 5+ years of backend experience and at least 2 years writing production Go.', citySlug: 'bangalore', skillSlugs: ['go', 'postgresql', 'kubernetes', 'grpc', 'docker'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 5, experienceMaxYears: 9, salaryMinLpa: 38, salaryMaxLpa: 62, daysAgo: 2 },
  { companySlug: 'nimbus-cloud-systems', title: 'Staff Engineer — Distributed Systems', shortDescription: 'Lead the architecture of our multi-region replication and consistency layer.', description: 'You\'ll be the technical owner of how data flows across regions in our managed-database product. Define replication protocols, drive consistency trade-offs, mentor a team of 6 senior engineers. We\'re looking for someone with deep distributed-systems experience — Raft / Paxos / CRDT internals.', citySlug: 'bangalore', skillSlugs: ['go', 'distributed-systems', 'postgresql'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 9, experienceMaxYears: 15, salaryMinLpa: 60, salaryMaxLpa: 95, daysAgo: 8 },
  { companySlug: 'nimbus-cloud-systems', title: 'Senior Frontend Engineer — Console', shortDescription: 'Build the operator experience for managing fleets of databases.', description: 'The Nimbus console is what 40,000+ developers see every day. Build polished, fast, accessible UI on React + Next.js. You\'ll work alongside designers and product on the customer-facing dashboard.', citySlug: 'bangalore', skillSlugs: ['typescript', 'react', 'nextjs', 'tailwind-css'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 32, salaryMaxLpa: 52, daysAgo: 5 },
  { companySlug: 'nimbus-cloud-systems', title: 'SRE — Storage', shortDescription: 'Keep the storage layer running. 100s of TB across 8 regions.', description: 'Our SRE team owns availability and latency SLOs across the entire storage layer. You\'ll be on a rotating on-call (1 week in 6), participate in incident reviews, and drive long-term reliability projects. Linux, Postgres internals, observability tooling.', citySlug: 'bangalore', skillSlugs: ['linux', 'postgresql', 'prometheus', 'kubernetes'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 35, salaryMaxLpa: 55, daysAgo: 11 },
  { companySlug: 'nimbus-cloud-systems', title: 'Engineering Manager — Data Plane', shortDescription: 'Lead a team of 8 engineers building the data-plane proxy.', description: 'You\'ll own delivery for the data-plane team — 8 engineers, 2 SREs, working on the proxy that sits in front of every Nimbus database. Looking for someone who has been a senior IC and has 2+ years of EM experience.', citySlug: 'hyderabad', skillSlugs: ['leadership', 'distributed-systems', 'go'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 8, experienceMaxYears: 14, salaryMinLpa: 55, salaryMaxLpa: 85, daysAgo: 3 },
  { companySlug: 'nimbus-cloud-systems', title: 'Software Engineer (Fresh Grad)', shortDescription: 'Entry-level role on the platform team.', description: 'Open to 2024-26 graduates from CS / IT / ECE. Strong fundamentals in DSA, one or more of Go/Python/Java to a working level. You\'ll be paired with a senior engineer for the first 6 months.', citySlug: 'bangalore', skillSlugs: ['data-structures', 'algorithms', 'go'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 0, experienceMaxYears: 1, salaryMinLpa: 14, salaryMaxLpa: 22, daysAgo: 1 },
  { companySlug: 'nimbus-cloud-systems', title: 'Product Manager — Developer Experience', shortDescription: 'Own the DX surface area — CLI, dashboard, docs, onboarding funnel.', description: 'You\'ll be the PM for everything a developer touches: the CLI, the dashboard, the docs site, the onboarding funnel. Heavy collaboration with engineering and DevRel. 5+ years PM, ideally in dev-tools.', citySlug: 'bangalore', skillSlugs: ['product-management', 'analytics', 'user-research'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 5, experienceMaxYears: 9, salaryMinLpa: 42, salaryMaxLpa: 68, daysAgo: 13 },

  // === Veridian Analytics (5 jobs, IT/Software, Hyderabad) ===
  { companySlug: 'veridian-analytics', title: 'Senior Data Engineer', shortDescription: 'Build the data pipelines that power our ML platform.', description: 'Own ingestion, transformation, and serving layers for one of our top-3 customers. Stack: Spark, Airflow, dbt, Snowflake, Kafka. 5+ years of pipeline engineering experience.', citySlug: 'hyderabad', skillSlugs: ['python', 'spark', 'airflow', 'snowflake', 'sql'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 5, experienceMaxYears: 9, salaryMinLpa: 30, salaryMaxLpa: 50, daysAgo: 4 },
  { companySlug: 'veridian-analytics', title: 'ML Engineer — Personalisation', shortDescription: 'Ship production ML models for retail and BFSI customers.', description: 'You\'ll move models from notebook to prod — feature stores, online serving, monitoring, retraining loops. Comfortable with PyTorch / TF and at least one cloud (we run on AWS).', citySlug: 'hyderabad', skillSlugs: ['python', 'pytorch', 'machine-learning', 'aws', 'mlops'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 3, experienceMaxYears: 7, salaryMinLpa: 28, salaryMaxLpa: 48, daysAgo: 7 },
  { companySlug: 'veridian-analytics', title: 'Analytics Engineer', shortDescription: 'Bridge between data engineering and business — dbt, SQL, modelling.', description: 'You\'ll build the dimensional models that everyone else queries. Heavy SQL and dbt. Some Python. 2+ years of analytics-engineering experience or strong SQL + data-modelling background.', citySlug: 'bangalore', skillSlugs: ['sql', 'dbt', 'python', 'data-modeling'], employmentType: 'FULL_TIME', workMode: 'REMOTE', experienceMinYears: 2, experienceMaxYears: 6, salaryMinLpa: 18, salaryMaxLpa: 32, daysAgo: 6 },
  { companySlug: 'veridian-analytics', title: 'Solutions Architect', shortDescription: 'Customer-facing — pre-sales technical lead for enterprise accounts.', description: 'Work with prospect CTOs / heads-of-data on technical proof-of-concept and onboarding. Travel ~20% across India. Strong communication, hands-on data background, BFSI or retail vertical experience preferred.', citySlug: 'mumbai', skillSlugs: ['solution-architecture', 'sql', 'cloud-architecture', 'presales'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 7, experienceMaxYears: 12, salaryMinLpa: 38, salaryMaxLpa: 60, daysAgo: 15 },
  { companySlug: 'veridian-analytics', title: 'Data Analyst (Fresh Grad)', shortDescription: 'Entry-level analytics role.', description: '2024-25 grad. Strong SQL, some Python. You\'ll join a team of 4 working on internal product analytics.', citySlug: 'hyderabad', skillSlugs: ['sql', 'python', 'data-analysis'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 0, experienceMaxYears: 2, salaryMinLpa: 8, salaryMaxLpa: 14, daysAgo: 9 },

  // === Sahaj Pay (5 jobs, BFSI, Mumbai/Bangalore) ===
  { companySlug: 'sahaj-pay', title: 'Senior Software Engineer — Payments Core', shortDescription: 'Build the rails — UPI integration, settlement, reconciliation.', description: 'Work on the payment-processing pipeline. UPI 2.x, NACH, cards. You\'ll own services that move ₹100+ crore a day. Java or Kotlin, strong fundamentals, comfort with banking integrations.', citySlug: 'mumbai', skillSlugs: ['java', 'kotlin', 'postgresql', 'kafka', 'spring-boot'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 32, salaryMaxLpa: 55, daysAgo: 1 },
  { companySlug: 'sahaj-pay', title: 'Senior Frontend Engineer', shortDescription: 'Merchant dashboard and SDK consoles.', description: 'Build polished, accessible UI for businesses managing their payment flows. React + TypeScript, design-system contributor experience preferred.', citySlug: 'bangalore', skillSlugs: ['typescript', 'react', 'nextjs'], employmentType: 'FULL_TIME', workMode: 'REMOTE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 28, salaryMaxLpa: 48, daysAgo: 4 },
  { companySlug: 'sahaj-pay', title: 'Risk Operations Manager', shortDescription: 'Build and operate fraud + chargeback workflows.', description: 'You\'ll own merchant risk scoring, transaction monitoring, and chargeback dispute workflows. 5+ years in payments / cards risk operations. Heavy SQL and tooling-building, light coding.', citySlug: 'mumbai', skillSlugs: ['risk-management', 'sql', 'fraud-detection'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 25, salaryMaxLpa: 42, daysAgo: 12 },
  { companySlug: 'sahaj-pay', title: 'Compliance Manager', shortDescription: 'RBI compliance — PA/PG, KYC/AML, audit support.', description: 'Own end-to-end compliance with RBI guidelines for our PA + PG licences. Work directly with the legal team and external auditors. 6+ years in fintech / banking compliance.', citySlug: 'mumbai', skillSlugs: ['compliance', 'risk-management'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 6, experienceMaxYears: 12, salaryMinLpa: 28, salaryMaxLpa: 45, daysAgo: 18 },
  { companySlug: 'sahaj-pay', title: 'Backend Intern (Summer 2026)', shortDescription: '3-month summer internship on the payments team.', description: 'Pre-final year CS / IT students. Java or Python at a working level. You\'ll ship at least one production feature during the internship.', citySlug: 'bangalore', skillSlugs: ['java', 'python', 'data-structures'], employmentType: 'INTERN', workMode: 'ONSITE', experienceMinYears: 0, experienceMaxYears: 1, salaryMinLpa: 6, salaryMaxLpa: 9, daysAgo: 6 },

  // === Lumen Health (4 jobs, healthcare, Bangalore) ===
  { companySlug: 'lumen-health', title: 'Senior Full-Stack Engineer', shortDescription: 'EMR module — clinical documentation and orders.', description: 'You\'ll work on the EMR module — patient records, clinical orders, medication management. Stack: TypeScript, React, Node, Postgres. Hospital-software experience is a plus, not required.', citySlug: 'bangalore', skillSlugs: ['typescript', 'react', 'nodejs', 'postgresql'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 7, salaryMinLpa: 24, salaryMaxLpa: 40, daysAgo: 3 },
  { companySlug: 'lumen-health', title: 'Mobile Engineer (Android / iOS)', shortDescription: 'Build the patient-facing app for appointments and reports.', description: 'Native or Flutter, your choice — we have teams on both. App is used by 800,000+ patients monthly. Calm release cadence, strong test discipline.', citySlug: 'bangalore', skillSlugs: ['kotlin', 'swift', 'flutter', 'dart'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 3, experienceMaxYears: 7, salaryMinLpa: 22, salaryMaxLpa: 38, daysAgo: 10 },
  { companySlug: 'lumen-health', title: 'QA Lead — Healthcare Compliance', shortDescription: 'Own the QA strategy across hospital-grade software.', description: 'You\'ll define and own the QA process — test automation, manual coverage, release sign-off. Healthcare or financial-software QA background strongly preferred.', citySlug: 'pune', skillSlugs: ['quality-assurance', 'test-automation', 'selenium'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 6, experienceMaxYears: 10, salaryMinLpa: 22, salaryMaxLpa: 35, daysAgo: 14 },
  { companySlug: 'lumen-health', title: 'UX Designer — Clinical Workflows', shortDescription: 'Design tools that doctors use 8 hours a day.', description: 'You\'ll do field research with hospital staff, prototype, and ship. We\'re obsessive about reducing clicks for clinicians. Healthcare design experience is a plus.', citySlug: 'bangalore', skillSlugs: ['ux-design', 'figma', 'user-research'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 22, salaryMaxLpa: 38, daysAgo: 7 },

  // === Pathshala Learning (4 jobs, edtech, Pune) ===
  { companySlug: 'pathshala-learning', title: 'Senior Backend Engineer', shortDescription: 'Scaling the live-class platform — 50k concurrent students.', description: 'Build and scale the live-classes platform — WebRTC, recording, real-time messaging. Stack: Node, Go, Redis, Postgres.', citySlug: 'pune', skillSlugs: ['nodejs', 'go', 'webrtc', 'redis'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 24, salaryMaxLpa: 40, daysAgo: 2 },
  { companySlug: 'pathshala-learning', title: 'Content Operations Manager', shortDescription: 'Coordinate content production across grades and subjects.', description: 'Own end-to-end content production — briefing teachers, editorial review, publishing pipeline. Education or publishing background.', citySlug: 'pune', skillSlugs: ['content-management', 'project-management'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 14, salaryMaxLpa: 24, daysAgo: 19 },
  { companySlug: 'pathshala-learning', title: 'Sales Manager — School Partnerships', shortDescription: 'B2B sales to K-12 schools in Maharashtra and Karnataka.', description: 'Heavy field role — meet school principals, run pilots, close partnerships. 5+ years in education or institutional B2B sales.', citySlug: 'pune', skillSlugs: ['b2b-sales', 'business-development'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 16, salaryMaxLpa: 28, daysAgo: 23 },
  { companySlug: 'pathshala-learning', title: 'Frontend Engineer — Student App', shortDescription: 'Web + responsive surfaces for the student learning app.', description: 'You\'ll work on the student-facing app used by 1.2M students. React, Next.js, performance-conscious work.', citySlug: 'pune', skillSlugs: ['typescript', 'react', 'nextjs'], employmentType: 'FULL_TIME', workMode: 'REMOTE', experienceMinYears: 2, experienceMaxYears: 5, salaryMinLpa: 14, salaryMaxLpa: 24, daysAgo: 5 },

  // === Kirana Stack (4 jobs, retail, Delhi) ===
  { companySlug: 'kirana-stack', title: 'Lead Engineer — Merchant App', shortDescription: 'Founding engineer on the merchant-facing Android app.', description: 'Lead engineering for the kirana-merchant Android app — POS, billing, inventory, settlement. Strong Android background (5+ years), comfort with offline-first design.', citySlug: 'delhi', skillSlugs: ['android', 'kotlin', 'sqlite'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 32, salaryMaxLpa: 55, daysAgo: 4 },
  { companySlug: 'kirana-stack', title: 'Senior Backend Engineer', shortDescription: 'Build the credit-decisioning service.', description: 'Backend for merchant credit — risk scoring, disbursement, collections. Java / Kotlin, Postgres, Kafka.', citySlug: 'delhi', skillSlugs: ['java', 'postgresql', 'kafka'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 26, salaryMaxLpa: 44, daysAgo: 8 },
  { companySlug: 'kirana-stack', title: 'Operations Manager — Tier 2/3 Expansion', shortDescription: 'Drive merchant onboarding in 40+ tier 2/3 cities.', description: 'You\'ll own the city-launch playbook — local team hiring, onboarding flows, partnership closures. Heavy travel.', citySlug: 'delhi', skillSlugs: ['operations', 'business-development', 'team-management'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 14, salaryMaxLpa: 24, daysAgo: 17 },
  { companySlug: 'kirana-stack', title: 'Product Designer', shortDescription: 'Design for merchants who are first-time smartphone users.', description: 'Many of our merchants are using a smartphone seriously for the first time. Design with that constraint in mind. We do real field research — be ready to travel.', citySlug: 'noida', skillSlugs: ['ux-design', 'figma', 'user-research'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 3, experienceMaxYears: 7, salaryMinLpa: 18, salaryMaxLpa: 32, daysAgo: 11 },

  // === Rasta Logistics (5 jobs, logistics, Gurgaon) ===
  { companySlug: 'rasta-logistics', title: 'Engineering Manager — Last Mile', shortDescription: 'Lead the team that runs courier routing and delivery ops tech.', description: 'You\'ll own delivery for 12 engineers across the last-mile stack — courier app, routing, ETA, exceptions. Strong technical + people leadership background.', citySlug: 'gurgaon', skillSlugs: ['leadership', 'distributed-systems', 'java'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 9, experienceMaxYears: 14, salaryMinLpa: 45, salaryMaxLpa: 72, daysAgo: 3 },
  { companySlug: 'rasta-logistics', title: 'Senior Backend Engineer — Routing', shortDescription: 'Route-optimisation algorithms for 60,000 daily deliveries.', description: 'Apply OR / heuristic algorithms to real-time courier routing. Strong CS fundamentals, comfort with graph algorithms and optimisation libraries.', citySlug: 'gurgaon', skillSlugs: ['java', 'algorithms', 'graph-algorithms'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 26, salaryMaxLpa: 44, daysAgo: 6 },
  { companySlug: 'rasta-logistics', title: 'Senior DevOps Engineer', shortDescription: 'AWS, Kubernetes, observability across 30+ microservices.', description: 'You\'ll own platform reliability — clusters, CI/CD, observability. AWS-heavy stack, EKS in production, Datadog for monitoring.', citySlug: 'gurgaon', skillSlugs: ['aws', 'kubernetes', 'terraform', 'datadog'], employmentType: 'FULL_TIME', workMode: 'REMOTE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 28, salaryMaxLpa: 46, daysAgo: 12 },
  { companySlug: 'rasta-logistics', title: 'Operations Analyst', shortDescription: 'Daily ops dashboards, SLA tracking, root-cause analysis.', description: 'Heavy SQL, light Python. You\'ll work with the ops team to turn data into action — SLA breaches, network-design changes, cost analysis.', citySlug: 'noida', skillSlugs: ['sql', 'python', 'data-analysis'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 1, experienceMaxYears: 4, salaryMinLpa: 8, salaryMaxLpa: 16, daysAgo: 16 },
  { companySlug: 'rasta-logistics', title: 'City Operations Manager — Mumbai', shortDescription: 'Run Mumbai operations — courier hubs, SLA, P&L for the city.', description: 'Mumbai is one of our top-3 cities. You\'ll own daily ops, hub managers, and city-level SLA + P&L. 5+ years of operations leadership.', citySlug: 'mumbai', skillSlugs: ['operations', 'team-management', 'logistics'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 18, salaryMaxLpa: 32, daysAgo: 21 },

  // === Margdarshi Media (3 jobs, media, Mumbai) ===
  { companySlug: 'margdarshi-media', title: 'Senior Reporter — Politics (Hindi)', shortDescription: 'Lead political coverage on the Hindi desk.', description: 'You\'ll lead political reporting on the Hindi desk — 1+ original story a week. 6+ years of reporting experience, strong sources, Hindi at a native level.', citySlug: 'delhi', skillSlugs: ['journalism', 'editorial'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 6, experienceMaxYears: 12, salaryMinLpa: 14, salaryMaxLpa: 26, daysAgo: 5 },
  { companySlug: 'margdarshi-media', title: 'Editor — Tamil Edition', shortDescription: 'Run the Tamil-language editorial desk.', description: 'Manage a team of 8 reporters and 3 sub-editors. Set the editorial agenda for the Tamil edition. 10+ years of editorial experience.', citySlug: 'chennai', skillSlugs: ['journalism', 'editorial', 'leadership'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 10, experienceMaxYears: 18, salaryMinLpa: 24, salaryMaxLpa: 42, daysAgo: 9 },
  { companySlug: 'margdarshi-media', title: 'Video Producer', shortDescription: 'Produce 2-3 long-form videos a week for our YouTube channel.', description: 'You\'ll script, shoot, and edit long-form (10-30 min) explainer videos in Hindi. 3+ years of video production experience.', citySlug: 'mumbai', skillSlugs: ['video-production', 'editing'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 3, experienceMaxYears: 7, salaryMinLpa: 10, salaryMaxLpa: 18, daysAgo: 14 },

  // === Anvaya Realty (3 jobs, real-estate, Bangalore) ===
  { companySlug: 'anvaya-realty', title: 'Senior Project Manager — Construction', shortDescription: 'Run a 4.2 lakh sq ft residential project.', description: 'You\'ll own delivery for a residential project in north Bangalore — schedule, budget, contractor management, statutory compliance. 10+ years of construction PM experience.', citySlug: 'bangalore', skillSlugs: ['project-management', 'construction-management'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 10, experienceMaxYears: 18, salaryMinLpa: 22, salaryMaxLpa: 38, daysAgo: 6 },
  { companySlug: 'anvaya-realty', title: 'Architect (BIM)', shortDescription: 'BIM modelling and design for commercial projects.', description: 'You\'ll work on detailed design and BIM modelling for our commercial pipeline. Revit, AutoCAD, 4+ years of post-licence experience.', citySlug: 'bangalore', skillSlugs: ['autocad', 'revit', 'architecture'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 10, salaryMaxLpa: 20, daysAgo: 15 },
  { companySlug: 'anvaya-realty', title: 'Sales Manager — Residential', shortDescription: 'Manage residential pre-sales team for two ongoing projects.', description: 'You\'ll lead a team of 9 sales executives across two project sites. Real-estate sales experience required, 5+ years.', citySlug: 'bangalore', skillSlugs: ['sales', 'team-management', 'real-estate'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 12, salaryMaxLpa: 22, daysAgo: 22 },

  // === Tarang Hotels (3 jobs, hospitality, Chennai/Kochi/Goa) ===
  { companySlug: 'tarang-hotels', title: 'General Manager — Kochi Property', shortDescription: 'GM for our flagship Kochi property (84 rooms).', description: 'You\'ll be the General Manager for our flagship property in Kochi. Full P&L responsibility. 10+ years of hospitality experience, ideally with at least one prior GM stint.', citySlug: 'kochi', skillSlugs: ['hospitality-management', 'team-management', 'p-and-l'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 10, experienceMaxYears: 20, salaryMinLpa: 22, salaryMaxLpa: 38, daysAgo: 8 },
  { companySlug: 'tarang-hotels', title: 'Executive Chef', shortDescription: 'Lead F&B at our resort property in Goa.', description: 'Run a 28-person kitchen across 3 outlets. Design seasonal menus, manage costs, train team. 12+ years of executive-chef-track experience.', citySlug: 'mumbai', skillSlugs: ['culinary', 'kitchen-management'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 12, experienceMaxYears: 22, salaryMinLpa: 16, salaryMaxLpa: 28, daysAgo: 16 },
  { companySlug: 'tarang-hotels', title: 'Front Office Manager', shortDescription: 'Lead front-office operations at the Chennai property.', description: 'Lead a team of 11 front-office executives. Handle guest experience, group bookings, daily ops. 5+ years of front-office leadership.', citySlug: 'chennai', skillSlugs: ['hospitality-management', 'customer-service'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 7, salaryMaxLpa: 13, daysAgo: 11 },

  // === Suchak Manufacturing (4 jobs, manufacturing, Pune) ===
  { companySlug: 'suchak-manufacturing', title: 'Plant Manager — Pune', shortDescription: 'Run our largest plant (1,800 staff).', description: 'Full plant-level responsibility — production, quality, safety, P&L. Heavy mechanical / production-engineering background, 15+ years.', citySlug: 'pune', skillSlugs: ['manufacturing', 'operations', 'leadership'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 15, experienceMaxYears: 25, salaryMinLpa: 45, salaryMaxLpa: 72, daysAgo: 4 },
  { companySlug: 'suchak-manufacturing', title: 'Senior Quality Engineer', shortDescription: 'IATF 16949 compliance + supplier quality.', description: 'You\'ll own quality systems for one of our supplier programmes — supplier audits, PPAP, APQP. Auto-component industry experience strongly preferred.', citySlug: 'pune', skillSlugs: ['quality-engineering', 'six-sigma', 'iatf-16949'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 6, experienceMaxYears: 12, salaryMinLpa: 14, salaryMaxLpa: 24, daysAgo: 13 },
  { companySlug: 'suchak-manufacturing', title: 'Mechanical Design Engineer', shortDescription: 'Component design for two-wheeler powertrain.', description: 'You\'ll work on cylinder-head and crankcase design for two-wheeler engines. CAD (Catia / NX), FEA, 4+ years of post-degree design experience.', citySlug: 'pune', skillSlugs: ['mechanical-engineering', 'cad', 'catia'], employmentType: 'FULL_TIME', workMode: 'ONSITE', experienceMinYears: 4, experienceMaxYears: 8, salaryMinLpa: 10, salaryMaxLpa: 18, daysAgo: 19 },
  { companySlug: 'suchak-manufacturing', title: 'Industrial Engineering Intern', shortDescription: '6-month internship on the plant floor.', description: 'B.Tech mechanical / industrial engineering students. 6-month internship working with the IE team on time-study, line-balancing, and process improvement.', citySlug: 'pune', skillSlugs: ['industrial-engineering', 'process-improvement'], employmentType: 'INTERN', workMode: 'ONSITE', experienceMinYears: 0, experienceMaxYears: 1, salaryMinLpa: 3, salaryMaxLpa: 5, daysAgo: 7 },

  // === Sutra Labs (3 jobs, IT/Software, Bangalore — small team) ===
  { companySlug: 'sutra-labs', title: 'Founding ML Engineer', shortDescription: 'Build and ship clinical-imaging ML models in production.', description: 'You\'ll be employee #16. Train and deploy models for radiology workflow. Strong PyTorch background, comfort with medical imaging (DICOM, NIfTI) is a plus.', citySlug: 'bangalore', skillSlugs: ['python', 'pytorch', 'machine-learning', 'computer-vision'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 3, experienceMaxYears: 8, salaryMinLpa: 35, salaryMaxLpa: 60, daysAgo: 2 },
  { companySlug: 'sutra-labs', title: 'Senior Software Engineer — Platform', shortDescription: 'Build the inference platform that radiologists use.', description: 'Stack: TypeScript, Node, Go, Postgres. Inference platform plus the radiologist-facing review tool. Looking for someone who can own from API to UI.', citySlug: 'bangalore', skillSlugs: ['typescript', 'go', 'nodejs', 'postgresql'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 4, experienceMaxYears: 9, salaryMinLpa: 28, salaryMaxLpa: 52, daysAgo: 5 },
  { companySlug: 'sutra-labs', title: 'Clinical Operations Lead', shortDescription: 'Hospital onboarding + radiologist workflow design.', description: 'You\'ll be the bridge between Sutra and our hospital partners. Background in clinical operations or radiology workflow strongly preferred.', citySlug: 'bangalore', skillSlugs: ['clinical-operations', 'project-management'], employmentType: 'FULL_TIME', workMode: 'HYBRID', experienceMinYears: 5, experienceMaxYears: 10, salaryMinLpa: 20, salaryMaxLpa: 38, daysAgo: 14 },
];

// ============================================================
// Helpers
// ============================================================

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ============================================================
// Seeder
// ============================================================

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  // --- Resolve reference data (industries, cities, skills) ---
  const [industries, cities, skills] = await Promise.all([
    prisma.industry.findMany({ select: { id: true, slug: true } }),
    prisma.city.findMany({ select: { id: true, slug: true } }),
    prisma.skill.findMany({ select: { id: true, slug: true } }),
  ]);
  const industryBySlug = new Map(industries.map((i) => [i.slug, i.id]));
  const cityBySlug = new Map(cities.map((c) => [c.slug, c.id]));
  const skillBySlug = new Map(skills.map((s) => [s.slug, s.id]));

  if (industries.length === 0 || cities.length === 0 || skills.length === 0) {
    throw new Error(
      'Reference data not seeded. Run `pnpm db:seed` first to populate industries / cities / skills.',
    );
  }

  // --- 1. Companies ---
  console.log(`  -> upserting ${COMPANIES.length} companies...`);
  const companyBySlug = new Map<string, number>();
  for (const c of COMPANIES) {
    const industryId = industryBySlug.get(c.industrySlug);
    const headquartersCityId = cityBySlug.get(c.hqCitySlug);
    if (!industryId) throw new Error(`Industry not found: ${c.industrySlug}`);
    if (!headquartersCityId) throw new Error(`City not found: ${c.hqCitySlug}`);

    const row = await prisma.company.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        industryId,
        headquartersCityId,
        employeeCount: c.employeeCount,
        foundedYear: c.foundedYear,
      },
      update: {
        name: c.name,
        description: c.description,
        industryId,
        headquartersCityId,
        employeeCount: c.employeeCount,
        foundedYear: c.foundedYear,
      },
      select: { id: true },
    });
    companyBySlug.set(c.slug, row.id);
  }

  // --- 2. Recruiters (User + Recruiter) ---
  console.log(`  -> upserting ${RECRUITERS.length} recruiters...`);
  const passwordHash = await argon2.hash(DEMO_RECRUITER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const recruiterUserByCompanySlug = new Map<string, number>();
  for (const r of RECRUITERS) {
    const companyId = companyBySlug.get(r.companySlug);
    if (!companyId) throw new Error(`Company not found: ${r.companySlug}`);

    const user = await prisma.user.upsert({
      where: { email: r.email },
      create: {
        email: r.email,
        passwordHash,
        name: r.name,
        role: 'RECRUITER',
        emailVerified: true,
      },
      update: { name: r.name, emailVerified: true, role: 'RECRUITER' },
      select: { id: true },
    });

    await prisma.recruiter.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        companyId,
        designation: r.designation,
        workEmail: r.workEmail,
        workEmailVerified: true,
      },
      update: {
        companyId,
        designation: r.designation,
        workEmail: r.workEmail,
        workEmailVerified: true,
      },
    });
    recruiterUserByCompanySlug.set(r.companySlug, user.id);
  }

  // --- 3. Reviews ---
  // Idempotency: delete existing reviews for demo companies before inserting,
  // so re-running doesn't duplicate the rows.
  console.log(`  -> resetting + inserting ${REVIEWS.length} reviews...`);
  const demoCompanyIds = [...companyBySlug.values()];
  await prisma.companyReview.deleteMany({ where: { companyId: { in: demoCompanyIds } } });
  for (const r of REVIEWS) {
    const companyId = companyBySlug.get(r.companySlug);
    if (!companyId) throw new Error(`Company not found: ${r.companySlug}`);
    await prisma.companyReview.create({
      data: {
        companyId,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerified: true,
      },
    });
  }

  // Recompute denorm fields on Company (averageRating + reviewCount) from
  // the canonical CompanyReview rows we just wrote. The aggregation runs
  // in one round-trip per company; with 12 companies this is fine.
  console.log('  -> recomputing company denorm averageRating + reviewCount...');
  for (const companyId of demoCompanyIds) {
    const agg = await prisma.companyReview.aggregate({
      where: { companyId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.company.update({
      where: { id: companyId },
      data: {
        averageRating: agg._avg.rating ?? null,
        reviewCount: agg._count._all,
      },
    });
  }

  // --- 4. Jobs ---
  console.log(`  -> upserting ${JOBS.length} jobs...`);
  for (const [idx, j] of JOBS.entries()) {
    const companyId = companyBySlug.get(j.companySlug);
    if (!companyId) throw new Error(`Company not found: ${j.companySlug}`);
    const primaryCityId = cityBySlug.get(j.citySlug);
    if (!primaryCityId) throw new Error(`City not found: ${j.citySlug}`);

    // Industry inherited from the company (every job is tagged with the
    // posting company's industry).
    const company = COMPANIES.find((c) => c.slug === j.companySlug);
    const industryId = company ? industryBySlug.get(company.industrySlug) ?? null : null;

    const skillIds: number[] = [];
    for (const slug of j.skillSlugs) {
      const id = skillBySlug.get(slug);
      if (id !== undefined) skillIds.push(id);
      // Unknown skills are silently dropped — the seed catalogue and
      // referenced skills don't have to match 1:1.
    }

    // Deterministic canonical slug so re-running upserts cleanly.
    // Format: <company-slug>-<title-slug>-d<index>
    const canonicalSlug = `${j.companySlug}-${slugify(j.title)}-d${String(idx + 1).padStart(3, '0')}`;

    const postedAt = new Date(Date.now() - j.daysAgo * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(postedAt.getTime() + 60 * 24 * 60 * 60 * 1000);
    const postedById = recruiterUserByCompanySlug.get(j.companySlug) ?? null;

    const salaryMinPaise = j.salaryMinLpa !== null ? j.salaryMinLpa * LPA_TO_PAISE : null;
    const salaryMaxPaise = j.salaryMaxLpa !== null ? j.salaryMaxLpa * LPA_TO_PAISE : null;

    await prisma.job.upsert({
      where: { canonicalSlug },
      create: {
        canonicalSlug,
        title: j.title,
        shortDescription: j.shortDescription,
        description: j.description,
        companyId,
        postedById,
        primaryCityId,
        cityIds: [primaryCityId],
        skillIds,
        industryId,
        status: 'ACTIVE',
        employmentType: j.employmentType,
        workMode: j.workMode,
        postedAt,
        expiresAt,
        salaryMinPaise,
        salaryMaxPaise,
        experienceMinYears: j.experienceMinYears,
        experienceMaxYears: j.experienceMaxYears,
      },
      update: {
        title: j.title,
        shortDescription: j.shortDescription,
        description: j.description,
        primaryCityId,
        cityIds: [primaryCityId],
        skillIds,
        industryId,
        status: 'ACTIVE',
        employmentType: j.employmentType,
        workMode: j.workMode,
        postedAt,
        expiresAt,
        salaryMinPaise,
        salaryMaxPaise,
        experienceMinYears: j.experienceMinYears,
        experienceMaxYears: j.experienceMaxYears,
        postedById,
      },
    });
  }

  console.log(
    `[seed:demo] complete — ${COMPANIES.length} companies, ${RECRUITERS.length} recruiters, ${REVIEWS.length} reviews, ${JOBS.length} jobs.`,
  );
}
