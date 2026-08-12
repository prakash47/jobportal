import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'notification_preferences.dart';

class SettingsException implements Exception {
  const SettingsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads + updates the user's email-notification toggles (`/me/notifications`).
/// Both candidates and recruiters share these toggles (they're attributes of
/// the User, not role-scoped).
class SettingsRepository {
  const SettingsRepository(this._dio);

  final Dio _dio;

  Future<NotificationPreferences> load() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/me/notifications');
      return NotificationPreferences.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw SettingsException(friendlyDioMessage(e));
    }
  }

  /// PATCH the full set; the endpoint returns the server's updated view.
  Future<NotificationPreferences> save(NotificationPreferences prefs) async {
    try {
      final res = await _dio.patch<Map<String, dynamic>>(
        '/me/notifications',
        data: prefs.toJson(),
      );
      return NotificationPreferences.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw SettingsException(friendlyDioMessage(e));
    }
  }

  /// Permanently deletes the signed-in candidate account
  /// (`DELETE /v1/me/account`). Irreversible — the server requires the literal
  /// confirmation string "DELETE". App stores require this to exist.
  Future<void> deleteAccount() async {
    try {
      await _dio.delete<void>('/v1/me/account', data: {'confirm': 'DELETE'});
    } on DioException catch (e) {
      throw SettingsException(friendlyDioMessage(e));
    }
  }
}

final settingsRepositoryProvider =
    FutureProvider<SettingsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return SettingsRepository(dio);
});
