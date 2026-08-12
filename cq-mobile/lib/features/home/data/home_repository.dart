import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'home_models.dart';
import 'home_mock.dart';

class HomeException implements Exception {
  const HomeException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads the Home feed (`GET /home`). Static sample data while
/// [AppConfig.useMockData] is true; flip it and the same method hits the live
/// composite endpoint.
class HomeRepository {
  const HomeRepository(this._dio);

  final Dio _dio;

  Future<HomeFeed> load() async {
    if (AppConfig.useMockData) {
      return HomeMock.load();
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/home');
      return HomeFeed.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw HomeException(friendlyDioMessage(e));
    }
  }
}

final homeRepositoryProvider = FutureProvider<HomeRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return HomeRepository(dio);
});
