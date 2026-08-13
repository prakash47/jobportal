import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/config/demo_data.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'profile_overview.dart';

class ProfileException implements Exception {
  const ProfileException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads the seeker's profile overview (`GET /me/profile`). Editing is handled
/// by the onboarding/profile wizard, which owns the section-level writes.
class ProfileRepository {
  const ProfileRepository(this._dio);

  final Dio _dio;

  Future<ProfileOverview> load() async {
    if (AppConfig.useMockData) return ProfileOverview.fromJson(DemoData.profile);
    try {
      final res = await _dio.get<Map<String, dynamic>>('/me/profile');
      return ProfileOverview.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ProfileException(friendlyDioMessage(e));
    }
  }
}

final profileRepositoryProvider = FutureProvider<ProfileRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ProfileRepository(dio);
});
