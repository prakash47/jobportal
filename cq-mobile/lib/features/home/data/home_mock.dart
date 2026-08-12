import '../../career_advice/data/articles_mock.dart';
import '../../companies/data/companies_mock.dart';
import '../../jobs/data/jobs_mock.dart';
import 'home_models.dart';

// Builds the Home feed from the other features' sample data, so featured jobs,
// companies, and articles deep-link to real (mock) detail screens. Mirrors the
// GET /home composite the backend will serve.
abstract final class HomeMock {
  static Future<HomeFeed> load() async {
    // Kick all three off together, then await — keeps the home load snappy.
    final jobsF = JobsMock.search(sort: 'recent');
    final compsF = CompaniesMock.list(sort: 'rating');
    final artsF = ArticlesMock.list();
    final jobs = (await jobsF).hits;
    final comps = (await compsF).hits;
    final arts = (await artsF).hits;

    return HomeFeed(
      counts: const HomeCounts(activeJobs: 1284, companies: 342, recruiters: 87),
      featuredJobs: jobs
          .take(6)
          .map(
            (j) => HomeJob(
              canonicalSlug: j.canonicalSlug,
              title: j.title,
              companyName: j.company.name,
              companyLogoUrl: j.company.logoUrl,
              cityName: j.city,
              salaryMinPaise: j.salaryMin,
              salaryMaxPaise: j.salaryMax,
              postedAt: j.postedAt,
            ),
          )
          .toList(),
      featuredCompanies: comps
          .take(6)
          .map(
            (c) => HomeCompany(
              id: c.id,
              slug: c.slug,
              name: c.name,
              logoUrl: c.logoUrl,
              industryName: c.industryName,
              hqCityName: c.hqCityName,
              averageRating: c.averageRating,
              reviewCount: c.reviewCount,
              openingsCount: c.openRolesCount,
            ),
          )
          .toList(),
      roles: const [
        HomeTaxo(label: 'Engineer', query: 'engineer', jobCount: 6),
        HomeTaxo(label: 'Designer', query: 'designer', jobCount: 2),
        HomeTaxo(label: 'Developer', query: 'developer', jobCount: 2),
        HomeTaxo(label: 'Analyst', query: 'analyst', jobCount: 2),
        HomeTaxo(label: 'Manager', query: 'manager', jobCount: 1),
      ],
      cities: const [
        HomeTaxo(label: 'Bengaluru', query: 'Bengaluru', jobCount: 4),
        HomeTaxo(label: 'Pune', query: 'Pune', jobCount: 2),
        HomeTaxo(label: 'Hyderabad', query: 'Hyderabad', jobCount: 2),
        HomeTaxo(label: 'Gurugram', query: 'Gurugram', jobCount: 2),
        HomeTaxo(label: 'Mumbai', query: 'Mumbai', jobCount: 1),
        HomeTaxo(label: 'Remote', query: 'Remote', jobCount: 1),
      ],
      industries: const [
        HomeTaxo(label: 'Software', query: 'Software', jobCount: 5),
        HomeTaxo(label: 'Healthcare', query: 'Health', jobCount: 2),
        HomeTaxo(label: 'Gaming', query: 'Playverse', jobCount: 2),
      ],
      topSkills: const [
        HomeTaxo(label: 'React', query: 'React', jobCount: 2),
        HomeTaxo(label: 'Node.js', query: 'Node', jobCount: 2),
        HomeTaxo(label: 'Flutter', query: 'Flutter', jobCount: 1),
        HomeTaxo(label: 'SQL', query: 'SQL', jobCount: 2),
        HomeTaxo(label: 'Figma', query: 'Figma', jobCount: 1),
        HomeTaxo(label: 'AWS', query: 'AWS', jobCount: 2),
      ],
      recentArticles: arts.take(3).toList(),
    );
  }
}
