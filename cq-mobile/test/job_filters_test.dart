import 'package:cq_mobile/features/alerts/data/alerts_repository.dart';
import 'package:cq_mobile/features/alerts/data/job_alert.dart';
import 'package:cq_mobile/features/catalogs/data/catalog_models.dart';
import 'package:cq_mobile/features/jobs/data/job_filters.dart';
import 'package:cq_mobile/features/jobs/data/jobs_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// `JobFilters` is the whole contract between the filter sheet and
/// `GET /v1/jobs`, and both DTOs on the far side are `.strict()`:
/// `ListJobsQueryDto` (apps/api/src/public-jobs/dto.ts) and `AlertQueryDto`
/// (apps/api/src/alerts/dto.ts) reject any key they do not name. So a facet
/// serialised under the wrong key does not degrade gracefully — it 400s the
/// entire search, or saves an alert that watches the wrong thing.
///
/// Three of these shapes are frozen by decisions taken outside this app and
/// must not be "tidied":
///
///  * repeatable facets go out as `skill=a&skill=b`. `skill[]=a` — dio's other
///    list format — arrives at the server as a key called `skill[]`, which the
///    strict DTO has never heard of;
///  * `emp` carries the enum spelling (`FULL_TIME`) but `mode` carries the URL
///    spelling (`on-site`, NOT `ONSITE`), because the website has published and
///    Google has indexed links in that form;
///  * salary is picked in LPA and travels in paise; experience is picked in
///    years and travels in years for the search but in MONTHS for an alert.
///
/// The failure mode is what makes this worth pinning: `parseSrpSearchParams`
/// DROPS an `emp`/`mode` value it does not recognise instead of erroring, so a
/// wrong spelling surfaces as "no jobs match" — indistinguishable from an
/// honestly empty result set, and invisible to the analyzer.

/// Every key `ListJobsQueryDto` accepts. It is `.strict()`, so a key outside
/// this set is a 400 on the whole search rather than an ignored param.
const _listJobsDtoKeys = {
  'q',
  'skill',
  'city',
  'industry',
  'expMin',
  'expMax',
  'salaryMin',
  'postedWithin',
  'sort',
  'page',
  'emp',
  'mode',
};

/// Every key `AlertQueryDto` accepts — also `.strict()`, and much narrower.
const _alertQueryDtoKeys = {
  'q',
  'skillSlugs',
  'citySlugs',
  'minExperienceMonths',
  'maxExperienceMonths',
  'salaryMin',
};

/// Resolves every request without a server and keeps the options, so the wire
/// form can be read back off `uri`.
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

// A baseUrl, unlike the sibling contract test: these assertions read
// `options.uri`, which needs an absolute URL before it will compose a query.
Dio _dio(_Recorder rec) =>
    Dio(BaseOptions(baseUrl: 'http://localhost'))..interceptors.add(rec);

CatalogItem _cat(String slug, String name, {int id = 1}) =>
    CatalogItem(id: id, slug: slug, name: name);

/// Every facet turned on at once — one skill list with two entries, so the
/// repeatable form is exercised, and one of everything else.
JobFilters _maximal() => JobFilters(
  skills: [_cat('flutter', 'Flutter'), _cat('dart', 'Dart', id: 2)],
  cities: [_cat('bengaluru', 'Bengaluru', id: 3)],
  industry: _cat('information-technology', 'Information Technology', id: 4),
  employmentTypes: const {'FULL_TIME', 'INTERN'},
  workModes: const {'on-site'},
  expMinYears: 2,
  expMaxYears: 5,
  minSalaryLpa: 15,
  postedWithin: 7,
);

/// Everything sent under [key], in order — exactly what the server reads with
/// `searchParams.getAll(key)`.
List<String> _all(RequestOptions o, String key) =>
    o.uri.queryParametersAll[key] ?? const [];

void main() {
  late _Recorder rec;
  late JobsRepository jobs;

  setUp(() {
    rec = _Recorder();
    jobs = JobsRepository(_dio(rec));
  });

  group('nothing selected sends nothing', () {
    test('a default filter set contributes no params at all', () {
      expect(const JobFilters().toQuery(), isEmpty);
      expect(const JobFilters().isEmpty, isTrue);
      expect(const JobFilters().activeCount, 0);
    });

    test('an unfiltered search carries only page and sort — no blank facets',
        () async {
      await jobs.search();

      // Not `skill=&city=&emp=`: an empty `industry` would fail the DTO's
      // `.min(1)` outright, and an empty `skill` would reach Elasticsearch as
      // a terms clause on the empty string and match nothing.
      expect(rec.requests.single.uri.queryParametersAll.keys.toSet(), {
        'page',
        'sort',
      });
    });

    test('a whitespace-only keyword is dropped rather than sent as q=', () async {
      await jobs.search(q: '   ');

      expect(_all(rec.requests.single, 'q'), isEmpty);
    });

    test('0 years is a real filter — freshers, not "unset"', () {
      // Guards against the tempting `if (expMinYears != null && x > 0)`, which
      // would silently drop the one filter a fresher actually wants.
      expect(const JobFilters(expMinYears: 0).toQuery(), {'expMin': 0});
    });
  });

  group('toQuery — the GET /v1/jobs wire form', () {
    test('repeatable facets go out as skill=a&skill=b, never skill[]=a',
        () async {
      await jobs.search(
        filters: JobFilters(
          skills: [_cat('flutter', 'Flutter'), _cat('dart', 'Dart', id: 2)],
          cities: [
            _cat('bengaluru', 'Bengaluru', id: 3),
            _cat('pune', 'Pune', id: 4),
          ],
        ),
      );

      final req = rec.requests.single;
      expect(_all(req, 'skill'), ['flutter', 'dart']);
      expect(_all(req, 'city'), ['bengaluru', 'pune']);
      // `skill[]` is not a key ListJobsQueryDto names, so the bracket form is
      // not "also fine" — it is a 400 for the whole search.
      expect(req.uri.query, isNot(contains('%5B')));
      expect(req.uri.queryParametersAll.keys, isNot(contains('skill[]')));
    });

    test('catalogue SLUGS travel, never catalogue ids', () async {
      await jobs.search(
        filters: JobFilters(skills: [_cat('react', 'React', id: 4242)]),
      );

      final req = rec.requests.single;
      expect(_all(req, 'skill'), ['react']);
      expect(req.uri.query, isNot(contains('4242')),
          reason: 'the SRP and the alert both key on slugs; ids are local');
    });

    test('emp uses the enum spelling the server maps 1:1', () async {
      await jobs.search(
        filters: const JobFilters(employmentTypes: {'FULL_TIME', 'INTERN'}),
      );

      expect(_all(rec.requests.single, 'emp'), ['FULL_TIME', 'INTERN']);
    });

    test('mode uses the frozen URL spelling on-site, NOT the enum ONSITE',
        () async {
      await jobs.search(
        filters: const JobFilters(workModes: {'on-site', 'remote'}),
      );

      expect(_all(rec.requests.single, 'mode'), ['on-site', 'remote']);

      // `toQuery` passes work modes straight through — nothing in this class
      // could turn `on-site` into `ONSITE`, so asserting that it doesn't would
      // assert nothing. The guard a wrong spelling actually trips is the chip
      // label map, which is keyed on the frozen URL spellings: an enum
      // spelling finds no label and the raw wire string surfaces in the chip
      // row, which is the only visible symptom the app gets —
      // parseSrpSearchParams drops the value server-side without a word.
      expect(const JobFilters(workModes: {'ONSITE'}).active.single.label,
          'ONSITE');
    });

    test('experience travels in YEARS — the server multiplies by 12', () async {
      await jobs.search(
        filters: const JobFilters(expMinYears: 2, expMaxYears: 5),
      );

      final req = rec.requests.single;
      expect(_all(req, 'expMin'), ['2']);
      expect(_all(req, 'expMax'), ['5']);
    });

    test('salary is picked in LPA and sent in paise', () async {
      await jobs.search(filters: const JobFilters(minSalaryLpa: 15));

      // 15 LPA = ₹15,00,000 = 150,000,000 paise, and the index stores paise.
      // A rupee value here would match every job in the country.
      expect(_all(rec.requests.single, 'salaryMin'), ['150000000']);
    });

    test('postedWithin sends the raw day count the DTO enumerates', () async {
      await jobs.search(filters: const JobFilters(postedWithin: 7));

      // The DTO is z.enum(['1','7','30']) over the *string* form, which is what
      // a query param always is. Anything else is dropped by the shared parser.
      expect(_all(rec.requests.single, 'postedWithin'), ['7']);
    });

    test('industry is a single slug, not a repeated key', () async {
      await jobs.search(
        filters: JobFilters(industry: _cat('fintech', 'Fintech')),
      );

      expect(_all(rec.requests.single, 'industry'), ['fintech']);
    });

    test('a maximal search sends every key the strict DTO names, and no other',
        () async {
      await jobs.search(q: 'flutter dev', filters: _maximal());

      final req = rec.requests.single;
      expect(_all(req, 'q'), ['flutter dev']);

      final keys = req.uri.queryParametersAll.keys.toSet();
      expect(keys.difference(_listJobsDtoKeys), isEmpty,
          reason: 'ListJobsQueryDto is .strict() — an unknown key 400s');
      expect(keys, _listJobsDtoKeys,
          reason: 'and every facet the sheet offers reached the wire');
    });
  });

  group('removing a facet', () {
    test('every active facet gets a human label — no wire spelling reaches the '
        'chip row', () {
      expect(_maximal().active.map((a) => a.label).toList(), [
        'Flutter',
        'Dart',
        'Bengaluru',
        'Information Technology',
        'Full-time',
        'Internship',
        'On-site',
        '2–5 yrs',
        '15+ LPA',
        'Last 7 days',
      ]);
    });

    test('CONTRACTOR reads as Contract, and a lone bound reads as a bound', () {
      const contract = JobFilters(employmentTypes: {'CONTRACTOR'});
      expect(contract.active.single.label, 'Contract');
      expect(const JobFilters(expMinYears: 3).active.single.label, '3+ yrs');
      expect(const JobFilters(expMaxYears: 3).active.single.label,
          'Up to 3 yrs');
    });

    test('dropping one skill chip leaves every other param untouched',
        () async {
      final full = _maximal();
      final withoutDart =
          full.active.firstWhere((a) => a.label == 'Dart').without;

      await jobs.search(filters: withoutDart);

      final req = rec.requests.single;
      expect(_all(req, 'skill'), ['flutter']);
      // The point of carrying a whole JobFilters on each chip: removing one
      // facet must not disturb the rest.
      expect(_all(req, 'city'), ['bengaluru']);
      expect(_all(req, 'emp'), ['FULL_TIME', 'INTERN']);
      expect(_all(req, 'mode'), ['on-site']);
      expect(_all(req, 'salaryMin'), ['150000000']);
      expect(_all(req, 'postedWithin'), ['7']);
    });

    test('experience is one chip and clears BOTH bounds', () {
      final cleared = _maximal()
          .active
          .firstWhere((a) => a.label == '2–5 yrs')
          .without;

      expect(cleared.expMinYears, isNull);
      expect(cleared.expMaxYears, isNull);
      expect(cleared.toQuery().containsKey('expMin'), isFalse);
      expect(cleared.toQuery().containsKey('expMax'), isFalse);
    });

    test('a cleared facet stops being sent — it is not sent as an empty value',
        () async {
      final noIndustry = _maximal()
          .active
          .firstWhere((a) => a.label == 'Information Technology')
          .without;
      // Emptying the LAST city goes through a different guard — `isNotEmpty`
      // on a list, not `!= null` on a nullable.
      final alsoNoCity =
          noIndustry.active.firstWhere((a) => a.label == 'Bengaluru').without;

      await jobs.search(filters: alsoNoCity);

      final keys = rec.requests.single.uri.queryParametersAll.keys;
      // `industry` is the load-bearing half: drop its guard and an empty slug
      // reaches the server as `industry=`, which fails the DTO's `.min(1)` and
      // 400s the whole search. Verified by mutation — removing the `!= null`
      // check turns this red.
      expect(keys, isNot(contains('industry')));
      // The list half is held up one layer down, not by JobFilters: dio omits
      // an empty list entirely, so removing the `isNotEmpty` guard does NOT
      // turn this red. Kept because it pins the assembled stack — a change of
      // listFormat, or a move off dio, is exactly when `city=` would start
      // reaching Elasticsearch as a terms clause on the empty string.
      expect(keys, isNot(contains('city')));
    });

    test('removing every chip in turn empties the query, one facet at a time',
        () {
      var f = _maximal();
      final counts = <int>[];
      while (!f.isEmpty) {
        counts.add(f.activeCount);
        f = f.active.first.without;
      }

      // Strictly descending by one: no chip removes two facets, and none
      // leaves a facet behind that the chip row can no longer reach.
      expect(counts, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(f.toQuery(), isEmpty);
    });

    test('copyWith needs the explicit clear flag — passing null keeps the value',
        () {
      final f = JobFilters(
        industry: _cat('fintech', 'Fintech'),
        minSalaryLpa: 10,
        postedWithin: 1,
      );

      // Named params cannot distinguish "null" from "omitted", so `null` here
      // is a no-op by design; only the flag clears.
      expect(f.copyWith().industry?.slug, 'fintech');
      expect(f.copyWith(clearIndustry: true).industry, isNull);
      expect(f.copyWith(clearSalary: true).minSalaryLpa, isNull);
      expect(f.copyWith(clearPostedWithin: true).postedWithin, isNull);
      expect(f.copyWith(clearSalary: true).industry?.slug, 'fintech');
    });

    test('chip removal matches on id even though CatalogItem identity is slug',
        () {
      // Deliberate deviation, pinned rather than fixed: `active` filters on
      // `x.id != s.id`, while `CatalogItem ==` is the slug. Today at most one
      // entry per list can carry the placeholder id 0 (the Home facet route
      // supplies a slug and a label but no id), so the two never disagree in
      // practice — this shows what happens the moment they do.
      //
      // This test pins a DEFECT, so it fails when the defect is repaired: the
      // fix is `x != s` in `JobFilters.active`, after which one tap removes
      // one chip and `.skills` below is `['dart']`. If that is why this went
      // red, update the expectation — do not revert the fix.
      final twoPlaceholders = JobFilters(
        skills: [_cat('flutter', 'Flutter', id: 0), _cat('dart', 'Dart', id: 0)],
      );

      expect(twoPlaceholders.active.first.without.skills, isEmpty);
    });
  });

  group('the alert built from a filter set', () {
    test('carries the same skills, cities, experience and salary', () {
      final q = _maximal().toAlertQuery('flutter dev');

      expect(q['q'], 'flutter dev');
      expect(q['skillSlugs'], ['flutter', 'dart']);
      expect(q['citySlugs'], ['bengaluru']);
      // Years on the search, MONTHS on the alert — the two DTOs disagree on
      // the unit and only this method reconciles them.
      expect(q['minExperienceMonths'], 24);
      expect(q['maxExperienceMonths'], 60);
      // Paise on both, same as the SRP.
      expect(q['salaryMin'], 150000000);
    });

    test('sends every key AlertQueryDto names and nothing it would reject', () {
      final keys = _maximal().toAlertQuery('flutter dev').keys.toSet();

      expect(keys.difference(_alertQueryDtoKeys), isEmpty,
          reason: 'AlertQueryDto is .strict() — an extra key 400s the save');
      // Asserted in both directions. A subset check alone stays green when a
      // supported facet quietly stops being carried into the alert, which is
      // the failure that costs the user matches rather than showing an error.
      expect(keys, _alertQueryDtoKeys);
    });

    test('industry, job type, work mode and date posted are dropped, and named',
        () {
      final f = _maximal();

      expect(f.toAlertQuery('x').containsKey('industry'), isFalse);
      expect(f.toAlertQuery('x').containsKey('emp'), isFalse);
      expect(f.toAlertQuery('x').containsKey('mode'), isFalse);
      expect(f.toAlertQuery('x').containsKey('postedWithin'), isFalse);
      // The sheet reads this list out loud, so the user is told the alert is
      // narrower than the search rather than discovering it from the results.
      expect(f.unsupportedForAlert,
          ['industry', 'job type', 'work mode', 'date posted']);
    });

    test('nothing is claimed as unsupported when nothing unsupported is on', () {
      final searchOnly = JobFilters(
        skills: [_cat('go', 'Go')],
        minSalaryLpa: 8,
      );

      expect(searchOnly.unsupportedForAlert, isEmpty);
    });

    test('skills cap at 20 and cities at 10 — the DTO array maxima', () {
      final f = JobFilters(
        skills: [for (var i = 0; i < 25; i++) _cat('skill-$i', 'Skill $i', id: i)],
        cities: [for (var i = 0; i < 14; i++) _cat('city-$i', 'City $i', id: i)],
      );

      final q = f.toAlertQuery('');
      expect((q['skillSlugs'] as List).length, 20);
      expect((q['citySlugs'] as List).length, 10);
      // The search itself has no such cap, so the two intentionally diverge.
      expect((f.toQuery()['skill'] as List).length, 25);
    });

    test('an empty search produces an empty alert query, so the UI can refuse',
        () {
      // The screen keys "Add a keyword or a filter first" off exactly this.
      expect(const JobFilters().toAlertQuery('   '), isEmpty);
      expect(const JobFilters().toAlertQuery(''), isEmpty);
    });

    test('the keyword is trimmed, not passed through with its padding', () {
      expect(const JobFilters().toAlertQuery('  flutter  ')['q'], 'flutter');
    });

    test('the saved query reads back through JobAlert with the same values',
        () {
      final alert = JobAlert.fromJson({
        'id': 3,
        'name': 'Flutter in Bengaluru',
        'frequency': 'daily',
        'isActive': true,
        'query': _maximal().toAlertQuery('flutter dev'),
      });

      // Round-trip through the model the alerts list actually renders: the
      // editor reopens an alert from these getters, so a unit mismatch here
      // would show the user a different search from the one they saved.
      expect(alert.keywords, 'flutter dev');
      expect(alert.skillSlugs, ['flutter', 'dart']);
      expect(alert.citySlugs, ['bengaluru']);
      expect(alert.minExperienceMonths, 24);
      expect(alert.maxExperienceMonths, 60);
      expect(alert.salaryMinPaise, 150000000);
    });

    test('POST /me/alerts nests the query untouched under the alert body',
        () async {
      final alerts = AlertsRepository(_dio(rec));
      final query = _maximal().toAlertQuery('flutter dev');

      await alerts.create(
        name: 'Flutter in Bengaluru',
        frequency: 'daily',
        query: query,
      );

      final req = rec.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/me/alerts');
      final body = req.data as Map<String, dynamic>;
      expect(body.keys.toSet(), {'name', 'frequency', 'query', 'isActive'});
      // Written out rather than compared against `query`: `create` puts the
      // caller's map into the body by reference, so `expect(body['query'],
      // query)` compares an object with itself and would stay green if the
      // repository thinned the map out or re-encoded it on the way through.
      expect(body['query'], {
        'q': 'flutter dev',
        'skillSlugs': ['flutter', 'dart'],
        'citySlugs': ['bengaluru'],
        'minExperienceMonths': 24,
        'maxExperienceMonths': 60,
        'salaryMin': 150000000,
      }, reason: 'AlertCreateDto nests the query — a flattened body is a 400');
    });

    test('an inverted experience range is passed through as-is', () {
      // Pinned, not fixed. The two dropdowns in the filter sheet are
      // independent, so Min 10 / Max 1 is three taps away. ListJobsQueryDto has
      // no cross-field rule, so the SEARCH accepts it and returns nothing —
      // but AlertQueryDto `.refine()`s minExperienceMonths <= max, so saving
      // that same search as an alert 400s with a raw Zod message.
      const inverted = JobFilters(expMinYears: 10, expMaxYears: 1);
      final q = inverted.toAlertQuery('');

      expect(q['minExperienceMonths'], 120);
      expect(q['maxExperienceMonths'], 12);
      expect(q['minExperienceMonths'] as int,
          greaterThan(q['maxExperienceMonths'] as int));
    });

    test('a long keyword is trimmed but never truncated', () {
      // Both DTOs cap `q` at 200 characters and the search field has no
      // maxLength, so this is pinned as current behaviour rather than asserted
      // as correct.
      final long = 'a' * 250;

      expect((const JobFilters().toAlertQuery(long)['q'] as String).length, 250);
    });
  });
}
