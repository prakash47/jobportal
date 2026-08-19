import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/network_providers.dart';

class ReportsException implements Exception {
  const ReportsException(this.message, {this.alreadyReported = false});
  final String message;

  /// The server refused because this person already has an open report on this
  /// job. Not really a failure — the UI says thanks rather than showing red.
  final bool alreadyReported;

  @override
  String toString() => message;
}

/// Why a job is being reported. These are the server's enum values verbatim
/// (`ContentReportReason`); the labels live in the UI.
enum ReportReason {
  fakeOrScam('FAKE_OR_SCAM', 'Fake or a scam'),
  misleading('MISLEADING', 'Misleading or inaccurate'),
  discriminatory('DISCRIMINATORY', 'Discriminatory'),
  offensive('OFFENSIVE', 'Offensive content'),
  duplicate('DUPLICATE', 'Duplicate posting'),
  other('OTHER', 'Something else');

  const ReportReason(this.wire, this.label);
  final String wire;
  final String label;
}

/// Files content reports (`POST /v1/reports`).
///
/// Anonymous is allowed by design — the job page is public and mostly
/// logged-out traffic, so a sign-in wall would suppress exactly the reports
/// worth having. A signed-in reporter is attributed automatically through the
/// session cookie, which is what lets the server enforce one open report per
/// person.
class ReportsRepository {
  const ReportsRepository(this._dio);

  final Dio _dio;

  Future<void> reportJob({
    required int jobId,
    required ReportReason reason,
    String? details,
  }) async {
    if (AppConfig.useMockData) return;
    try {
      await _dio.post<void>(
        '/v1/reports',
        // The DTO is .strict() — an extra key is a 400, so send exactly these.
        data: {
          'targetType': 'JOB',
          'jobId': jobId,
          'reason': reason.wire,
          if (details != null && details.trim().isNotEmpty)
            'details': details.trim(),
        },
      );
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 409) {
        throw const ReportsException(
          "You've already reported this job. Our team is looking at it.",
          alreadyReported: true,
        );
      }
      if (status == 503) {
        // moderation.reports.enabled is off — a deliberate operator action,
        // not a fault of theirs.
        throw const ReportsException(
          'Reporting is unavailable right now. Please try again later.',
        );
      }
      if (status == 429) {
        throw const ReportsException(
          "You've sent several reports just now. Please wait a minute.",
        );
      }
      if (status == 404) {
        throw const ReportsException('This job is no longer available.');
      }
      throw ReportsException(friendlyDioMessage(e));
    }
  }
}

final reportsRepositoryProvider = FutureProvider<ReportsRepository>((ref) async {
  final dio = await ref.watch(dioProvider.future);
  return ReportsRepository(dio);
});
