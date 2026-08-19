import 'package:cq_mobile/features/jobs/data/jobs_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records the request the repository builds and short-circuits it, so these
/// assert the SHAPE of the call without a server.
///
/// These exist because two contract-drift bugs shipped undetected: saving a job
/// posted `{jobId}` to the collection when the route is `POST /me/saved-jobs/:jobId`
/// (so every save 404'd), and the quota read is on a version-NEUTRAL path while
/// its neighbours carry `/v1`. Both are invisible to the analyzer and to any test
/// that mocks the repository instead of the transport.
class _Recorder extends Interceptor {
  final List<RequestOptions> requests = [];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    requests.add(options);
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: <String, dynamic>{},
      ),
    );
  }
}

void main() {
  late Dio dio;
  late _Recorder rec;
  late JobsRepository repo;

  setUp(() {
    dio = Dio();
    rec = _Recorder();
    dio.interceptors.add(rec);
    repo = JobsRepository(dio);
  });

  group('saved jobs', () {
    test('save puts the job id in the PATH and sends no body', () async {
      await repo.setSaved(42, true);

      final req = rec.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/me/saved-jobs/42');
      expect(req.data, isNull, reason: 'the route takes @Param, not @Body');
    });

    test('unsave deletes the same path', () async {
      await repo.setSaved(42, false);

      final req = rec.requests.single;
      expect(req.method, 'DELETE');
      expect(req.path, '/me/saved-jobs/42');
    });
  });

  group('path versioning', () {
    test('apply quota is NOT under /v1 — that controller is version-neutral',
        () async {
      await repo.applyQuota();

      expect(rec.requests.single.path, '/me/applications/quota');
    });

    test('job search IS under /v1', () async {
      await repo.search(q: 'flutter');

      expect(rec.requests.single.path, '/v1/jobs');
    });

    test('bulk job-state IS under /v1', () async {
      await repo.jobState([1, 2]);

      expect(rec.requests.single.path, '/v1/me/job-state');
    });

    test('apply is NOT under /v1', () async {
      await repo.apply(7);

      final req = rec.requests.single;
      expect(req.path, '/me/applications');
      expect(req.data, <String, dynamic>{'jobId': 7});
    });
  });

  test('repeatable filters serialize as skill=a&skill=b, never skill[]',
      () async {
    await repo.search(q: 'dev');

    expect(rec.requests.single.listFormat, ListFormat.multi);
  });
}
