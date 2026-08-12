import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'job_alert.dart';

class AlertsException implements Exception {
  const AlertsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// CRUD for the seeker's job alerts (`/me/alerts`). Max 10 per user (server
/// enforced). The [query] merges the app-editable fields over any existing
/// query so website-set skill/city filters survive an app edit.
class AlertsRepository {
  const AlertsRepository(this._dio);

  final Dio _dio;

  Future<List<JobAlert>> list() async {
    try {
      final res = await _dio.get<List<dynamic>>('/me/alerts');
      return (res.data ?? const [])
          .whereType<Map>()
          .map((m) => JobAlert.fromJson(m.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw AlertsException(friendlyDioMessage(e));
    }
  }

  Future<void> create({
    required String name,
    required String frequency,
    required Map<String, dynamic> query,
    bool isActive = true,
  }) async {
    try {
      await _dio.post<void>(
        '/me/alerts',
        data: {
          'name': name,
          'frequency': frequency,
          'query': query,
          'isActive': isActive,
        },
      );
    } on DioException catch (e) {
      throw AlertsException(friendlyDioMessage(e));
    }
  }

  Future<void> update(
    int id, {
    String? name,
    String? frequency,
    Map<String, dynamic>? query,
    bool? isActive,
  }) async {
    try {
      await _dio.patch<void>(
        '/me/alerts/$id',
        data: {
          'name': ?name,
          'frequency': ?frequency,
          'query': ?query,
          'isActive': ?isActive,
        },
      );
    } on DioException catch (e) {
      throw AlertsException(friendlyDioMessage(e));
    }
  }

  Future<void> setActive(int id, bool active) => update(id, isActive: active);

  Future<void> remove(int id) async {
    try {
      await _dio.delete<void>('/me/alerts/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw AlertsException(friendlyDioMessage(e));
    }
  }
}

final alertsRepositoryProvider = FutureProvider<AlertsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return AlertsRepository(dio);
});
