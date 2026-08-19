import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import '../../catalogs/data/catalog_models.dart';
import 'job_filters.dart';
import 'job_models.dart';
import 'jobs_mock.dart';

class JobsException implements Exception {
  const JobsException(this.message, {this.code, this.quota});
  final String message;

  /// The contract's error `code` when one applies (e.g. `RESUME_REQUIRED`), so
  /// callers can react without string-matching the prose message.
  final String? code;

  /// The quota the server reported alongside a QUOTA_EXCEEDED refusal.
  ///
  /// Carried because the refusal itself is the most reliable place to learn the
  /// limit: the separate quota GET shares the same 100/min budget, so the
  /// moment a candidate is being refused is exactly the moment that read is
  /// most likely to have failed.
  final ApplyQuota? quota;

  @override
  String toString() => message;
}

/// Reads jobs from the public `/jobs` endpoints.
///
/// While the backend builds those endpoints, [AppConfig.useMockData] serves
/// static sample data; flip it to false (per the memory note
/// "cq-mobile-blocked-features") and the same methods hit the live API. Only
/// this file changes on the switch — models, providers and UI stay put.
class JobsRepository {
  const JobsRepository(this._dio);

  final Dio _dio;

  Future<JobsPage> search({
    String? q,
    int page = 1,
    String sort = 'relevance',
    JobFilters filters = const JobFilters(),
  }) async {
    if (AppConfig.useMockData) {
      return JobsMock.search(q: q, page: page, sort: sort);
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/v1/jobs',
        queryParameters: {
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          'page': page,
          'sort': sort,
          ...filters.toQuery(),
        },
        // Repeatable params must serialize as `skill=a&skill=b` (no `[]`).
        options: Options(listFormat: ListFormat.multi),
      );
      return JobsPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw JobsException(friendlyDioMessage(e));
    }
  }

  /// Jobs similar to [job] — matched on its skills, newest first, falling back
  /// to a title query when the job carries no skills.
  ///
  /// There is no "more like this" route in the contract, so this is an ordinary
  /// `/v1/jobs` query; the current job and its own company are dropped on the
  /// device (the endpoint has no company param). Same-company hits are kept
  /// only when excluding them would leave the section nearly empty.
  ///
  /// Best-effort: any failure returns an empty list. This is a secondary
  /// section and must never take down the job it sits under.
  Future<List<JobSummary>> similar(JobDetail job, {int limit = 4}) async {
    try {
      final skills = job.skills
          .where((s) => s.slug.isNotEmpty)
          .take(3)
          .map((s) => CatalogItem(id: s.id, slug: s.slug, name: s.name))
          .toList();
      final page = await search(
        q: skills.isEmpty ? job.title : null,
        sort: skills.isEmpty ? 'relevance' : 'recent',
        filters: JobFilters(skills: skills),
      );
      final others = page.hits.where((h) => h.id != job.id).toList();
      final elsewhere =
          others.where((h) => h.company.id != job.company.id).toList();
      final picked = elsewhere.length >= 2 ? elsewhere : others;
      return picked.take(limit).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<JobDetail> detail(String slug) async {
    if (AppConfig.useMockData) {
      final d = await JobsMock.detail(slug);
      if (d == null) throw const JobsException('This job could not be found.');
      return d;
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/jobs/$slug');
      return JobDetail.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        throw const JobsException('This job could not be found.');
      }
      throw JobsException(friendlyDioMessage(e));
    }
  }

  /// Apply to a job. This endpoint is LIVE today (`POST /me/applications`), so
  /// it always hits the real server — but the mock jobs have sample ids that
  /// don't exist, so the detail screen only calls this outside mock mode.
  Future<void> apply(int jobId) async {
    try {
      await _dio.post<void>('/me/applications', data: {'jobId': jobId});
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      final data = e.response?.data;
      final errCode = data is Map ? data['code'] as String? : null;
      // Branch on the contract's `code`, never on the prose message.
      if (errCode == 'RESUME_REQUIRED') {
        throw const JobsException(
          'Add a resume to your profile before applying.',
          code: 'RESUME_REQUIRED',
        );
      }
      if (errCode == 'RESUME_SCANNING') {
        throw const JobsException(
          'Your resume is still being checked — please try again in a moment.',
          code: 'RESUME_SCANNING',
        );
      }
      if (code == 409) {
        throw const JobsException('You have already applied to this job.');
      }
      if (code == 403) {
        // The two 403s that carry a `code` are handled above. The rest are
        // code-less and the API raises them for THREE different reasons:
        // 'Verify your email before applying.', 'This job is not open for
        // applications yet.' (draft or awaiting moderation) and 'This job is
        // no longer accepting applications.' (closed or expired). Answering
        // all three with the verify-email line told a candidate whose email
        // was verified to go and verify it, about a job that had simply
        // closed.
        throw JobsException(
          serverMessage(e) ?? 'Please verify your email before applying.',
          code: 'FORBIDDEN',
        );
      }
      if (code == 429) {
        // Not every 429 here is the apply quota — a global 100/min throttle
        // guards every route and emits its own. The quota's body carries a
        // numeric `limit`; the throttler's does not, so that is the tell.
        final isQuota = data is Map && data['limit'] is num;
        if (isQuota) {
          // The quota's message is real prose written for a candidate, and its
          // body carries the numbers the apply bar needs to grey itself out.
          throw JobsException(
            serverMessage(e) ??
                "You've reached today's application limit. Please try again tomorrow.",
            code: 'QUOTA_EXCEEDED',
            quota: ApplyQuota.fromJson(data.cast<String, dynamic>()),
          );
        }
        // The throttler's is not. @nestjs/throttler raises its default
        // exception, whose message is the literal string 'ThrottlerException:
        // Too Many Requests', and the shared envelope passes it through
        // unchanged — so preferring the server here put a Java-looking class
        // name in a red snackbar under the primary button, and made the copy
        // below dead for the exact case it was written for.
        throw const JobsException(
          'Too many requests just now. Please try again in a minute.',
        );
      }
      throw JobsException(friendlyDioMessage(e));
    }
  }

  /// Today's application allowance (`GET /me/applications/quota`).
  ///
  /// **The path carries no `/v1`** — unlike `/v1/jobs/:slug` and
  /// `/v1/me/job-state` above. The applications controller is version-neutral,
  /// so a `/v1` here 404s, and because this method swallows errors the feature
  /// would just silently never appear.
  ///
  /// Returns null rather than throwing: the hint is decoration on the apply
  /// bar, and a signed-out or rate-limited read must not disturb the screen.
  Future<ApplyQuota?> applyQuota() async {
    if (AppConfig.useMockData) return null;
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/me/applications/quota',
      );
      return ApplyQuota.fromJson(res.data ?? const {});
    } on DioException {
      return null;
    }
  }

  /// Save / unsave a job.
  ///
  /// **The job id goes in the PATH on both verbs, and neither carries a body.**
  /// The server routes are `@Post(':jobId')` and `@Delete(':jobId')`
  /// (`apps/api/src/saved-jobs/saved-jobs.controller.ts`). Posting to the
  /// collection with `{jobId}` in the body — which this did until it was caught
  /// by an audit — matches no route at all, so every save 404'd silently the
  /// moment the app came off mock data.
  ///
  /// Save is idempotent server-side: a duplicate hits the unique constraint and
  /// returns the existing row rather than erroring, so there is no 409 to
  /// handle on this path.
  Future<void> setSaved(int jobId, bool saved) async {
    if (AppConfig.useMockData) return;
    try {
      if (saved) {
        await _dio.post<void>('/me/saved-jobs/$jobId');
      } else {
        await _dio.delete<void>('/me/saved-jobs/$jobId');
      }
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (!saved && code == 404) return; // already removed
      throw JobsException(friendlyDioMessage(e));
    }
  }

  /// Bulk saved/applied markers for a page of jobs (`POST /v1/me/job-state`).
  /// Best-effort: markers are non-critical, so any error returns an empty state
  /// rather than breaking the results list.
  Future<JobState> jobState(List<int> jobIds) async {
    if (AppConfig.useMockData || jobIds.isEmpty) return const JobState();
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/v1/me/job-state',
        data: {'jobIds': jobIds},
      );
      return JobState.fromJson(res.data ?? const {});
    } on DioException {
      return const JobState();
    }
  }
}

final jobsRepositoryProvider = FutureProvider<JobsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return JobsRepository(dio);
});
