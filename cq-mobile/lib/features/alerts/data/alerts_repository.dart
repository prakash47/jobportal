import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/config/demo_data.dart';
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

  /// Server cap on alerts per user (`MAX_ALERTS_PER_USER` in the API's
  /// alerts.service.ts). No endpoint exposes it, so the app mirrors the number
  /// by hand — same as the website does. Paused alerts count toward it: the
  /// server counts every row for the user, with no `isActive` filter.
  static const int maxAlerts = 10;

  final Dio _dio;

  Future<List<JobAlert>> list() async {
    if (AppConfig.useMockData) {
      return DemoData.alerts.map(JobAlert.fromJson).toList();
    }
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
    if (AppConfig.useMockData) return;
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
    if (AppConfig.useMockData) return;
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
    if (AppConfig.useMockData) return;
    try {
      await _dio.delete<void>('/me/alerts/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw AlertsException(friendlyDioMessage(e));
    }
  }

  /// Queue a scan of one alert (`POST /me/alerts/:id/test` → 202 `{queued:true}`).
  ///
  /// "Queued" is the strongest word the response supports, and the UI must not
  /// promise more: the worker still skips paused alerts and users who turned
  /// alert emails off, and it de-duplicates against jobs already emailed — so a
  /// second test minutes later legitimately sends nothing at all.
  Future<void> sendTest(int id) async {
    if (AppConfig.useMockData) return;
    try {
      await _dio.post<void>('/me/alerts/$id/test');
    } on DioException catch (e) {
      throw AlertsException(friendlyDioMessage(e));
    }
  }
}

final alertsRepositoryProvider = FutureProvider<AlertsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return AlertsRepository(dio);
});
