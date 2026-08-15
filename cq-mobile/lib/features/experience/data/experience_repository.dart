import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'experience_mock.dart';
import 'experience_models.dart';

class ExperienceException implements Exception {
  const ExperienceException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Candidate work history (`/me/experience`, no `/v1`). GET list, POST create,
/// PATCH `:id`, DELETE `:id`. The session cookie authenticates. Static in demo
/// mode.
class ExperienceRepository {
  const ExperienceRepository(this._dio);

  final Dio _dio;

  Future<List<WorkExperienceItem>> list() async {
    if (AppConfig.useMockData) return ExperienceMock.list();
    try {
      final res = await _dio.get<List<dynamic>>('/me/experience');
      final rows = res.data ?? const [];
      return rows
          .whereType<Map>()
          .map((m) => WorkExperienceItem.fromJson(m.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw ExperienceException(friendlyDioMessage(e));
    }
  }

  Future<WorkExperienceItem> create(Map<String, dynamic> body) async {
    if (AppConfig.useMockData) return ExperienceMock.create(body);
    try {
      final res = await _dio.post<Map<String, dynamic>>('/me/experience', data: body);
      return WorkExperienceItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ExperienceException(friendlyDioMessage(e));
    }
  }

  Future<WorkExperienceItem> update(int id, Map<String, dynamic> body) async {
    if (AppConfig.useMockData) return ExperienceMock.update(id, body);
    try {
      final res = await _dio.patch<Map<String, dynamic>>('/me/experience/$id', data: body);
      return WorkExperienceItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ExperienceException(friendlyDioMessage(e));
    }
  }

  Future<void> remove(int id) async {
    if (AppConfig.useMockData) {
      ExperienceMock.delete(id);
      return;
    }
    try {
      await _dio.delete<void>('/me/experience/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw ExperienceException(friendlyDioMessage(e));
    }
  }
}

final experienceRepositoryProvider = FutureProvider<ExperienceRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ExperienceRepository(dio);
});
