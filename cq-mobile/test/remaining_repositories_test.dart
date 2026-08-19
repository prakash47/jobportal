import 'package:cq_mobile/features/alerts/data/alerts_repository.dart';
import 'package:cq_mobile/features/applications/data/applications_repository.dart';
import 'package:cq_mobile/features/catalogs/data/catalogs_repository.dart';
import 'package:cq_mobile/features/dashboard/data/dashboard_repository.dart';
import 'package:cq_mobile/features/jobs/data/jobs_repository.dart';
import 'package:cq_mobile/features/onboarding/data/onboarding_repository.dart';
import 'package:cq_mobile/features/saved_jobs/data/saved_jobs_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// The last three repositories with no coverage: saved jobs, onboarding, and
/// the dashboard composite that Home's activity row is built from.
///
/// Driven through a real Dio with a faked transport, like the other contract
/// tests, so a wrong path or a renamed key fails here rather than silently on
/// a device. All of these sit on the version-NEUTRAL /me/* surface — a stray
/// /v1 is a 404, and a 404 on a count is swallowed by design, so the number
/// would just quietly disappear from Home.
class _Api implements HttpClientAdapter {
  _Api(this.routes, {this.fail = const {}});

  /// path → JSON body.
  final Map<String, String> routes;

  /// path → status code to fail with.
  final Map<String, int> fail;

  final List<RequestOptions> seen = [];

  RequestOptions get last => seen.last;
  List<String> get calls => [for (final r in seen) '${r.method} ${r.path}'];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    final status = fail[options.path];
    if (status != null) {
      return ResponseBody.fromString(
        '{"statusCode":$status,"message":"nope"}',
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      routes[options.path] ?? '{}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _dio(_Api api) =>
    Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = api;

const _jobHit =
    '{"id":42,"title":"Flutter Engineer","canonicalSlug":"fe-acme-42",'
    '"company":{"id":7,"name":"Acme","slug":"acme"}}';

void main() {
  group('SavedJobsRepository', () {
    test('lists from the version-neutral route, paged', () async {
      final api = _Api({
        '/me/saved-jobs':
            '{"hits":[],"total":7,"page":2,"pageSize":20}',
      });
      final page = await SavedJobsRepository(_dio(api)).list(page: 2);

      expect(api.last.method, 'GET');
      expect(api.last.path, '/me/saved-jobs');
      expect(api.last.path, isNot(contains('/v1')));
      expect(api.last.queryParameters['page'], 2);
      expect(page.total, 7);
    });

    test('removing puts the job id in the path and sends no body', () async {
      final api = _Api(const {});
      await SavedJobsRepository(_dio(api)).remove(42);

      expect(api.last.method, 'DELETE');
      expect(api.last.path, '/me/saved-jobs/42');
      expect(api.last.data, isNull);
    });

    test('a 404 on remove is success — the row is already gone', () async {
      // The user tapped remove twice, or removed it on the website first.
      // Treating that as an error would put a red toast on a screen that is
      // showing exactly what they asked for.
      final api = _Api(const {}, fail: {'/me/saved-jobs/42': 404});
      await expectLater(
        SavedJobsRepository(_dio(api)).remove(42),
        completes,
      );
    });

    test('any other failure is surfaced', () async {
      final api = _Api(const {}, fail: {'/me/saved-jobs/42': 500});
      await expectLater(
        SavedJobsRepository(_dio(api)).remove(42),
        throwsA(isA<SavedJobsException>()),
      );
    });
  });

  group('OnboardingRepository', () {
    test('reads and patches the profile on the same neutral route', () async {
      final api = _Api({'/me/profile': '{"headline":"SDE"}'});
      final repo = OnboardingRepository(_dio(api));

      await repo.loadProfile();
      expect(api.last.path, '/me/profile');
      expect(api.last.method, 'GET');

      await repo.patchProfile({'headline': 'Senior SDE'});
      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/profile');
      expect(api.last.data, {'headline': 'Senior SDE'});
    });

    test('skills go to their own route carrying both lists', () async {
      // customSkills exists so a candidate can name something the catalogue
      // has never heard of; dropping either list loses half the answer.
      final api = _Api(const {});
      await OnboardingRepository(_dio(api)).saveSkills(
        skillIds: [3, 9],
        customSkills: ['Riverpod'],
      );

      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/skills');
      expect(api.last.data, {
        'skillIds': [3, 9],
        'customSkills': ['Riverpod'],
      });
    });

    test('creating an education row returns its new id', () async {
      // The wizard re-saves as the user steps back and forth. Without the id
      // the second save creates a duplicate degree instead of editing the one
      // already there.
      final api = _Api({'/me/education': '{"id":15}'});
      final id = await OnboardingRepository(_dio(api))
          .createEducation({'institute': 'IIT', 'degree': 'B.Tech'});

      expect(api.last.method, 'POST');
      expect(id, 15);
    });

    test('a create that answers without an id yields null, not a crash',
        () async {
      final api = _Api({'/me/education': '{}'});
      expect(
        await OnboardingRepository(_dio(api)).createEducation(const {}),
        isNull,
      );
    });

    test('updating an education row addresses it by id', () async {
      final api = _Api(const {});
      await OnboardingRepository(_dio(api))
          .updateEducation(15, {'grade': 'A'});

      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/education/15');
    });

    test('a failure carries the server sentence, not a generic one', () async {
      final api = _Api(const {}, fail: {'/me/profile': 400});
      await expectLater(
        // A non-empty body on purpose: patchProfile short-circuits an empty
        // one rather than sending a PATCH that asks for no change.
        OnboardingRepository(_dio(api)).patchProfile(const {'headline': 'x'}),
        throwsA(
          isA<OnboardingException>().having((e) => e.message, 'message', 'nope'),
        ),
      );
    });
  });

  group('DashboardRepository', () {
    DashboardRepository build(_Api api) {
      final dio = _dio(api);
      return DashboardRepository(
        applications: ApplicationsRepository(dio),
        saved: SavedJobsRepository(dio),
        alerts: AlertsRepository(dio),
        profile: OnboardingRepository(dio),
        catalogs: CatalogsRepository(dio),
        jobs: JobsRepository(dio),
      );
    }

    test('collects every count in one pass', () async {
      final api = _Api({
        '/me/applications': '{"hits":[],"total":4,"counts":{"ALL":12}}',
        '/me/saved-jobs': '{"hits":[],"total":6}',
        '/me/alerts': '[{"id":1},{"id":2}]',
        '/me/profile': '{}',
      });

      final snap = await build(api).load();

      // 'ALL' wins over total: total is the size of the page that came back,
      // and Home is reporting how many applications the candidate HAS.
      expect(snap.applications, 12);
      expect(snap.saved, 6);
      expect(snap.alerts, 2);
      // Four reads, not four round trips in sequence.
      expect(api.calls, contains('GET /me/applications'));
      expect(api.calls, contains('GET /me/saved-jobs'));
      expect(api.calls, contains('GET /me/alerts'));
    });

    test('falls back to total when the server sends no counts map', () async {
      final api = _Api({
        '/me/applications': '{"hits":[],"total":4}',
        '/me/saved-jobs': '{"total":0}',
        '/me/alerts': '[]',
        '/me/profile': '{}',
      });
      final snap = await build(api).load();
      expect(snap.applications, 4);
      // A real zero must still read as zero, not as unknown.
      expect(snap.saved, 0);
      expect(snap.alerts, 0);
    });

    test('a count that fails is unknown, never zero', () async {
      // This is the whole reason the fields are nullable. Rendering a failed
      // read as 0 tells a candidate with twelve live applications that they
      // have none — and Home is the first thing they see.
      final api = _Api({
        '/me/saved-jobs': '{"total":6}',
        '/me/alerts': '[]',
        '/me/profile': '{}',
      }, fail: {'/me/applications': 500});

      final snap = await build(api).load();

      expect(snap.applications, isNull);
      expect(snap.saved, 6, reason: 'one failure must not sink the others');
      expect(snap.alerts, 0);
    });

    test('one broken count does not take the whole row down', () async {
      final api = _Api({'/me/profile': '{}'}, fail: {
        '/me/applications': 500,
        '/me/saved-jobs': 503,
        '/me/alerts': 500,
      });

      final snap = await build(api).load();

      expect(snap.applications, isNull);
      expect(snap.saved, isNull);
      expect(snap.alerts, isNull);
      expect(snap.recommended, isEmpty);
    });

    test('recommends nothing when the profile names no skills or cities',
        () async {
      // A generic list here would just repeat Latest jobs further down Home.
      final api = _Api({
        '/me/applications': '{"total":0}',
        '/me/saved-jobs': '{"total":0}',
        '/me/alerts': '[]',
        '/me/profile': '{"candidate":{"skillIds":[],"preferredCityIds":[]}}',
      });

      final snap = await build(api).load();

      expect(snap.recommended, isEmpty);
      expect(api.calls, isNot(contains('GET /v1/jobs')),
          reason: 'no facets means there is nothing to search for');
    });

    test('drops jobs already applied to, and marks the saved ones', () async {
      // Recommending a job with a live application on it is noise. A saved
      // one is a useful nudge, so it stays — with its bookmark filled in.
      final api = _Api({
        '/me/applications': '{"total":0}',
        '/me/saved-jobs': '{"total":0}',
        '/me/alerts': '[]',
        '/me/profile': '{"candidate":{"skillIds":[3],"preferredCityIds":[]}}',
        '/v1/skills': '{"hits":[{"id":3,"name":"Dart","slug":"dart"}],"total":1}',
        '/v1/jobs': '{"hits":[$_jobHit,'
            '{"id":43,"title":"Backend","canonicalSlug":"be-acme-43",'
            '"company":{"id":7,"name":"Acme","slug":"acme"}}],'
            '"total":2,"page":1,"pageSize":20}',
        '/v1/me/job-state': '{"saved":[42],"applied":{"43":"APPLIED"}}',
      });

      final snap = await build(api).load();

      expect(snap.recommended.map((j) => j.id), [42]);
      expect(snap.recommended.single.isSaved, isTrue);
    });
  });
}
