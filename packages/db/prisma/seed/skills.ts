import type { PrismaClient } from '../../generated/client';

// 100 common skills, grouped by category. Categories: language | framework | database | cloud | tool | architecture | mobile | ml | soft.

const skills: { slug: string; name: string; category: string }[] = [
  // Languages
  { slug: 'javascript', name: 'JavaScript', category: 'language' },
  { slug: 'typescript', name: 'TypeScript', category: 'language' },
  { slug: 'python', name: 'Python', category: 'language' },
  { slug: 'java', name: 'Java', category: 'language' },
  { slug: 'cpp', name: 'C++', category: 'language' },
  { slug: 'csharp', name: 'C#', category: 'language' },
  { slug: 'go', name: 'Go', category: 'language' },
  { slug: 'rust', name: 'Rust', category: 'language' },
  { slug: 'ruby', name: 'Ruby', category: 'language' },
  { slug: 'php', name: 'PHP', category: 'language' },
  { slug: 'swift', name: 'Swift', category: 'language' },
  { slug: 'kotlin', name: 'Kotlin', category: 'language' },
  { slug: 'scala', name: 'Scala', category: 'language' },
  { slug: 'r', name: 'R', category: 'language' },
  { slug: 'perl', name: 'Perl', category: 'language' },
  { slug: 'dart', name: 'Dart', category: 'language' },
  { slug: 'objective-c', name: 'Objective-C', category: 'language' },
  { slug: 'matlab', name: 'MATLAB', category: 'language' },
  { slug: 'sql', name: 'SQL', category: 'language' },
  { slug: 'bash', name: 'Bash', category: 'language' },

  // Frontend frameworks
  { slug: 'react', name: 'React', category: 'framework' },
  { slug: 'vuejs', name: 'Vue.js', category: 'framework' },
  { slug: 'angular', name: 'Angular', category: 'framework' },
  { slug: 'nextjs', name: 'Next.js', category: 'framework' },
  { slug: 'nuxt', name: 'Nuxt', category: 'framework' },
  { slug: 'svelte', name: 'Svelte', category: 'framework' },
  { slug: 'solidjs', name: 'Solid.js', category: 'framework' },
  { slug: 'astro', name: 'Astro', category: 'framework' },
  { slug: 'ember', name: 'Ember', category: 'framework' },
  { slug: 'preact', name: 'Preact', category: 'framework' },

  // Backend frameworks
  { slug: 'nodejs', name: 'Node.js', category: 'framework' },
  { slug: 'express', name: 'Express', category: 'framework' },
  { slug: 'nestjs', name: 'NestJS', category: 'framework' },
  { slug: 'django', name: 'Django', category: 'framework' },
  { slug: 'flask', name: 'Flask', category: 'framework' },
  { slug: 'fastapi', name: 'FastAPI', category: 'framework' },
  { slug: 'spring-boot', name: 'Spring Boot', category: 'framework' },
  { slug: 'ruby-on-rails', name: 'Ruby on Rails', category: 'framework' },
  { slug: 'laravel', name: 'Laravel', category: 'framework' },
  { slug: 'aspnet', name: 'ASP.NET', category: 'framework' },

  // CSS / UI
  { slug: 'html', name: 'HTML', category: 'language' },
  { slug: 'css', name: 'CSS', category: 'language' },
  { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'framework' },
  { slug: 'bootstrap', name: 'Bootstrap', category: 'framework' },
  { slug: 'sass', name: 'Sass', category: 'tool' },
  { slug: 'styled-components', name: 'styled-components', category: 'framework' },

  // Databases
  { slug: 'postgresql', name: 'PostgreSQL', category: 'database' },
  { slug: 'mysql', name: 'MySQL', category: 'database' },
  { slug: 'mongodb', name: 'MongoDB', category: 'database' },
  { slug: 'redis', name: 'Redis', category: 'database' },
  { slug: 'elasticsearch', name: 'Elasticsearch', category: 'database' },
  { slug: 'dynamodb', name: 'DynamoDB', category: 'database' },
  { slug: 'sqlite', name: 'SQLite', category: 'database' },
  { slug: 'oracle-db', name: 'Oracle DB', category: 'database' },
  { slug: 'cassandra', name: 'Cassandra', category: 'database' },
  { slug: 'firebase', name: 'Firebase', category: 'database' },

  // Cloud
  { slug: 'aws', name: 'AWS', category: 'cloud' },
  { slug: 'azure', name: 'Azure', category: 'cloud' },
  { slug: 'google-cloud', name: 'Google Cloud', category: 'cloud' },
  { slug: 'cloudflare', name: 'Cloudflare', category: 'cloud' },

  // DevOps / Infra
  { slug: 'docker', name: 'Docker', category: 'tool' },
  { slug: 'kubernetes', name: 'Kubernetes', category: 'tool' },
  { slug: 'terraform', name: 'Terraform', category: 'tool' },
  { slug: 'ansible', name: 'Ansible', category: 'tool' },
  { slug: 'jenkins', name: 'Jenkins', category: 'tool' },
  { slug: 'github-actions', name: 'GitHub Actions', category: 'tool' },
  { slug: 'gitlab-ci', name: 'GitLab CI', category: 'tool' },
  { slug: 'circleci', name: 'CircleCI', category: 'tool' },
  { slug: 'nginx', name: 'Nginx', category: 'tool' },
  { slug: 'linux', name: 'Linux', category: 'tool' },

  // VCS / collab
  { slug: 'git', name: 'Git', category: 'tool' },
  { slug: 'github', name: 'GitHub', category: 'tool' },
  { slug: 'gitlab', name: 'GitLab', category: 'tool' },
  { slug: 'jira', name: 'Jira', category: 'tool' },

  // Architecture / messaging
  { slug: 'microservices', name: 'Microservices', category: 'architecture' },
  { slug: 'rest-api', name: 'REST API', category: 'architecture' },
  { slug: 'graphql', name: 'GraphQL', category: 'architecture' },
  { slug: 'grpc', name: 'gRPC', category: 'architecture' },
  { slug: 'websockets', name: 'WebSockets', category: 'architecture' },
  { slug: 'kafka', name: 'Kafka', category: 'tool' },
  { slug: 'rabbitmq', name: 'RabbitMQ', category: 'tool' },

  // Testing
  { slug: 'jest', name: 'Jest', category: 'tool' },
  { slug: 'vitest', name: 'Vitest', category: 'tool' },
  { slug: 'playwright', name: 'Playwright', category: 'tool' },
  { slug: 'cypress', name: 'Cypress', category: 'tool' },
  { slug: 'selenium', name: 'Selenium', category: 'tool' },

  // Mobile
  { slug: 'react-native', name: 'React Native', category: 'mobile' },
  { slug: 'flutter', name: 'Flutter', category: 'mobile' },
  { slug: 'ios-development', name: 'iOS Development', category: 'mobile' },
  { slug: 'android-development', name: 'Android Development', category: 'mobile' },

  // ML / AI
  { slug: 'tensorflow', name: 'TensorFlow', category: 'ml' },
  { slug: 'pytorch', name: 'PyTorch', category: 'ml' },
  { slug: 'scikit-learn', name: 'scikit-learn', category: 'ml' },
  { slug: 'opencv', name: 'OpenCV', category: 'ml' },

  // Soft skills
  { slug: 'communication', name: 'Communication', category: 'soft' },
  { slug: 'leadership', name: 'Leadership', category: 'soft' },
  { slug: 'problem-solving', name: 'Problem Solving', category: 'soft' },
  { slug: 'team-management', name: 'Team Management', category: 'soft' },
  { slug: 'agile', name: 'Agile', category: 'soft' },
  { slug: 'scrum', name: 'Scrum', category: 'soft' },

  // Data engineering / analytics
  { slug: 'airflow', name: 'Airflow', category: 'tool' },
  { slug: 'spark', name: 'Apache Spark', category: 'tool' },
  { slug: 'dbt', name: 'dbt', category: 'tool' },
  { slug: 'snowflake', name: 'Snowflake', category: 'database' },
  { slug: 'data-modeling', name: 'Data Modeling', category: 'architecture' },
  { slug: 'data-analysis', name: 'Data Analysis', category: 'tool' },

  // CS fundamentals
  { slug: 'algorithms', name: 'Algorithms', category: 'architecture' },
  { slug: 'data-structures', name: 'Data Structures', category: 'architecture' },
  { slug: 'graph-algorithms', name: 'Graph Algorithms', category: 'architecture' },
  { slug: 'distributed-systems', name: 'Distributed Systems', category: 'architecture' },
  { slug: 'cloud-architecture', name: 'Cloud Architecture', category: 'architecture' },
  { slug: 'solution-architecture', name: 'Solution Architecture', category: 'architecture' },

  // ML extras
  { slug: 'machine-learning', name: 'Machine Learning', category: 'ml' },
  { slug: 'mlops', name: 'MLOps', category: 'ml' },
  { slug: 'computer-vision', name: 'Computer Vision', category: 'ml' },

  // Observability
  { slug: 'prometheus', name: 'Prometheus', category: 'tool' },
  { slug: 'datadog', name: 'Datadog', category: 'tool' },

  // Real-time / networking
  { slug: 'webrtc', name: 'WebRTC', category: 'architecture' },

  // QA (generic terms — selenium, jest, vitest already above)
  { slug: 'quality-assurance', name: 'Quality Assurance', category: 'tool' },
  { slug: 'test-automation', name: 'Test Automation', category: 'tool' },

  // Product / design
  { slug: 'product-management', name: 'Product Management', category: 'soft' },
  { slug: 'ux-design', name: 'UX Design', category: 'soft' },
  { slug: 'figma', name: 'Figma', category: 'tool' },
  { slug: 'user-research', name: 'User Research', category: 'soft' },

  // Operations / project / content
  { slug: 'operations', name: 'Operations', category: 'soft' },
  { slug: 'business-development', name: 'Business Development', category: 'soft' },
  { slug: 'project-management', name: 'Project Management', category: 'soft' },
  { slug: 'content-management', name: 'Content Management', category: 'soft' },
  { slug: 'analytics', name: 'Analytics', category: 'tool' },
  { slug: 'presales', name: 'Presales', category: 'soft' },

  // Sales
  { slug: 'sales', name: 'Sales', category: 'soft' },
  { slug: 'b2b-sales', name: 'B2B Sales', category: 'soft' },
  { slug: 'customer-service', name: 'Customer Service', category: 'soft' },

  // Media / editorial / video
  { slug: 'editorial', name: 'Editorial', category: 'soft' },
  { slug: 'journalism', name: 'Journalism', category: 'soft' },
  { slug: 'video-production', name: 'Video Production', category: 'tool' },
  { slug: 'editing', name: 'Editing', category: 'tool' },

  // Finance / risk / compliance
  { slug: 'risk-management', name: 'Risk Management', category: 'soft' },
  { slug: 'fraud-detection', name: 'Fraud Detection', category: 'tool' },
  { slug: 'compliance', name: 'Compliance', category: 'soft' },

  // Healthcare ops
  { slug: 'clinical-operations', name: 'Clinical Operations', category: 'soft' },

  // Hospitality
  { slug: 'hospitality-management', name: 'Hospitality Management', category: 'soft' },
  { slug: 'culinary', name: 'Culinary', category: 'soft' },
  { slug: 'kitchen-management', name: 'Kitchen Management', category: 'soft' },
  { slug: 'p-and-l', name: 'P&L Management', category: 'soft' },

  // Real estate / construction / logistics
  { slug: 'real-estate', name: 'Real Estate', category: 'soft' },
  { slug: 'construction-management', name: 'Construction Management', category: 'soft' },
  { slug: 'logistics', name: 'Logistics', category: 'soft' },

  // CAD / engineering design
  { slug: 'cad', name: 'CAD', category: 'tool' },
  { slug: 'catia', name: 'CATIA', category: 'tool' },
  { slug: 'autocad', name: 'AutoCAD', category: 'tool' },
  { slug: 'revit', name: 'Revit', category: 'tool' },
  { slug: 'architecture', name: 'Architecture', category: 'soft' },

  // Manufacturing / quality
  { slug: 'manufacturing', name: 'Manufacturing', category: 'soft' },
  { slug: 'quality-engineering', name: 'Quality Engineering', category: 'soft' },
  { slug: 'six-sigma', name: 'Six Sigma', category: 'soft' },
  { slug: 'iatf-16949', name: 'IATF 16949', category: 'soft' },
  { slug: 'mechanical-engineering', name: 'Mechanical Engineering', category: 'soft' },
  { slug: 'industrial-engineering', name: 'Industrial Engineering', category: 'soft' },
  { slug: 'process-improvement', name: 'Process Improvement', category: 'soft' },
];

export async function seedSkills(prisma: PrismaClient): Promise<void> {
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {},
      create: skill,
    });
  }
  console.log(`  -> ${skills.length} skills upserted`);
}
