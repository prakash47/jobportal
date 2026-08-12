import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'company_models.dart';
import 'companies_mock.dart';

class CompaniesException implements Exception {
  const CompaniesException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Reads the public companies directory + profiles (`/companies`,
/// `/companies/:handle`). Static sample data while [AppConfig.useMockData] is
/// true; flip it and the same methods hit the live API.
class CompaniesRepository {
  const CompaniesRepository(this._dio);

  final Dio _dio;

  Future<CompaniesPage> list({String? category, String? sort, int page = 1}) async {
    if (AppConfig.useMockData) {
      return CompaniesMock.list(category: category, sort: sort, page: page);
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/v1/companies',
        queryParameters: {
          if (category != null && category.isNotEmpty) 'category': category,
          if (sort != null && sort.isNotEmpty) 'sort': sort,
          'page': page,
        },
      );
      return CompaniesPage.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw CompaniesException(friendlyDioMessage(e));
    }
  }

  Future<CompanyProfile> profile(String handle) async {
    if (AppConfig.useMockData) {
      final p = await CompaniesMock.profile(handle);
      if (p == null) throw const CompaniesException('Company not found.');
      return p;
    }
    try {
      final res = await _dio.get<Map<String, dynamic>>('/v1/companies/$handle');
      return CompanyProfile.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        throw const CompaniesException('Company not found.');
      }
      throw CompaniesException(friendlyDioMessage(e));
    }
  }
}

final companiesRepositoryProvider = FutureProvider<CompaniesRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return CompaniesRepository(dio);
});
