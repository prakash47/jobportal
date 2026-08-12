import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'article_models.dart';
import 'articles_mock.dart';

class ArticlesException implements Exception {
  const ArticlesException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads career-advice articles (`/career-advice`, `/career-advice/:slug`).
/// Static sample data while [AppConfig.useMockData] is true; flip it and the
/// same methods hit the live API.
class ArticlesRepository {
  const ArticlesRepository(this._dio);

  final Dio _dio;

  Future<ArticlesPage> list({String? tag, String? q, int page = 1}) async {
    if (AppConfig.useMockData) {
      return ArticlesMock.list(tag: tag, q: q, page: page);
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/v1/career-advice',
        queryParameters: {
          if (tag != null && tag.isNotEmpty) 'tag': tag,
          if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
          'page': page,
        },
      );
      return ArticlesPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ArticlesException(friendlyDioMessage(e));
    }
  }

  Future<ArticleDetail> detail(String slug) async {
    if (AppConfig.useMockData) {
      final a = await ArticlesMock.detail(slug);
      if (a == null) throw const ArticlesException('Article not found.');
      return a;
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/career-advice/$slug');
      return ArticleDetail.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        throw const ArticlesException('Article not found.');
      }
      throw ArticlesException(friendlyDioMessage(e));
    }
  }
}

final articlesRepositoryProvider = FutureProvider<ArticlesRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ArticlesRepository(dio);
});
