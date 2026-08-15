import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'language_models.dart';
import 'languages_mock.dart';

class LanguagesException implements Exception {
  const LanguagesException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Candidate languages (`/me/languages`, no `/v1`). GET list, POST create,
/// DELETE `:id`. Names are unique per candidate → 409 surfaces as a friendly
/// "already added". No PATCH, so editing = delete + create. Static in demo mode.
class LanguagesRepository {
  const LanguagesRepository(this._dio);

  final Dio _dio;

  Future<List<LanguageItem>> list() async {
    if (AppConfig.useMockData) return LanguagesMock.list();
    try {
      final res = await _dio.get<List<dynamic>>('/me/languages');
      return (res.data ?? const [])
          .whereType<Map>()
          .map((m) => LanguageItem.fromJson(m.cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw LanguagesException(friendlyDioMessage(e));
    }
  }

  Future<LanguageItem> create(Map<String, dynamic> body) async {
    if (AppConfig.useMockData) {
      try {
        return LanguagesMock.create(body);
      } on StateError {
        throw const LanguagesException('That language is already added.');
      }
    }
    try {
      final res = await _dio.post<Map<String, dynamic>>('/me/languages', data: body);
      return LanguageItem.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        throw const LanguagesException('That language is already added.');
      }
      throw LanguagesException(friendlyDioMessage(e));
    }
  }

  Future<void> remove(int id) async {
    if (AppConfig.useMockData) {
      LanguagesMock.delete(id);
      return;
    }
    try {
      await _dio.delete<void>('/me/languages/$id');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw LanguagesException(friendlyDioMessage(e));
    }
  }

  /// Edit = delete the old row then create a fresh one (no PATCH on the API).
  Future<LanguageItem> replace(int id, Map<String, dynamic> body) async {
    await remove(id);
    return create(body);
  }
}

final languagesRepositoryProvider = FutureProvider<LanguagesRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return LanguagesRepository(dio);
});
