import 'dart:async';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/applications/presentation/applications_screen.dart';
import 'package:cq_mobile/features/auth/presentation/auth_landing_screen.dart';
import 'package:cq_mobile/features/auth/presentation/login_screen.dart';
import 'package:cq_mobile/features/home/presentation/home_screen.dart';
import 'package:cq_mobile/features/jobs/presentation/job_detail_screen.dart';
import 'package:cq_mobile/features/jobs/presentation/job_search_screen.dart';
import 'package:cq_mobile/features/profile/presentation/profile_screen.dart';
import 'package:cq_mobile/features/saved_jobs/presentation/saved_jobs_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Until this file, no screen in the app had ever been mounted in a test. Every
/// screen was verified by a human opening it on a device — which means the two
/// failures that cost a user the most were the two nobody could catch in CI:
/// a screen that throws while building (a blank red page, or on release a blank
/// white one), and a screen that spins forever because its one error path was
/// never taken.
///
/// This is a smoke net, deliberately broad and shallow. For each screen it
/// mounts the real widget over a real Dio whose transport is faked, and checks
/// the three states the seeker actually lands in:
///
///  * **loading** — the transport hangs, so the screen must say it is working
///    rather than render an empty frame;
///  * **loaded** — canned server JSON, so the screen must put the content on
///    screen instead of stalling on the loader;
///  * **error** — a dead network, so the screen must say so AND offer a way
///    forward. That last part is the one worth a test: a failure state with no
///    retry strands the user on a tab they cannot leave without killing the app,
///    and it is exactly the state a hand-test never visits.
///
/// Nothing here asserts layout or copy beyond the single anchor string each
/// state hangs on. Pixel work belongs in the per-widget files.

/// A transport that answers from a path → JSON table, so one fake stands in for
/// the whole API. Unlisted paths get `{}`: every parser in this app treats every
/// field as optional, so an unmodelled side-call degrades instead of throwing.
class _Server implements HttpClientAdapter {
  _Server(this.routes);

  final Map<String, String> routes;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    routes[options.path] ?? '{}',
    200,
    // Without the content-type Dio hands the repository a String and every
    // parser silently reads garbage instead of failing loudly.
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// A transport whose requests never answer — the screen is stuck mid-load.
///
/// A Completer rather than a delay on purpose: a pending timer would fail the
/// test at teardown, and there is nothing to wait for anyway.
///
/// It records what was asked for, and the loading tests assert that. Without
/// the record those tests are much weaker than they read: every one of these
/// screens declares `bool _loading = true` as a field initialiser, so "shows
/// its loading line" is already satisfied one frame after mount by a screen
/// that never issues a request at all. Deleting the `_load()` call out of
/// `HomeScreen.initState` leaves the loading assertion green — a spinner over
/// a request that was never sent is the forever-spinner this file exists to
/// catch, so the request itself has to be part of the assertion.
class _HangingAdapter implements HttpClientAdapter {
  final List<String> requested = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requested.add(options.path);
    return Completer<ResponseBody>().future;
  }

  @override
  void close({bool force = false}) {}
}

/// A transport that fails every request, standing in for a dead network.
class _DeadAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException.connectionError(
      requestOptions: options,
      reason: 'no network',
    );
  }

  @override
  void close({bool force = false}) {}
}

const _phone = Size(390, 844);

/// Mounts [screen] over [adapter] and paints exactly one frame — the state the
/// user sees before any response lands.
///
/// Overriding `dioProvider` alone reaches every repository: each of them is a
/// `FutureProvider` built from it, so one seam fakes the whole data layer. It
/// also keeps `cookieJarProvider` out of the graph, which would otherwise hit
/// path_provider and throw MissingPluginException.
Future<void> _mount(
  WidgetTester tester,
  Widget screen,
  HttpClientAdapter adapter,
) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = adapter;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(theme: CqTheme.light, home: screen),
    ),
  );
  await tester.pump();
}

/// Advances a handful of frames so the load chain (provider → repository →
/// request → setState) lands.
///
/// `pumpAndSettle` is not an option: CqLoader's brand animation repeats
/// forever, so settling on a screen that is still loading never returns — and
/// "still loading" is precisely the case these tests need to survive.
Future<void> _pumpFrames(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

const _slug = 'flutter-engineer-acme-42';

const _jobHit =
    '{"id":42,"title":"Flutter Engineer","canonicalSlug":"$_slug",'
    '"company":{"id":7,"name":"Acme Corp","slug":"acme"},'
    '"postedAt":"2026-08-01T09:00:00.000Z","city":"Pune",'
    '"salaryMin":120000000,"salaryMax":180000000,'
    '"minExperienceMonths":24,"maxExperienceMonths":60,"skills":["Dart"]}';

/// One healthy response for every endpoint the eight screens touch on mount.
/// The four `/me/*` list routes must answer with a JSON array — their
/// repositories ask Dio for a `List<dynamic>`, and a `{}` there is a cast
/// failure rather than an empty section.
final _healthy = <String, String>{
  '/v1/home':
      '{"counts":{"activeJobs":1240,"companies":86,"recruiters":31},'
      '"latestJobs":[{"canonicalSlug":"$_slug","title":"Flutter Engineer",'
      '"companyName":"Acme Corp","cityName":"Pune",'
      '"postedAt":"2026-08-01T09:00:00.000Z"}],'
      '"popularCities":[{"name":"Pune","slug":"pune","jobCount":225}]}',
  '/v1/jobs': '{"hits":[$_jobHit],"total":1,"page":1,"pageSize":20}',
  '/v1/jobs/$_slug':
      '{"id":42,"canonicalSlug":"$_slug","title":"Flutter Engineer",'
      '"description":"Build the CQ app.","status":"ACTIVE",'
      '"postedAt":"2026-08-01T09:00:00.000Z",'
      '"company":{"id":7,"name":"Acme Corp","slug":"acme"},'
      '"employmentType":"FULL_TIME","workMode":"HYBRID",'
      '"salaryMinPaise":120000000,"salaryMaxPaise":180000000,'
      '"experienceMinYears":2,"experienceMaxYears":5,"cities":["Pune"],'
      '"skills":[{"id":1,"slug":"dart","name":"Dart"}]}',
  '/v1/me/job-state': '{"saved":[],"applied":{}}',
  '/me/saved-jobs':
      '{"hits":[{"jobId":42,"savedAt":"2026-08-10T09:00:00.000Z",'
      '"applied":false,"job":{"canonicalSlug":"$_slug",'
      '"title":"Flutter Engineer","status":"ACTIVE",'
      '"company":{"name":"Acme Corp"}}}],"total":1,"page":1,"pageSize":20}',
  '/me/applications':
      '{"hits":[{"id":9,"status":"IN_REVIEW",'
      '"appliedAt":"2026-08-05T09:00:00.000Z",'
      '"job":{"title":"Flutter Engineer","canonicalSlug":"$_slug",'
      '"company":{"id":7,"name":"Acme Corp","slug":"acme"}}}],'
      '"total":1,"page":1,"pageSize":20,"counts":{"ALL":1,"IN_REVIEW":1}}',
  '/me/profile':
      '{"user":{"name":"Priya Choudhary","email":"priya@example.com",'
      '"emailVerified":true},'
      '"candidate":{"profileCompleteness":72,"headline":"Flutter developer",'
      '"workStatus":"EXPERIENCED","experienceMonths":36,"skillIds":[1,2,3],'
      '"lookingFor":"JOB","expectedSalaryMinPaise":120000000},'
      '"educationCount":1,"experienceCount":2}',
  '/me/alerts': '[]',
  '/me/education': '[]',
  '/me/experience': '[]',
  '/me/languages': '[]',
  '/me/projects': '[]',
};

/// The same table with every collection emptied — the day-one account.
final _empty = <String, String>{
  ..._healthy,
  '/v1/jobs': '{"hits":[],"total":0,"page":1,"pageSize":20}',
  '/me/saved-jobs': '{"hits":[],"total":0,"page":1,"pageSize":20}',
  '/me/applications':
      '{"hits":[],"total":0,"page":1,"pageSize":20,"counts":{"ALL":0}}',
};

/// The six screens that own a network-backed body, with the line each shows
/// while it is loading. Used for the loading and error sweeps, where the
/// assertion is identical across all of them and the risk is a screen being
/// left out rather than a screen behaving differently.
final _dataScreens = <String, (Widget, String)>{
  'Home': (const HomeScreen(), 'Loading your feed…'),
  'Job search': (const JobSearchScreen(), 'Finding jobs…'),
  'Job detail': (const JobDetailScreen(slug: _slug), 'Loading job…'),
  'Saved jobs': (const SavedJobsScreen(), 'Loading saved jobs…'),
  'Applications': (const ApplicationsScreen(), 'Loading applications…'),
  'Profile': (const ProfileScreen(), 'Loading your profile…'),
};

void main() {
  group('mounts without throwing', () {
    // The auth screens have no network body, so they get their own case: what
    // matters is that they build at all and offer the one action that works.
    testWidgets('the auth landing screen paints and offers a way in', (
      tester,
    ) async {
      await _mount(tester, const AuthLandingScreen(), _Server(_healthy));

      expect(tester.takeException(), isNull);
      expect(find.text('Continue with Email'), findsOneWidget);
    });

    testWidgets('the login screen paints its form', (tester) async {
      await _mount(tester, const LoginScreen(), _Server(_healthy));

      expect(tester.takeException(), isNull);
      // Both fields, counted: the screen offers three other ways in (OTP,
      // Google, Phone), so a password field that stopped rendering would still
      // leave a plausible-looking login screen behind.
      expect(find.byType(TextFormField), findsNWidgets(2));
      // Exactly the submit button — 'Log in to Career Queue' and 'Log in with
      // OTP' are different strings, so this does not match the heading or the
      // secondary action.
      expect(find.text('Log in'), findsOneWidget);
    });
  });

  group('loading', () {
    for (final entry in _dataScreens.entries) {
      final (screen, loadingLine) = entry.value;
      testWidgets(
        '${entry.key} says it is working while the server is silent',
        (tester) async {
          final transport = _HangingAdapter();
          await _mount(tester, screen, transport);
          await _pumpFrames(tester);

          // Ordered first: a spinner with no request behind it is the worse
          // bug of the two, and it is the one that reads as fine on screen.
          expect(
            transport.requested,
            isNotEmpty,
            reason: '${entry.key} showed a loader without asking the server '
                'for anything',
          );
          // A screen that renders an empty frame here reads as broken, and the
          // user's only move is to kill the app.
          expect(
            find.text(loadingLine),
            findsOneWidget,
            reason: '${entry.key} showed nothing while its request was in '
                'flight',
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  });

  group('loaded', () {
    testWidgets('Home renders the feed the server sent', (tester) async {
      await _mount(tester, const HomeScreen(), _Server(_healthy));
      await _pumpFrames(tester);

      expect(find.text('Loading your feed…'), findsNothing);
      expect(find.text('Latest jobs'), findsOneWidget);
      expect(find.text('Flutter Engineer'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Job search renders the hits and the result count', (
      tester,
    ) async {
      await _mount(tester, const JobSearchScreen(), _Server(_healthy));
      await _pumpFrames(tester);

      expect(find.text('Finding jobs…'), findsNothing);
      // Singular, because the fixture returns exactly one hit — the plural
      // branch is the one a "1 jobs" bug would hit.
      expect(find.text('1 job'), findsOneWidget);
      expect(find.text('Flutter Engineer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Job search counts the server total, not the page it got', (
      tester,
    ) async {
      // The case above cannot tell `total` from `hits.length`, because the
      // fixture makes them both 1. Page 1 of a real search is the opposite:
      // 20 hits out of thousands, and a screen that counts its own list tells
      // the seeker there are 20 jobs in the country.
      await _mount(
        tester,
        const JobSearchScreen(),
        _Server({
          ..._healthy,
          '/v1/jobs': '{"hits":[$_jobHit],"total":137,"page":1,"pageSize":20}',
        }),
      );
      await _pumpFrames(tester);

      expect(find.text('137 jobs'), findsOneWidget);
      expect(find.text('1 job'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Job detail renders the job and an apply action', (
      tester,
    ) async {
      await _mount(
        tester,
        const JobDetailScreen(slug: _slug),
        _Server(_healthy),
      );
      await _pumpFrames(tester);

      expect(find.text('Loading job…'), findsNothing);
      expect(find.text('Flutter Engineer'), findsOneWidget);
      expect(find.text('Acme Corp'), findsOneWidget);
      // An ACTIVE job must end in something the seeker can press; the apply bar
      // is the whole point of the screen.
      expect(find.text('Apply now'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Saved jobs renders the saved row', (tester) async {
      await _mount(tester, const SavedJobsScreen(), _Server(_healthy));
      await _pumpFrames(tester);

      expect(find.text('Loading saved jobs…'), findsNothing);
      expect(find.text('Flutter Engineer'), findsOneWidget);
      expect(find.text('No saved jobs yet'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Applications renders the application and its status', (
      tester,
    ) async {
      await _mount(tester, const ApplicationsScreen(), _Server(_healthy));
      await _pumpFrames(tester);

      expect(find.text('Loading applications…'), findsNothing);
      expect(find.text('Flutter Engineer'), findsOneWidget);
      // Exactly one, and it is the badge on the card. The IN_REVIEW filter chip
      // renders 'In review  1' once the server sends a count for it, so it does
      // not match — which is what makes this assertion about the row's status
      // rather than about a chip that is on screen no matter what came back.
      expect(find.text('In review'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Profile renders the seeker identity', (tester) async {
      await _mount(tester, const ProfileScreen(), _Server(_healthy));
      await _pumpFrames(tester);

      expect(find.text('Loading your profile…'), findsNothing);
      expect(find.text('Priya Choudhary'), findsOneWidget);
      expect(find.text('priya@example.com'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('empty', () {
    // An empty state that only describes the emptiness is a dead end: the user
    // is already standing on the screen it tells them to go and use. Each of
    // these must hand them the way out.
    testWidgets('Saved jobs offers a route to browse when nothing is saved', (
      tester,
    ) async {
      await _mount(tester, const SavedJobsScreen(), _Server(_empty));
      await _pumpFrames(tester);

      expect(find.text('No saved jobs yet'), findsOneWidget);
      expect(find.text('Browse jobs'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Applications offers a route to search when nothing applied', (
      tester,
    ) async {
      await _mount(tester, const ApplicationsScreen(), _Server(_empty));
      await _pumpFrames(tester);

      expect(find.text('No applications yet'), findsOneWidget);
      expect(find.text('Find jobs to apply'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Job search explains a zero-result search', (tester) async {
      await _mount(tester, const JobSearchScreen(), _Server(_empty));
      await _pumpFrames(tester);

      expect(find.text('No jobs found'), findsOneWidget);
      // No filters are on, so blaming filters here would be a lie.
      expect(find.text('Try a different search.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('error', () {
    for (final entry in _dataScreens.entries) {
      testWidgets('${entry.key} fails with a retry, not a dead end', (
        tester,
      ) async {
        await _mount(tester, entry.value.$1, _DeadAdapter());
        await _pumpFrames(tester);

        expect(
          find.text(entry.value.$2),
          findsNothing,
          reason: '${entry.key} span forever instead of reporting the failure',
        );
        // The message itself comes from the shared friendlyDioMessage helper
        // and may be reworded, so assert the icon and the action instead.
        expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
        expect(
          find.text('Try again'),
          findsOneWidget,
          reason: '${entry.key} left the user with no way to recover',
        );
        expect(tester.takeException(), isNull);
      });
    }
  });
}

