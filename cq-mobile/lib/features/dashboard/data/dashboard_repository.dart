import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../alerts/data/alerts_repository.dart';
import '../../applications/data/applications_repository.dart';
import '../../catalogs/data/catalog_models.dart';
import '../../catalogs/data/catalogs_repository.dart';
import '../../jobs/data/job_filters.dart';
import '../../jobs/data/job_models.dart';
import '../../jobs/data/jobs_repository.dart';
import '../../onboarding/data/onboarding_repository.dart';
import '../../saved_jobs/data/saved_jobs_repository.dart';
import 'seeker_snapshot.dart';

/// Composes the seeker's Home header from the endpoints that already exist —
/// there is no single dashboard route in the contract, so this fans out to
/// `/me/applications`, `/me/saved-jobs`, `/me/alerts` and `/v1/jobs` and
/// assembles the result on the device.
///
/// Every leg is independently best-effort: one failing endpoint costs one
/// number, never the whole block. The calls run concurrently, and the caller
/// loads this *after* the main feed so nothing here delays first paint.
class DashboardRepository {
  const DashboardRepository({
    required ApplicationsRepository applications,
    required SavedJobsRepository saved,
    required AlertsRepository alerts,
    required OnboardingRepository profile,
    required CatalogsRepository catalogs,
    required JobsRepository jobs,
  }) : _applications = applications,
       _saved = saved,
       _alerts = alerts,
       _profile = profile,
       _catalogs = catalogs,
       _jobs = jobs;

  final ApplicationsRepository _applications;
  final SavedJobsRepository _saved;
  final AlertsRepository _alerts;
  final OnboardingRepository _profile;
  final CatalogsRepository _catalogs;
  final JobsRepository _jobs;

  Future<SeekerSnapshot> load({int recommendedLimit = 3}) async {
    // Fire everything at once, then collect — four sequential round trips would
    // be visible on a phone connection.
    final applications = _applicationCount();
    final saved = _savedCount();
    final alerts = _alertCount();
    final recommended = _recommended(limit: recommendedLimit);

    return SeekerSnapshot(
      applications: await applications,
      saved: await saved,
      alerts: await alerts,
      recommended: await recommended,
    );
  }

  Future<int?> _applicationCount() async {
    try {
      final page = await _applications.list();
      // The live list carries per-status counts; 'ALL' is the total.
      return page.counts['ALL'] ?? page.total;
    } catch (_) {
      return null;
    }
  }

  Future<int?> _savedCount() async {
    try {
      return (await _saved.list()).total;
    } catch (_) {
      return null;
    }
  }

  Future<int?> _alertCount() async {
    try {
      return (await _alerts.list()).length;
    } catch (_) {
      return null;
    }
  }

  /// Jobs matched to the candidate's own skills + preferred cities.
  ///
  /// There is no recommendations endpoint, so this is a `/v1/jobs` query built
  /// from the profile: skills and preferred cities the candidate has already
  /// told us about, newest first. A profile with neither returns nothing — a
  /// generic "recommended" list would just repeat Latest jobs.
  Future<List<JobSummary>> _recommended({int limit = 3}) async {
    try {
      if (AppConfig.useMockData) {
        final page = await _jobs.search(sort: 'recent');
        return page.hits.take(limit).toList();
      }

      final profile = await _profile.loadProfile();
      // Keep the query narrow: too many facets and the result set collapses.
      final skills = await _catalogs.resolve(
        CatalogKind.skills,
        profile.skillIds.take(3).toList(),
      );
      final cities = await _catalogs.resolve(
        CatalogKind.cities,
        profile.preferredCityIds.take(2).toList(),
      );
      if (skills.isEmpty && cities.isEmpty) return const [];

      final page = await _jobs.search(
        sort: 'recent',
        filters: JobFilters(skills: skills, cities: cities),
      );
      if (page.hits.isEmpty) return const [];

      // Drop anything they have already applied to — recommending a job the
      // user has an open application on is noise. Saved jobs stay: a saved job
      // resurfacing is a useful nudge, and the card marks it as saved.
      final state = await _jobs.jobState(page.hits.map((h) => h.id).toList());
      final fresh = page.hits
          .where((h) => !state.applied.containsKey(h.id))
          .map((h) => h.copyWith(isSaved: state.saved.contains(h.id)))
          .take(limit)
          .toList();
      return fresh;
    } catch (_) {
      return const [];
    }
  }
}

final dashboardRepositoryProvider = FutureProvider<DashboardRepository>((
  ref,
) async {
  return DashboardRepository(
    applications: await ref.watch(applicationsRepositoryProvider.future),
    saved: await ref.watch(savedJobsRepositoryProvider.future),
    alerts: await ref.watch(alertsRepositoryProvider.future),
    profile: await ref.watch(onboardingRepositoryProvider.future),
    catalogs: await ref.watch(catalogsRepositoryProvider.future),
    jobs: await ref.watch(jobsRepositoryProvider.future),
  );
});
