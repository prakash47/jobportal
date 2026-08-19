import 'dart:typed_data';

import 'package:cq_mobile/features/reports/data/reports_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.status);
  final int status;
  RequestOptions? seen;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen = options;
    if (status >= 400) {
      throw _badResponse(options, status);
    }
    return ResponseBody.fromString('{}', status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

DioException _badResponse(RequestOptions o, int status) =>
    DioException.badResponse(
      statusCode: status,
      requestOptions: o,
      response: Response<dynamic>(requestOptions: o, statusCode: status),
    );

(ReportsRepository, _Adapter) _repo(int status) {
  final adapter = _Adapter(status);
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = adapter;
  return (ReportsRepository(dio), adapter);
}

void main() {
  test('sends exactly the keys the strict DTO accepts', () async {
    final (repo, adapter) = _repo(201);

    await repo.reportJob(
      jobId: 42,
      reason: ReportReason.fakeOrScam,
      details: '  looks like a scam  ',
    );

    expect(adapter.seen!.path, '/v1/reports');
    final body = adapter.seen!.data as Map<String, dynamic>;
    expect(body, {
      'targetType': 'JOB',
      'jobId': 42,
      'reason': 'FAKE_OR_SCAM',
      'details': 'looks like a scam', // trimmed
    });
  });

  test('omits details entirely when blank — the DTO is .strict()', () async {
    final (repo, adapter) = _repo(201);

    await repo.reportJob(jobId: 7, reason: ReportReason.other, details: '   ');

    expect((adapter.seen!.data as Map).containsKey('details'), isFalse);
  });

  test('every reason maps to a server enum value', () {
    expect(
      ReportReason.values.map((r) => r.wire).toSet(),
      {
        'FAKE_OR_SCAM',
        'MISLEADING',
        'DISCRIMINATORY',
        'OFFENSIVE',
        'DUPLICATE',
        'OTHER',
      },
    );
  });

  test('409 is a duplicate, not a failure the user must act on', () async {
    final (repo, _) = _repo(409);

    await expectLater(
      repo.reportJob(jobId: 1, reason: ReportReason.duplicate),
      throwsA(
        isA<ReportsException>().having((e) => e.alreadyReported, 'dup', isTrue),
      ),
    );
  });

  test('503 means the moderation flag is off, and says so plainly', () async {
    final (repo, _) = _repo(503);

    await expectLater(
      repo.reportJob(jobId: 1, reason: ReportReason.offensive),
      throwsA(
        isA<ReportsException>()
            .having((e) => e.message, 'message', contains('unavailable'))
            .having((e) => e.alreadyReported, 'dup', isFalse),
      ),
    );
  });
}
