import 'dart:async';

import 'package:cq_mobile/core/config/app_config.dart';
import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/companies/presentation/companies_screen.dart';
import 'package:cq_mobile/features/companies/presentation/company_detail_screen.dart';
import 'package:cq_mobile/shared/widgets/cq_chips.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// The directory and the company profile are the only route in this app from a
/// seeker to an employer that does not start at a job ad, and between them they
/// were the largest surface with no test on it at all.
///
/// Four failures already in this codebase's history are all reachable from
/// these two screens:
///
///  * **A refresh that fails erases what loaded.** Both screens catch into an
///    `_error` field, and `_error` paints a full-screen error view. That is
///    right for a first load and wrong for a refresh — and the directory is
///    exactly where a commuting seeker pulls. core/ui/refresh_failure.dart
///    holds the shared rule; the directory routes through it and nothing
///    pinned that it still does, so the next person to touch that catch block
///    can quietly put the old behaviour back.
///  * **A shared link that 404s.** The website parses a company permalink as
///    `<slug>-overview-<id>`; a bare slug fails `parseCompanySlug` outright.
///    The profile assembles that string by hand, so losing the id is one
///    keystroke, and the only person who finds out is whoever was sent the
///    link.
///  * **A filter sent under the wrong name.** The industry chip holds a
///    catalogue item carrying both a display name and a slug, and the server
///    resolves only the slug — silently. Send the name and the directory comes
///    back unfiltered, which on screen is indistinguishable from a filter that
///    simply matched everything.
///  * **A count that contradicts itself.** `openings` is a server-capped sample
///    of at most ten; `activeJobs` is the real number. Counting the sample made
///    a company with 43 live roles read "43 open roles" in its facts row and
///    "Open roles (10)" six lines below it.
///
/// What is asserted here is what the seeker sees and what the server is asked
/// for. The wire contract underneath — the `/v1` prefix, `hiring` as the
/// literal "1", the 404 wording — is pinned in repositories_contract_test.dart
/// and is not repeated.

// ── Fixtures ────────────────────────────────────────────────────────────────

/// The handle the server serves Acme under, deliberately NOT the
/// `<slug>-overview-<id>` the app could compose from the same row. A fixture
/// where those two agree cannot tell a screen that follows the server's
/// permalink from one that re-invents the rule — both push the same path — and
/// the whole point of a `handle` field is that the website owns that rule.
const _acmeHandle = 'acme-corporation-overview-7';

/// What `<slug>-overview-<id>` composes to for the same company: the permalink
/// the share action builds by hand.
const _acmeDerivedPermalink = 'acme-corp-overview-7';

const _openingSlug = 'flutter-engineer-acme-42';

/// The related company's handle disagrees with the one the app would derive
/// from its slug and id (`nimbus-labs-pvt-overview-31`), which is the only way
/// to see whether the server's handle is being followed or re-invented.
const _relatedHandle = 'nimbus-labs-overview-31';

/// Page 1 of 3 — 45 companies at 20 a page. Bluewave carries neither a rating
/// nor a plural role count, so the optional halves of the card are exercised
/// alongside the full one.
const _directoryPage1 =
    '{"hits":['
    '{"id":7,"name":"Acme Corp","slug":"acme-corp","handle":"$_acmeHandle",'
    '"industryName":"Information Technology","hqCityName":"Pune",'
    '"averageRating":4.4,"reviewCount":2840,"openingsCount":3},'
    '{"id":11,"name":"Bluewave Logistics","slug":"bluewave",'
    '"handle":"bluewave-overview-11","industryName":"Logistics",'
    '"hqCityName":"Surat","openingsCount":1}'
    '],"total":45,"page":1,"pageSize":20}';

/// Page 2 shares no company with page 1, so "the next page arrived" is
/// observable rather than assumed.
const _directoryPage2 =
    '{"hits":[{"id":19,"name":"Cygnet Systems","slug":"cygnet",'
    '"handle":"cygnet-overview-19","industryName":"Information Technology",'
    '"hqCityName":"Hyderabad","openingsCount":2}],'
    '"total":45,"page":2,"pageSize":20}';

const _emptyDirectory = '{"hits":[],"total":0,"page":1,"pageSize":20}';

const _industries =
    '{"hits":['
    '{"id":3,"slug":"information-technology","name":"Information Technology"},'
    '{"id":9,"slug":"logistics","name":"Logistics"}'
    '],"total":2,"page":1,"pageSize":30}';

/// One company with every section of the profile populated, so a section that
/// stops rendering fails an assertion instead of leaving a gap nobody reads.
///
/// [activeJobs] is what the server says the company really has open; the
/// `openings` sample below is always two.
String _profile({
  int activeJobs = 43,
  String websiteUrl = 'https://www.acme.com/careers',
}) =>
    '{"id":7,"name":"Acme Corp","slug":"acme-corp","handle":"$_acmeHandle",'
    '"description":"We build payments infrastructure for India.",'
    '"websiteUrl":"$websiteUrl","companyType":"FOREIGN_MNC",'
    '"industryName":"Information Technology","hqCityName":"Pune",'
    '"employeeCount":"5,000+","foundedYear":2004,'
    '"averageRating":4.4,"reviewCount":2840,"activeJobs":$activeJobs,'
    '"isVerified":true,'
    '"highlights":[{"heading":"Four-day release train",'
    '"body":"Every team ships on Thursday."}],'
    '"openings":['
    '{"id":42,"title":"Flutter Engineer","canonicalSlug":"$_openingSlug",'
    '"primaryCityName":"Pune","postedAt":"2026-08-01T09:00:00.000Z"},'
    '{"id":43,"title":"Backend Engineer",'
    '"canonicalSlug":"backend-engineer-acme-43",'
    '"primaryCityName":"Bengaluru"}'
    '],'
    '"reviews":[{"id":5,"rating":4,"title":"Fast, and honest about it",'
    '"body":"Real ownership, and nobody pretends the legacy is not there.",'
    '"isVerified":true,"createdAt":"2026-05-02T09:00:00.000Z",'
    '"authorName":"Asha N."}],'
    '"relatedCompanies":[{"id":31,"slug":"nimbus-labs-pvt",'
    '"name":"Nimbus Labs","handle":"$_relatedHandle",'
    '"averageRating":4.1,"openRoles":6}]}';

// ── The server ──────────────────────────────────────────────────────────────

/// One canned HTTP answer. A status >= 400 makes Dio raise the same
/// `DioException`, body attached, that the repository catches in production.
class _Reply {
  const _Reply(this.json, {this.status = 200});

  final String json;
  final int status;
}

/// Returning null means the request never answers — a screen still mid-load.
typedef _Script = _Reply? Function(RequestOptions options);

/// The API, scripted per request and recorded, so a test can ask both what the
/// seeker saw and what the server was asked for.
///
/// [script] is swappable mid-test: a directory that loads and only then stops
/// loading is the only way to reach the refresh path at all.
class _Api implements HttpClientAdapter {
  _Api(this.script);

  _Script script;

  final List<RequestOptions> seen = [];

  List<RequestOptions> to(String path) =>
      seen.where((o) => o.path == path).toList(growable: false);

  /// The filters and page the directory was last asked for.
  Map<String, dynamic> get lastQuery => to('/v1/companies').last.queryParameters;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    final reply = script(options);
    // A Completer rather than a long delay: a pending timer fails the test at
    // teardown, and there is nothing here to wait for.
    if (reply == null) return Completer<ResponseBody>().future;
    return ResponseBody.fromString(
      reply.json,
      reply.status,
      // Without the content-type Dio hands the repository a String and every
      // fromJson in company_models.dart silently reads an empty map.
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// A healthy API for both screens: the directory paged, one full profile, and
/// the industry catalogue the filter chip opens.
_Script _live({String directory = _directoryPage1, String? profile}) {
  final body = profile ?? _profile();
  return (o) {
    if (o.path == '/v1/companies') {
      return _Reply(
        o.queryParameters['page'] == 2 ? _directoryPage2 : directory,
      );
    }
    if (o.path == '/v1/companies/$_acmeHandle') return _Reply(body);
    if (o.path == '/v1/industries') return const _Reply(_industries);
    // Any other company resolves to a bare shell: the tests that follow a tap
    // onto a second profile are about the path that was asked for, not about
    // what came back down it.
    return const _Reply('{}');
  };
}

/// A phone with no signal.
_Reply? _noSignal(RequestOptions options) => throw DioException.connectionError(
  requestOptions: options,
  reason: 'no network',
);

/// A server that accepts the request and never answers it.
_Reply? _silence(RequestOptions options) => null;

// ── Harness ─────────────────────────────────────────────────────────────────

const _phone = Size(390, 844);

/// Tall enough that the whole profile — header, facts, about, highlights,
/// openings, reviews, similar companies — lays out in one pass. A ListView only
/// builds what it can show, so on a phone-sized viewport half these assertions
/// would be testing the scroll position rather than the screen.
const _tallPhone = Size(390, 2200);

/// Mounts the two real screens under a real router and returns it, so a test
/// can ask where a tap actually sent the seeker.
///
/// Overriding `dioProvider` alone reaches the whole data layer — every
/// repository is a `FutureProvider` built from it — and keeps `cookieJarProvider`,
/// and so path_provider, out of the graph.
Future<GoRouter> _open(
  WidgetTester tester,
  _Api api, {
  required String at,
  Size size = _phone,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  final router = GoRouter(
    initialLocation: at,
    routes: [
      GoRoute(path: '/companies', builder: (_, _) => const CompaniesScreen()),
      GoRoute(
        path: '/company/:handle',
        builder: (_, state) =>
            CompanyDetailScreen(handle: state.pathParameters['handle']!),
      ),
      // A stand-in for the job screen. This file is about where a tap goes;
      // mounting the real one would drag the whole job API in behind it.
      GoRoute(
        path: '/job/:slug',
        builder: (_, _) => const Scaffold(body: Center(child: Text('job'))),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp.router(theme: CqTheme.light, routerConfig: router),
    ),
  );
  await _pumpFrames(tester);
  return router;
}

/// Advances a handful of frames so the load chain (provider → repository →
/// request → setState) lands, plus any route or sheet animation on the way.
///
/// `pumpAndSettle` is not an option: CqLoader's brand animation repeats
/// forever, so settling on a screen that is still loading never returns — and
/// "still loading" is one of the states under test.
Future<void> _pumpFrames(WidgetTester tester, [int frames = 14]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Drags the directory far enough to arm its RefreshIndicator, then lets go.
Future<void> _pullToRefresh(WidgetTester tester) async {
  // Target the scrollable the RefreshIndicator actually wraps: the first
  // Scrollable in this tree is the horizontal filter-chip row, and flinging
  // that refreshes nothing while still leaving the test green.
  final scrollable = find.descendant(
    of: find.byType(RefreshIndicator),
    matching: find.byType(Scrollable),
  );
  await tester.fling(scrollable.first, const Offset(0, 320), 1000);
  await _pumpFrames(tester, 20);
}

/// Opens the industry chip's picker and chooses Information Technology.
Future<void> _chooseIndustry(WidgetTester tester) async {
  await tester.tap(find.text('Industry'));
  await _pumpFrames(tester, 20);
  await tester.tap(find.text('Information Technology'));
  await _pumpFrames(tester, 20);
}

const _shareChannel = MethodChannel('dev.fluttercommunity.plus/share');
const _launchChannel = MethodChannel('plugins.flutter.io/url_launcher');

/// Intercepts the OS share sheet and collects what the app handed it.
///
/// share_plus reaches the platform down this channel; with no handler
/// registered the call throws MissingPluginException from inside the button's
/// own callback, which is a broken test rather than a captured payload.
List<Map<Object?, Object?>> _captureShares() {
  final shared = <Map<Object?, Object?>>[];
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(_shareChannel, (call) async {
    shared.add(call.arguments as Map<Object?, Object?>);
    return null;
  });
  addTearDown(() => messenger.setMockMethodCallHandler(_shareChannel, null));
  return shared;
}

/// A phone where no installed app will open a web link — `launch` answers
/// false, exactly as it does on a device with no browser.
void _noBrowser() {
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(_launchChannel, (_) async => false);
  addTearDown(() => messenger.setMockMethodCallHandler(_launchChannel, null));
}

void main() {
  group('the directory', () {
    testWidgets('says it is working, and only after it has asked the server', (
      tester,
    ) async {
      final api = _Api(_silence);
      await _open(tester, api, at: '/companies');

      // Ordered first on purpose: `_loading` is a field initialiser, so the
      // loading line is already on screen one frame after mount even if
      // initState never issued a request. A spinner over a request that was
      // never sent is the forever-spinner this assertion exists to catch.
      expect(
        api.to('/v1/companies'),
        isNotEmpty,
        reason: 'the directory showed a loader without asking the server for '
            'anything',
      );
      expect(find.text('Loading companies…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('renders the companies the server sent', (tester) async {
      await _open(tester, _Api(_live()), at: '/companies');

      expect(find.text('Loading companies…'), findsNothing);
      expect(find.text('Acme Corp'), findsOneWidget);
      expect(find.text('Bluewave Logistics'), findsOneWidget);
      expect(find.text('Information Technology  ·  Pune'), findsOneWidget);
      // 2840 reviews, shown the Indian way round.
      expect(find.text('4.4'), findsOneWidget);
      expect(find.text('(2.8k)'), findsOneWidget);
      // Both halves of the plural, because "1 open roles" on a card is the sort
      // of thing that survives review for months.
      expect(find.text('3 open roles'), findsOneWidget);
      expect(find.text('1 open role'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a first load that fails offers a retry that works', (
      tester,
    ) async {
      final api = _Api(_noSignal);
      await _open(tester, api, at: '/companies');

      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(
        find.text('Try again'),
        findsOneWidget,
        reason: 'a failure with no retry strands the seeker on a screen they '
            'cannot leave without killing the app',
      );

      api.script = _live();
      await tester.tap(find.text('Try again'));
      await _pumpFrames(tester);

      expect(find.text('Acme Corp'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_rounded), findsNothing);
    });

    testWidgets('an empty directory does not blame a filter nobody set', (
      tester,
    ) async {
      await _open(
        tester,
        _Api(_live(directory: _emptyDirectory)),
        at: '/companies',
      );

      expect(find.text('No companies found'), findsOneWidget);
      expect(
        find.text('Check back later.'),
        findsOneWidget,
        reason: 'no filter is on, so telling the seeker to remove one sends '
            'them looking for something that is not there',
      );
    });

    testWidgets('an empty filtered directory points at the filter', (
      tester,
    ) async {
      await _open(
        tester,
        _Api(_live(directory: _emptyDirectory)),
        at: '/companies',
      );
      await tester.tap(find.text('Hiring now'));
      await _pumpFrames(tester);

      expect(find.text('No companies found'), findsOneWidget);
      expect(find.text('Try removing a filter.'), findsOneWidget);
    });

    testWidgets('the hiring chip is sent only while it is on', (tester) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      expect(api.lastQuery.containsKey('hiring'), isFalse);

      await tester.tap(find.text('Hiring now'));
      await _pumpFrames(tester);
      expect(api.lastQuery['hiring'], '1');

      await tester.tap(find.text('Hiring now'));
      await _pumpFrames(tester);
      expect(
        api.lastQuery.containsKey('hiring'),
        isFalse,
        reason: 'the server tests the raw param for truthiness, so "0" or '
            '"false" would still narrow the directory to companies that are '
            'hiring — leaving it out is the only way to mean off',
      );
    });

    testWidgets('the industry filter travels as the slug, not the label', (
      tester,
    ) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      await _chooseIndustry(tester);

      expect(
        api.lastQuery['category'],
        'information-technology',
        reason: 'the server resolves the industry SLUG and ignores anything '
            'else without complaining, so sending the display name returns '
            'the unfiltered directory and reads as a filter that matched '
            'everything',
      );
      // Scoped to the chip: a company subtitle is a joined 'industry  ·  city'
      // string today, but a fixture that ever renders the industry on its own
      // would satisfy a bare text finder while the chip still read 'Industry'.
      expect(
        find.descendant(
          of: find.byType(CqChip),
          matching: find.text('Information Technology'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('clearing the industry chip drops the filter', (tester) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');
      await _chooseIndustry(tester);

      await tester.tap(find.text('Information Technology'));
      await _pumpFrames(tester);

      expect(
        api.lastQuery.containsKey('category'),
        isFalse,
        reason: 'the chip reads as cleared while the directory is still '
            'narrowed to one industry',
      );
      expect(find.text('Industry'), findsOneWidget);
    });

    testWidgets('paging forward asks for the next page and says where the '
        'seeker is', (tester) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      expect(find.text('Page 1 of 3'), findsOneWidget);

      await tester.tap(find.byTooltip('Next page'));
      await _pumpFrames(tester);

      expect(api.lastQuery['page'], 2);
      expect(find.text('Cygnet Systems'), findsOneWidget);
      expect(find.text('Acme Corp'), findsNothing);
      expect(find.text('Page 2 of 3'), findsOneWidget);
    });

    testWidgets('re-sorting starts again from the first page', (tester) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');
      await tester.tap(find.byTooltip('Next page'));
      await _pumpFrames(tester);
      expect(find.text('Page 2 of 3'), findsOneWidget);

      await tester.tap(find.byTooltip('Sort'));
      await _pumpFrames(tester);
      await tester.tap(find.text('Name (A–Z)'));
      await _pumpFrames(tester);

      expect(api.lastQuery['sort'], 'name');
      expect(
        api.lastQuery['page'],
        1,
        reason: 'a re-sorted directory that stayed on page 2 drops the seeker '
            'into the middle of an order they have not seen the top of',
      );
    });

    testWidgets('a refresh still in flight keeps the results on screen', (
      tester,
    ) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      // The ordinary case rather than the failure below: the server takes the
      // pull and is slow about it. `_load` guards its loading flag with
      // `if (_page == null)` for exactly this, and nothing else here would
      // notice if that guard went away — by the time the failure tests assert,
      // the request has already finished and the flag is back down.
      api.script = _silence;
      await _pullToRefresh(tester);

      expect(api.to('/v1/companies'), hasLength(greaterThan(1)));
      expect(
        find.text('Loading companies…'),
        findsNothing,
        reason: 'the refresh swapped the results for a full-screen spinner, so '
            'asking for something newer costs the seeker what they already '
            'had for as long as the request runs',
      );
      expect(find.text('Acme Corp'), findsOneWidget);
    });

    testWidgets('a failed refresh keeps the directory and says what happened', (
      tester,
    ) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');
      expect(
        find.text('Acme Corp'),
        findsOneWidget,
        reason: 'the test needs a loaded directory before it can test losing '
            'it',
      );

      api.script = _noSignal;
      await _pullToRefresh(tester);

      // Without this the rest of the test is satisfied by a fling that armed
      // nothing: an untouched screen also still has Acme on it.
      expect(
        api.to('/v1/companies'),
        hasLength(greaterThan(1)),
        reason: 'the pull never reached the RefreshIndicator, so nothing was '
            'refreshed and nothing below is being tested',
      );
      expect(
        find.text('Acme Corp'),
        findsOneWidget,
        reason: 'pulling to refresh in a tunnel threw away the directory the '
            'seeker already had, and the way back was another successful '
            'request they were in no position to make',
      );
      expect(find.byIcon(Icons.cloud_off_rounded), findsNothing);
      expect(
        find.byType(SnackBar),
        findsOneWidget,
        reason: 'silence after a pull reads as a refresh that worked',
      );
    });

    testWidgets('a page that never arrives leaves the seeker where they were', (
      tester,
    ) async {
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      api.script = _noSignal;
      await tester.tap(find.byTooltip('Next page'));
      await _pumpFrames(tester);

      expect(find.text('Acme Corp'), findsOneWidget);
      expect(
        find.text('Page 1 of 3'),
        findsOneWidget,
        reason: 'the pager claimed a page whose contents never arrived',
      );
      expect(find.byType(SnackBar), findsOneWidget);
    });

    testWidgets('a filter that fails to load puts its chip back', (tester) async {
      // `_hiringOnly` flips before the request goes out so the chip responds
      // instantly, and a failed request keeps the results already on screen.
      // Both are right on their own; together they used to leave the chip
      // reading as ON above a list that was never filtered by it. The filter is
      // now reverted when the results it promised never arrive, so the chip and
      // the list always describe the same thing.
      final api = _Api(_live());
      await _open(tester, api, at: '/companies');

      api.script = _noSignal;
      await tester.tap(find.text('Hiring now'));
      await _pumpFrames(tester);

      expect(find.byType(SnackBar), findsOneWidget);
      expect(
        find.text('Bluewave Logistics'),
        findsOneWidget,
        reason: 'keeping the old list is the shared rule; only the chip state '
            'is wrong here',
      );
      final chip = tester.widget<CqChip>(
        find.ancestor(of: find.text('Hiring now'), matching: find.byType(CqChip)),
      );
      expect(chip.selected, isFalse,
          reason: 'the chip must not claim a filter the list never had');
    });

    testWidgets('a card opens the profile under the handle the server gave it',
        (tester) async {
      final api = _Api(_live());
      final router = await _open(tester, api, at: '/companies');

      await tester.tap(find.text('Acme Corp'));
      await _pumpFrames(tester, 20);

      expect(router.state.uri.toString(), '/company/$_acmeHandle');
      expect(
        api.to('/v1/companies/$_acmeHandle'),
        isNotEmpty,
        reason: 'the profile was fetched under something other than the '
            'handle the directory sent — a slug with the trailing id dropped '
            'is a 404',
      );
    });
  });

  group('the profile', () {
    testWidgets('says it is working, and only after it has asked the server', (
      tester,
    ) async {
      final api = _Api(_silence);
      await _open(tester, api, at: '/company/$_acmeHandle');

      expect(api.to('/v1/companies/$_acmeHandle'), isNotEmpty);
      expect(find.text('Loading company…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('renders the company the server sent', (tester) async {
      await _open(
        tester,
        _Api(_live()),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      expect(find.text('Loading company…'), findsNothing);
      // Twice: the app bar title and the header. A profile whose name reached
      // only one of them is a screen that says "Company" at the top.
      expect(find.text('Acme Corp'), findsNWidgets(2));
      expect(find.text('Information Technology  ·  Pune'), findsOneWidget);
      expect(find.text('4.4'), findsOneWidget);

      // Quick facts. The type is the label, not the enum the API stores it as —
      // 'FOREIGN_MNC' on a seeker's screen is a leaked database value.
      expect(find.text('Foreign MNC'), findsOneWidget);
      expect(find.text('5,000+ employees'), findsOneWidget);
      expect(find.text('Founded 2004'), findsOneWidget);
      expect(find.text('43 open roles'), findsOneWidget);
      expect(find.text('acme.com'), findsOneWidget);

      expect(
        find.text('We build payments infrastructure for India.'),
        findsOneWidget,
      );
      expect(find.text('Four-day release train'), findsOneWidget);
      expect(find.text('Fast, and honest about it'), findsOneWidget);
      expect(find.text('Asha N.'), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);
      expect(find.text('Nimbus Labs'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the openings list counts the real openings, not the sample', (
      tester,
    ) async {
      await _open(
        tester,
        _Api(_live()),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      expect(find.text('Flutter Engineer'), findsOneWidget);
      expect(find.text('Backend Engineer'), findsOneWidget);
      expect(
        find.text('Open roles (43)'),
        findsOneWidget,
        reason: 'the heading counted the ten-row sample the server sends, '
            'contradicting the facts row six lines above it',
      );
      expect(
        find.text('Showing 2 of 43.'),
        findsOneWidget,
        reason: 'a two-row list under a heading that says 43 needs to say why',
      );
    });

    testWidgets('a company whose sample is the whole list says nothing extra', (
      tester,
    ) async {
      // The counterpart matters: "Showing 2 of 2." is noise, and it is the
      // reading a `>=` in place of `>` would produce.
      await _open(
        tester,
        _Api(_live(profile: _profile(activeJobs: 2))),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      expect(find.text('Open roles (2)'), findsOneWidget);
      expect(find.textContaining('Showing'), findsNothing);
    });

    testWidgets('sharing hands over the canonical website permalink', (
      tester,
    ) async {
      final shared = _captureShares();
      await _open(
        tester,
        _Api(_live()),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      await tester.tap(find.byTooltip('Share'));
      await _pumpFrames(tester);

      expect(shared, hasLength(1));
      final text = shared.single['text'] as String;
      expect(
        text,
        contains('${AppConfig.webBaseUrl}/company/$_acmeDerivedPermalink'),
        reason: 'the website parses a company permalink as '
            '<slug>-overview-<id>; a bare slug fails parseCompanySlug and the '
            'recipient of the link gets a 404',
      );
      // Current behaviour, documented rather than endorsed. The route this
      // screen was opened on IS the server's own permalink, and the payload
      // repeats it in `handle` — RelatedCompany deliberately prefers that one
      // "so the app isn't the second owner of the URL rule". The share action
      // composes its own instead, so a company the website has since re-slugged
      // gets shared under the spelling the app guessed. Reported, not fixed —
      // the fix belongs in lib/.
      expect(text, isNot(contains(_acmeHandle)));
      // The recipient needs to know whose page they are being sent to before
      // they open it.
      expect(text, contains('Acme Corp'));
      expect(shared.single['subject'], 'Acme Corp');
    });

    testWidgets('there is nothing to share before anything has loaded', (
      tester,
    ) async {
      await _open(tester, _Api(_noSignal), at: '/company/$_acmeHandle');

      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(
        find.byTooltip('Share'),
        findsNothing,
        reason: 'a share action over a company that never loaded can only '
            'send a link built from nothing',
      );
    });

    testWidgets('a failed load offers a retry that works', (tester) async {
      final api = _Api(_noSignal);
      await _open(
        tester,
        api,
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      expect(find.text('Try again'), findsOneWidget);

      api.script = _live();
      await tester.tap(find.text('Try again'));
      await _pumpFrames(tester);

      expect(find.text('Acme Corp'), findsNWidgets(2));
      expect(find.text('Open roles (43)'), findsOneWidget);
    });

    testWidgets('a handle the server does not know says so in words', (
      tester,
    ) async {
      // A stale link off a search engine or a shared message lands here, and
      // "Can't reach the server" would send the seeker to check their signal
      // over a company that has simply been taken down.
      await _open(
        tester,
        _Api((_) => const _Reply('{"message":"Not Found"}', status: 404)),
        at: '/company/$_acmeHandle',
      );

      expect(find.text('Company not found.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });

    testWidgets('an opening opens that job', (tester) async {
      final router = await _open(
        tester,
        _Api(_live()),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      await tester.tap(find.text('Flutter Engineer'));
      await _pumpFrames(tester, 20);

      expect(router.state.uri.toString(), '/job/$_openingSlug');
    });

    testWidgets('a similar company opens under the handle the server gave it', (
      tester,
    ) async {
      final api = _Api(_live());
      final router = await _open(
        tester,
        api,
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      await tester.tap(find.text('Nimbus Labs'));
      await _pumpFrames(tester, 20);

      expect(
        router.state.uri.toString(),
        '/company/$_relatedHandle',
        reason: 'the app rebuilt the permalink from the slug and id instead of '
            'following the handle the server sent, so it now owns a URL rule '
            'the website is free to change',
      );
      expect(api.to('/v1/companies/$_relatedHandle'), isNotEmpty);
    });

    testWidgets('a website URL that is not a web address is not offered', (
      tester,
    ) async {
      // Company websites are recruiter-supplied and the API validates them with
      // Zod's .url(), which accepts javascript:, data: and intent: alike. A
      // chip that renders and then refuses to work is worse than no chip.
      await _open(
        tester,
        _Api(_live(profile: _profile(websiteUrl: 'javascript:alert(1)'))),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      expect(find.byIcon(Icons.open_in_new_rounded), findsNothing);
      // The rest of the profile still renders — one bad field is not a broken
      // page.
      expect(find.text('Foreign MNC'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a link the phone cannot open says so instead of doing '
        'nothing', (tester) async {
      _noBrowser();
      await _open(
        tester,
        _Api(_live()),
        at: '/company/$_acmeHandle',
        size: _tallPhone,
      );

      await tester.tap(find.text('acme.com'));
      await _pumpFrames(tester);

      expect(
        find.text('Could not open this link'),
        findsOneWidget,
        reason: 'a tap that silently does nothing reads as a frozen app, and '
            'the seeker taps it again',
      );
    });
  });
}
