import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'job_filters.dart';
import 'job_models.dart';
import 'jobs_mock.dart';

class JobsException implements Exception {
  const JobsException(this.message, {this.code});
  final String message;

  /// The contract's error `code` when one applies (e.g. `RESUME_REQUIRED`), so
  /// callers can react without string-matching the prose message.
  final String? code;

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
        throw const JobsException('Please verify your email before applying.');
      }
      if (code == 429) {
        throw const JobsException(
          "You've reached today's application limit. Please try again tomorrow.",
        );
      }
      throw JobsException(friendlyDioMessage(e));
    }
  }

  /// Save / unsave a job (`/me/saved-jobs`). Live today; a no-op in mock mode
  /// (the sample ids aren't real). Confirm the exact save endpoint shape when
  /// switching this to live.
  Future<void> setSaved(int jobId, bool saved) async {
    if (AppConfig.useMockData) return;
    try {
      if (saved) {
        await _dio.post<void>('/me/saved-jobs', data: {'jobId': jobId});
      } else {
        await _dio.delete<void>('/me/saved-jobs/$jobId');
      }
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (saved && code == 409) return; // already saved
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
