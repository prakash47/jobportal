import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/features/alerts/data/alerts_repository.dart';
import 'package:cq_mobile/features/applications/data/applications_repository.dart';
import 'package:cq_mobile/features/career_advice/data/article_models.dart';
import 'package:cq_mobile/features/career_advice/data/articles_repository.dart';
import 'package:cq_mobile/features/companies/data/companies_repository.dart';
import 'package:cq_mobile/features/education/data/education_repository.dart';
import 'package:cq_mobile/features/experience/data/experience_repository.dart';
import 'package:cq_mobile/features/home/data/home_repository.dart';
import 'package:cq_mobile/features/profile/data/profile_repository.dart';
import 'package:cq_mobile/features/settings/data/notification_preferences.dart';
import 'package:cq_mobile/features/settings/data/settings_repository.dart';
import 'package:cq_mobile/features/skills/data/skills_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Most of this app's repositories had no test at all, and every one of them is
/// a hand-written contract with the API: a literal path string, a verb, a body
/// map, a decision about whether the route carries `/v1`. None of that is
/// checked by the analyzer, and none of it is checked by a test that mocks the
/// repository instead of the transport — the mock agrees with whatever the
/// repository says, including when the repository is wrong.
///
/// Every contract bug this codebase has actually shipped was of that shape: an
/// id sent in the body when the route wanted it in the path, a `/v1` prefix on
/// one route and not its neighbour, a PATCH key dropped so clearing a field
/// silently did nothing. So these drive a real Dio through a fake adapter —
/// the request asserted is the one that would go on the wire, and the reaction
/// to a status code is the production one. Paths and body shapes are pinned
/// against the NestJS controllers and Zod DTOs they talk to.
///
/// Account deletion leads, because it is the only call in the app with nothing
/// to undo it: the settings screen signs the user out the instant it returns.
class _Reply {
  const _Reply(this.json, {this.status = 200});

  final String json;

  /// >= 400 makes Dio raise the same `DioException` the app sees in
  /// production, response body attached.
  final int status;
}

class _Api implements HttpClientAdapter {
  _Api(this._reply);

  /// Answers per request, so a two-hop call can be scripted by path.
  final _Reply Function(RequestOptions o) _reply;

  final List<RequestOptions> seen = [];

  /// The bytes actually handed to the socket, decoded — null when the request
  /// carries no body at all.
  ///
  /// `RequestOptions.data` is the map the caller passed, captured *before*
  /// Dio's transformer runs, so asserting on it cannot tell the difference
  /// between a body that reaches the server and one that gets dropped on the
  /// way out. Anywhere a specific key is the point of the call, assert this.
  final List<String?> bodies = [];

  RequestOptions get last => seen.last;

  String? get lastBody => bodies.last;

  /// 'GET /me/profile', in call order — for asserting a sequence.
  List<String> get calls => seen.map((o) => '${o.method} ${o.path}').toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    bodies.add(
      requestStream == null
          ? null
          : utf8.decode(await requestStream.expand((c) => c).toList()),
    );
    final reply = _reply(options);
    // The content-type header is load-bearing: without it Dio hands the
    // repository a String and every parser reads garbage instead of failing.
    return ResponseBody.fromString(reply.json, reply.status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

_Api _api({String json = '{}', int status = 200}) =>
    _Api((_) => _Reply(json, status: status));

/// A phone with no signal.
_Api _dead() => _Api(
      (o) => throw DioException.connectionError(
        requestOptions: o,
        reason: 'no network',
      ),
    );

Dio _dio(_Api api) =>
    Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = api;

void main() {
  group('account deletion', () {
    test('DELETE /v1/me/account — versioned, unlike its own neighbours', () async {
      final api = _api();
      await SettingsRepository(_dio(api)).deleteAccount();

      expect(api.last.method, 'DELETE');
      expect(api.last.path, '/v1/me/account');
    });

    test('the confirmation phrase is the entire body, spelled exactly', () async {
      final api = _api();
      await SettingsRepository(_dio(api)).deleteAccount();

      // DeleteAccountDto is z.object({confirm: z.literal('DELETE')}).strict():
      // a lowercase phrase, or one extra key alongside it, is a 400. The user
      // sees that as "Could not delete your account" on the one screen whose
      // only job is deleting the account, with nothing they can do about it.
      expect(api.last.data, {'confirm': 'DELETE'});
      // And the same again as it leaves the phone, because a DELETE body is
      // exactly the kind of thing a client library is entitled to drop.
      expect(api.lastBody, '{"confirm":"DELETE"}');
    });

    test('the phrase never travels in the query string', () async {
      final api = _api();
      await SettingsRepository(_dio(api)).deleteAccount();

      // A DELETE with a body is unusual, and the obvious "fix" is to move the
      // phrase to a query param — which writes the word DELETE into access
      // logs and proxy history right next to the account it destroyed.
      expect(api.last.queryParameters, isEmpty);
      expect(api.last.uri.query, isEmpty);
    });

    test('a refused deletion throws instead of reporting success', () async {
      // The screen calls logout() the moment this returns. Swallowing the
      // failure would sign the user out of an account that still exists, and
      // they would have to type DELETE again to find that out.
      final api = _api(json: '{"message":"Bad Request"}', status: 400);

      await expectLater(
        SettingsRepository(_dio(api)).deleteAccount(),
        throwsA(isA<SettingsException>()),
      );
    });

    test("the server's own explanation reaches the user", () async {
      final api = _api(
        json: '{"message":"Cancel your subscription before deleting."}',
        status: 409,
      );

      await expectLater(
        SettingsRepository(_dio(api)).deleteAccount(),
        throwsA(isA<SettingsException>().having(
          (e) => e.message,
          'message',
          'Cancel your subscription before deleting.',
        )),
      );
    });

    test('an unreachable server is not mistaken for a completed deletion',
        () async {
      // Deleting on a train, losing signal mid-request. Returning normally here
      // would log the user out and leave the account alive.
      await expectLater(
        SettingsRepository(_dio(_dead())).deleteAccount(),
        throwsA(isA<SettingsException>()),
      );
    });
  });

  group('notification settings', () {
    test('/me/notifications is NOT versioned, on both the read and the write',
        () async {
      final api = _api(
        json: '{"jobAlertsEnabled":true,"applicationStatusEnabled":true,'
            '"productNewsEnabled":false}',
      );
      final repo = SettingsRepository(_dio(api));

      await repo.load();
      expect(api.calls.single, 'GET /me/notifications');

      await repo.save(const NotificationPreferences(
        jobAlerts: false,
        applicationUpdates: true,
        productNews: false,
      ));
      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/notifications');

      // One repository, two version conventions: the toggles predate /v1, the
      // deletion route does not. Guessing either way round is a 404 the app
      // reports as "Something went wrong".
    });

    test('the PATCH carries the full set, so a switch turned OFF is sent',
        () async {
      final api = _api();
      await SettingsRepository(_dio(api)).save(const NotificationPreferences(
        jobAlerts: false,
        applicationUpdates: false,
        productNews: false,
      ));

      // A body built from only the enabled toggles would make every "turn it
      // off" a no-op that the screen still repaints as off — and the emails
      // keep arriving.
      expect(api.last.data, {
        'jobAlertsEnabled': false,
        'applicationStatusEnabled': false,
        'productNewsEnabled': false,
      });
      // `false` is the value most likely to be mistaken for "nothing to send",
      // so check it survives encoding rather than only that it was passed in.
      expect(api.lastBody, contains('"jobAlertsEnabled":false'));
    });
  });

  group('job alerts', () {
    test('the collection is a bare array at unversioned /me/alerts', () async {
      final api = _api(
        json: '[{"id":4,"name":"Flutter in Bengaluru","frequency":"daily",'
            '"isActive":true,'
            '"query":{"q":"flutter","citySlugs":["bengaluru"]},'
            '"lastSentAt":"2026-08-18T06:00:00.000Z"}]',
      );

      final alerts = await AlertsRepository(_dio(api)).list();

      expect(api.calls.single, 'GET /me/alerts');
      expect(alerts.single.name, 'Flutter in Bengaluru');
      expect(alerts.single.citySlugs, ['bengaluru']);
      expect(alerts.single.keywords, 'flutter');
    });

    test('create nests the saved query as its own object', () async {
      final api = _api();
      await AlertsRepository(_dio(api)).create(
        name: 'Remote Dart',
        frequency: 'weekly',
        query: const {
          'q': 'dart',
          'skillSlugs': ['dart'],
          'salaryMin': 120000000,
        },
      );

      expect(api.last.method, 'POST');
      expect(api.last.path, '/me/alerts');
      expect(api.last.data, {
        'name': 'Remote Dart',
        'frequency': 'weekly',
        'query': {
          'q': 'dart',
          'skillSlugs': ['dart'],
          'salaryMin': 120000000,
        },
        'isActive': true,
      });
      // AlertQueryDto is .strict() and lives one level down. Flattening the
      // query into the alert body is a 400 on every filter at once.
    });

    test('a partial update sends only the field that changed', () async {
      final api = _api();
      await AlertsRepository(_dio(api)).setActive(4, false);

      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/alerts/4');
      expect(api.last.data, {'isActive': false});

      // Not {name: null, frequency: null, query: null, isActive: false}:
      // AlertUpdateDto is `.partial()` over a `.strict()` object, which makes
      // every key `T | undefined` — never nullable. Absent means "no change";
      // an explicit null is not a string/object/boolean and fails outright, so
      // pausing an alert would 400 instead of pausing it.
    });

    test('the id rides in the path on the test-send route, with no body',
        () async {
      final api = _api();
      await AlertsRepository(_dio(api)).sendTest(4);

      expect(api.last.method, 'POST');
      expect(api.last.path, '/me/alerts/4/test');
      expect(api.lastBody, isNull, reason: 'the route takes @Param, not @Body');
    });

    test('deleting an alert that is already gone is not an error', () async {
      // Two taps on Delete, or a delete that raced the website. The row is gone
      // either way, which is exactly what the user asked for.
      final api = _api(json: '{"message":"Not Found"}', status: 404);

      await AlertsRepository(_dio(api)).remove(4);

      expect(api.calls.single, 'DELETE /me/alerts/4');
    });

    test('but a server error while deleting still surfaces', () async {
      // The row is still there, so silence would leave a deleted-looking alert
      // that keeps emailing.
      final api = _api(json: '{"message":"boom"}', status: 500);

      await expectLater(
        AlertsRepository(_dio(api)).remove(4),
        throwsA(isA<AlertsException>()),
      );
    });
  });

  group('applications', () {
    test('the unfiltered list omits ?status rather than sending ALL', () async {
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":20}');
      await ApplicationsRepository(_dio(api)).list();

      expect(api.last.path, '/me/applications');
      expect(api.last.queryParameters, {'page': 1});
    });

    test('a chip filter and a page both travel as query params', () async {
      final api = _api(json: '{"hits":[],"total":0,"page":2,"pageSize":20}');
      await ApplicationsRepository(_dio(api))
          .list(status: 'SHORTLISTED', page: 2);

      expect(api.last.queryParameters, {'status': 'SHORTLISTED', 'page': 2});
    });

    test('the per-status counts come back whole even while a filter is on',
        () async {
      // The chips badge themselves from `counts`, which the server computes
      // over the unfiltered set. Deriving them from `hits` instead makes every
      // badge except the selected one read 0 the moment a filter is applied.
      final api = _api(
        json: '{"hits":[],"total":3,"page":1,"pageSize":20,'
            '"counts":{"ALL":3,"APPLIED":2,"HIRED":1}}',
      );

      final page =
          await ApplicationsRepository(_dio(api)).list(status: 'HIRED');

      expect(page.counts, {'ALL': 3, 'APPLIED': 2, 'HIRED': 1});
    });

    test('withdraw posts to the row itself, carrying no body', () async {
      final api = _api(
        json: '{"id":9,"status":"WITHDRAWN",'
            '"updatedAt":"2026-08-19T00:00:00.000Z"}',
      );

      await ApplicationsRepository(_dio(api)).withdraw(9);

      expect(api.last.method, 'POST');
      expect(api.last.path, '/me/applications/9/withdraw');
      expect(api.lastBody, isNull, reason: 'the route takes @Param, not @Body');

      // Deliberately nothing here about the returned status. The repository
      // ends in `res.data?['status'] as String? ?? 'WITHDRAWN'` and the server
      // answers a successful withdraw with WITHDRAWN and nothing else, so an
      // assertion that the value was READ off the response passes just as
      // happily when the response is never read at all — confirmed by
      // mutation: renaming the key the repository looks up leaves this group
      // green. The hole is the fallback, not the test, and it is reported.
    });

    test('a refused withdraw surfaces the state machine instead of the row '
        'repainting itself', () async {
      // 403, not 409: a terminal row is a ForbiddenException, and its text
      // names the state in lower case. The list repaints the row from this
      // call, so a swallowed refusal would show "Withdrawn" against a row the
      // server still has as HIRED — and the recruiter would go on seeing them
      // in the pipeline.
      final api = _api(
        json: '{"statusCode":403,'
            '"message":"This application is already hired; cannot withdraw."}',
        status: 403,
      );

      await expectLater(
        ApplicationsRepository(_dio(api)).withdraw(9),
        throwsA(isA<ApplicationsException>().having(
          (e) => e.message,
          'message',
          'This application is already hired; cannot withdraw.',
        )),
      );
    });
  });

  group('skills', () {
    test('current skills are two hops: profile for the ids, catalogue for names',
        () async {
      // There is no GET /me/skills. The ids arrive nested under `candidate`,
      // and reading them off the top level instead yields an empty skills
      // section on a profile that has plenty — with no error anywhere.
      final api = _Api((o) => o.path == '/me/profile'
          ? const _Reply('{"candidate":{"skillIds":[3,9]}}')
          : const _Reply('{"hits":['
              '{"id":3,"slug":"dart","name":"Dart"},'
              '{"id":9,"slug":"flutter","name":"Flutter"}],"total":2}'));

      final skills = await SkillsRepository(_dio(api)).current();

      expect(api.calls, ['GET /me/profile', 'GET /v1/skills']);
      // One comma-joined param, not ?ids=3&ids=9: CatalogQueryDto reads `ids`
      // as a single string and splits it itself, so the repeated form fails
      // validation outright.
      expect(api.seen.last.queryParameters, {'ids': '3,9'});
      expect(skills.map((s) => s.name), ['Dart', 'Flutter']);
    });

    test('no skills means no lookup at all', () async {
      // `?ids=` empty does not mean "resolve nothing" — it fails the DTO's
      // min(1), and dropping the param turns the resolve into a LIST of the
      // whole skills table.
      final api = _api(json: '{"candidate":{"skillIds":[]}}');

      expect(await SkillsRepository(_dio(api)).current(), isEmpty);
      expect(api.calls, ['GET /me/profile']);
    });

    test('saving replaces the whole set — including replacing it with nothing',
        () async {
      final api = _api();
      await SkillsRepository(_dio(api))
          .save(skillIds: const [], customSkills: const []);

      expect(api.last.method, 'PATCH');
      expect(api.last.path, '/me/skills');
      expect(api.last.data, {'skillIds': [], 'customSkills': []});
      // Both keys still present once encoded — an empty list is the value here,
      // and it is the shape an encoder is most tempted to treat as nothing.
      expect(api.lastBody, '{"skillIds":[],"customSkills":[]}');

      // Omitting the empty lists would read as "no change" server-side, so
      // removing your last skill would look like it worked and then come back
      // on the next load.
    });

    test('free-text skills ride alongside the catalogue ids', () async {
      final api = _api();
      await SkillsRepository(_dio(api)).save(
        skillIds: const [3],
        customSkills: const ['Kotlin Multiplatform'],
      );

      expect(api.last.data, {
        'skillIds': [3],
        'customSkills': ['Kotlin Multiplatform'],
      });
    });
  });

  group('education and experience', () {
    test('the list is a bare array, not a page envelope', () async {
      // /me/education answers with a JSON array while /me/applications answers
      // with {hits,total,…}. Reading one as the other is an empty section and
      // no error at all.
      final api = _api(
        json: '[{"id":1,"institute":"IIT Bombay","degree":"B.Tech",'
            '"fieldOfStudy":"Computer Science","startYear":2018,'
            '"endYear":2022}]',
      );

      final rows = await EducationRepository(_dio(api)).list();

      expect(api.calls.single, 'GET /me/education');
      expect(rows.single.institute, 'IIT Bombay');
      expect(rows.single.ongoing, isFalse);
    });

    test('both sections are unversioned, with the id in the path on an edit',
        () async {
      final api = _api(
        json: '{"id":4,"institute":"IIT Bombay","degree":"B.Tech",'
            '"startYear":2018,"endYear":2022,"grade":"8.1 CGPA"}',
      );

      await EducationRepository(_dio(api)).update(4, const {'grade': '8.1 CGPA'});
      expect(api.calls.single, 'PATCH /me/education/4');

      await ExperienceRepository(_dio(api))
          .update(11, const {'title': 'Senior Engineer'});
      expect(api.last.path, '/me/experience/11');
    });

    test('an explicit null reaches the wire, so "still studying" can be set',
        () async {
      // endYear: null IS the value here — it means currently pursuing. A body
      // builder that stripped nulls the way it strips absent keys would leave
      // the old graduation year in place, and the row would go on claiming a
      // degree the candidate has not finished.
      final api = _api(
        json: '{"id":4,"institute":"IIT Bombay","degree":"B.Tech",'
            '"startYear":2021,"endYear":null}',
      );

      final item =
          await EducationRepository(_dio(api)).update(4, const {'endYear': null});

      // The encoded body, not `RequestOptions.data`: the repository forwards
      // the map it was handed, so checking that map only proves the caller's
      // own literal came back. What matters is that the key is still there
      // after JSON encoding, since a null is the one value that can vanish
      // silently and turn "clear this" into "leave it alone".
      expect(api.lastBody, '{"endYear":null}');
      expect(item.startYear, 2021);
      expect(item.ongoing, isTrue);
    });

    test('creating posts to the collection and returns the server row',
        () async {
      // The id only exists after the POST, so the screen has to render what
      // comes back rather than the body it sent.
      final api = _api(
        json: '{"id":12,"companyName":"Acme","title":"SDE",'
            '"startDate":"2024-01-01T00:00:00.000Z","isCurrent":true}',
      );

      final item = await ExperienceRepository(_dio(api)).create(const {
        'companyName': 'Acme',
        'title': 'SDE',
        'startDate': '2024-01-01',
        'isCurrent': true,
      });

      expect(api.calls.single, 'POST /me/experience');
      expect(item.id, 12);
      expect(item.isCurrent, isTrue);
    });

    test('deleting a row that is already gone is not an error in either section',
        () async {
      final api = _api(json: '{"message":"Not Found"}', status: 404);

      await EducationRepository(_dio(api)).remove(4);
      await ExperienceRepository(_dio(api)).remove(4);

      expect(api.calls, ['DELETE /me/education/4', 'DELETE /me/experience/4']);
    });
  });

  group('companies directory', () {
    test('the directory is versioned and sends only the filters that are set',
        () async {
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":20}');
      await CompaniesRepository(_dio(api)).list();

      expect(api.last.path, '/v1/companies');
      expect(api.last.queryParameters, {'page': 1});
    });

    test('the hiring filter is sent ONLY when on, as the literal "1"', () async {
      // The shared URL parser accepts '1' and 'true' and nothing else, so this
      // is the one spelling that means on — and leaving the param out is the
      // only spelling that means off.
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":20}');
      final repo = CompaniesRepository(_dio(api));

      await repo.list();
      expect(api.last.queryParameters.containsKey('hiring'), isFalse);

      await repo.list(
        hiring: true,
        category: 'information-technology',
        sort: 'rating',
      );
      expect(api.last.queryParameters, {
        'category': 'information-technology',
        'sort': 'rating',
        'hiring': '1',
        'page': 1,
      });
    });

    test('a blank category is dropped, not sent as an empty filter', () async {
      // Clearing the filter sheet hands back '' rather than null. Sending
      // `?category=` narrows to companies in an industry with no slug, i.e.
      // none, so the directory would come back empty for no visible reason.
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":20}');
      await CompaniesRepository(_dio(api)).list(category: '', sort: '');

      expect(api.last.queryParameters, {'page': 1});
    });

    test('an unknown handle reads as "not found", not as a raw server error',
        () async {
      final api = _api(json: '{"message":"Not Found"}', status: 404);

      await expectLater(
        CompaniesRepository(_dio(api)).profile('acme-overview-9'),
        throwsA(isA<CompaniesException>().having(
          (e) => e.message,
          'message',
          'Company not found.',
        )),
      );
      // The whole handle — slug AND trailing id — is the path segment.
      expect(api.last.path, '/v1/companies/acme-overview-9');
    });
  });

  group('career advice', () {
    test('the index is versioned and trims what was typed in the search box',
        () async {
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":12}');
      await ArticlesRepository(_dio(api))
          .list(q: '  resume tips  ', tag: 'resume');

      expect(api.last.path, '/v1/career-advice');
      expect(api.last.queryParameters, {
        'tag': 'resume',
        'q': 'resume tips',
        'page': 1,
      });
    });

    test('an all-whitespace search is no search at all', () async {
      final api = _api(json: '{"hits":[],"total":0,"page":1,"pageSize":12}');
      await ArticlesRepository(_dio(api)).list(q: '   ');

      expect(api.last.queryParameters, {'page': 1});
    });

    test('a missing article is named as such, and the slug is the whole path',
        () async {
      final api = _api(json: '{"message":"Not Found"}', status: 404);

      await expectLater(
        ArticlesRepository(_dio(api)).detail('how-to-write-a-resume'),
        throwsA(isA<ArticlesException>().having(
          (e) => e.message,
          'message',
          'Article not found.',
        )),
      );
      expect(api.last.path, '/v1/career-advice/how-to-write-a-resume');
    });

    test('related articles come from the first tag and exclude the article '
        'itself', () async {
      // There is no related-articles resource; this is derived from the index.
      // Forgetting to drop the current slug puts "you are reading this" at the
      // top of its own Read next list.
      final api = _api(
        json: '{"hits":['
            '{"slug":"a","title":"A","authorName":"X"},'
            '{"slug":"me","title":"Me","authorName":"X"},'
            '{"slug":"b","title":"B","authorName":"X"},'
            '{"slug":"c","title":"C","authorName":"X"},'
            '{"slug":"d","title":"D","authorName":"X"}],'
            '"total":5,"page":1,"pageSize":12}',
      );

      final related = await ArticlesRepository(_dio(api)).related(
        ArticleDetail.fromJson(const {
          'slug': 'me',
          'title': 'Me',
          'body': '# Me',
          'authorName': 'X',
          'tags': ['resume', 'interview'],
        }),
      );

      expect(api.last.queryParameters['tag'], 'resume');
      expect(related.map((a) => a.slug), ['a', 'b', 'c']);
    });

    test('a failed lookup hides the section instead of failing the article',
        () async {
      // Decoration below the fold. The article itself has already loaded, and
      // an error view over it would be a worse page than no Read next.
      final related = await ArticlesRepository(_dio(_dead())).related(
        ArticleDetail.fromJson(const {
          'slug': 'me',
          'title': 'Me',
          'body': '# Me',
          'authorName': 'X',
          'tags': ['resume'],
        }),
      );

      expect(related, isEmpty);
    });

    test('an untagged article makes no request at all', () async {
      final api = _dead();

      final related = await ArticlesRepository(_dio(api)).related(
        ArticleDetail.fromJson(const {
          'slug': 'me',
          'title': 'Me',
          'body': '# Me',
          'authorName': 'X',
        }),
      );

      expect(related, isEmpty);
      expect(api.seen, isEmpty, reason: 'no tag means nothing to query by');
    });
  });

  group('path versioning', () {
    test('the public composite is /v1/home; the private profile is /me/profile',
        () async {
      // The two halves of the API version differently and always have: the
      // public read models carry /v1, the older `me` controllers do not. This
      // pins one of each side by side, because the mistake is never noticing
      // that the rule is inconsistent.
      final home = _api(
        json: '{"counts":{"activeJobs":1200,"companies":80,"recruiters":45}}',
      );
      final feed = await HomeRepository(_dio(home)).load();

      expect(home.calls.single, 'GET /v1/home');
      expect(feed.counts.activeJobs, 1200);

      final profile = _api(
        json: '{"user":{"name":"Priya","email":"p@example.com",'
            '"emailVerified":true},'
            '"candidate":{"profileCompleteness":72,"skillIds":[1,2,3]},'
            '"educationCount":2,"experienceCount":1}',
      );
      final overview = await ProfileRepository(_dio(profile)).load();

      expect(profile.calls.single, 'GET /me/profile');
      expect(overview.completeness, 72);
      // skillCount is the LENGTH of skillIds, not a field of its own.
      expect(overview.skillCount, 3);
    });

    test('an unreachable server does not become an empty profile', () async {
      // ProfileOverview.fromJson({}) is a perfectly valid all-blank profile, so
      // a swallowed failure renders 0% completeness and no skills over a real
      // one — and the editor would then save that emptiness back.
      await expectLater(
        ProfileRepository(_dio(_dead())).load(),
        throwsA(isA<ProfileException>()),
      );
    });
  });
}
