import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';
import 'resume_mock.dart';
import 'resume_models.dart';

class ResumeException implements Exception {
  const ResumeException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The candidate's resume (`/me/resume`, no `/v1`). PDF/DOC/DOCX, ≤ 5 MB, the
/// multipart field is `file`. Static in demo mode.
class ResumeRepository {
  const ResumeRepository(this._dio);

  final Dio _dio;

  Future<ResumeView?> getActive() async {
    if (AppConfig.useMockData) return ResumeMock.current;
    try {
      final res = await _dio.get<dynamic>('/me/resume');
      final data = res.data;
      if (data is Map && data.isNotEmpty) {
        return ResumeView.fromJson(data.cast<String, dynamic>());
      }
      return null; // no resume on file
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      throw ResumeException(friendlyDioMessage(e));
    }
  }

  Future<ResumeView> upload(String path, String filename, {int? size}) async {
    if (AppConfig.useMockData) return ResumeMock.set(filename, size ?? 240 * 1024);
    try {
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(path, filename: filename),
      });
      final res = await _dio.post<Map<String, dynamic>>('/me/resume', data: form);
      return ResumeView.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw ResumeException(friendlyDioMessage(e)); // 400 = wrong type / too large
    }
  }

  Future<void> remove() async {
    if (AppConfig.useMockData) {
      ResumeMock.clear();
      return;
    }
    try {
      await _dio.delete<void>('/me/resume');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return;
      throw ResumeException(friendlyDioMessage(e));
    }
  }
}

final resumeRepositoryProvider = FutureProvider<ResumeRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ResumeRepository(dio);
});
