import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'application.dart';

class ApplicationsException implements Exception {
  const ApplicationsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads + mutates the signed-in seeker's applications (`/me/applications`).
class ApplicationsRepository {
  const ApplicationsRepository(this._dio);

  final Dio _dio;

  /// [status] 'ALL' (or null) returns everything; otherwise filters by status.
  Future<ApplicationsPage> list({String status = 'ALL', int page = 1}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/me/applications',
        queryParameters: {
          if (status != 'ALL') 'status': status,
          'page': page,
        },
      );
      return ApplicationsPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ApplicationsException(friendlyDioMessage(e));
    }
  }

  /// Withdraw an application. Returns the new status.
  Future<String> withdraw(int id) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/me/applications/$id/withdraw',
      );
      return res.data?['status'] as String? ?? 'WITHDRAWN';
    } on DioException catch (e) {
      throw ApplicationsException(friendlyDioMessage(e));
    }
  }
}

final applicationsRepositoryProvider = FutureProvider<ApplicationsRepository>((
  ref,
) async {
  final dio = await ref.watch(dioProvider.future);
  return ApplicationsRepository(dio);
});
