import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'saved_job.dart';

class SavedJobsException implements Exception {
  const SavedJobsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads + mutates the signed-in seeker's saved jobs (`/me/saved-jobs`).
class SavedJobsRepository {
  const SavedJobsRepository(this._dio);

  final Dio _dio;

  Future<SavedJobsPage> list({int page = 1}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/me/saved-jobs',
        queryParameters: {'page': page},
      );
      return SavedJobsPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw SavedJobsException(friendlyDioMessage(e));
    }
  }

  /// Remove a saved job. A 404 means it's already gone → treated as success.
  Future<void> remove(int jobId) async {
    try {
      await _dio.delete<void>('/me/saved-jobs/$jobId');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw SavedJobsException(friendlyDioMessage(e));
    }
  }
}

final savedJobsRepositoryProvider = FutureProvider<SavedJobsRepository>((
  ref,
) async {
  final dio = await ref.watch(dioProvider.future);
  return SavedJobsRepository(dio);
});
