import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'education_mock.dart';
import 'education_models.dart';

class EducationException implements Exception {
  const EducationException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Candidate education (`/me/education`, no `/v1`). GET list, POST create,
/// PATCH `:id`, DELETE `:id`. Static in demo mode.
class EducationRepository {
  const EducationRepository(this._dio);

  final Dio _dio;

  Future<List<EducationItem>> list() async {
    if (AppConfig.useMockData) return EducationMock.list();
    try {
      final res = await _dio.get<List<dynamic>>('/me/education');
      return (res.data ?? const [])
          .whereType<Map>()
          .map((m) => EducationItem.fromJson(m.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw EducationException(friendlyDioMessage(e));
    }
  }

  Future<EducationItem> create(Map<String, dynamic> body) async {
    if (AppConfig.useMockData) return EducationMock.create(body);
    try {
      final res = await _dio.post<Map<String, dynamic>>('/me/education', data: body);
      return EducationItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw EducationException(friendlyDioMessage(e));
    }
  }

  Future<EducationItem> update(int id, Map<String, dynamic> body) async {
    if (AppConfig.useMockData) return EducationMock.update(id, body);
    try {
      final res = await _dio.patch<Map<String, dynamic>>('/me/education/$id', data: body);
      return EducationItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw EducationException(friendlyDioMessage(e));
    }
  }

  Future<void> remove(int id) async {
    if (AppConfig.useMockData) {
      EducationMock.delete(id);
      return;
    }
    try {
      await _dio.delete<void>('/me/education/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw EducationException(friendlyDioMessage(e));
    }
  }
}

final educationRepositoryProvider = FutureProvider<EducationRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return EducationRepository(dio);
});
