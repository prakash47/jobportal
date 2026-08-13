import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'catalog_models.dart';
import 'catalogs_mock.dart';

class CatalogsException implements Exception {
  const CatalogsException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads the reference catalogs (`/v1/skills`, `/v1/cities`, `/v1/industries`).
/// `search` powers type-ahead pickers; `resolve` turns the bare ids the profile
/// endpoint returns into labels. Static sample data in demo mode.
class CatalogsRepository {
  const CatalogsRepository(this._dio);

  final Dio _dio;

  Future<CatalogPage> search(
    CatalogKind kind, {
    String? q,
    int page = 1,
    int pageSize = 30,
  }) async {
    if (AppConfig.useMockData) {
      return CatalogMock.search(kind, q: q, page: page, pageSize: pageSize);
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        kind.path,
        queryParameters: {
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          'page': page,
          'pageSize': pageSize,
        },
      );
      return CatalogPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw CatalogsException(friendlyDioMessage(e));
    }
  }

  /// Resolve bare ids → labels (`?ids=7,47`). Best-effort: returns what it can.
  Future<List<CatalogItem>> resolve(CatalogKind kind, List<int> ids) async {
    if (ids.isEmpty) return const [];
    if (AppConfig.useMockData) return CatalogMock.resolve(kind, ids);
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        kind.path,
        queryParameters: {'ids': ids.join(',')},
      );
      return CatalogPage.fromJson(res.data ?? const {}).hits;
    } on DioException {
      return const [];
    }
  }
}

final catalogsRepositoryProvider = FutureProvider<CatalogsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return CatalogsRepository(dio);
});
