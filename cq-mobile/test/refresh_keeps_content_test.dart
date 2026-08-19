import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/home/presentation/home_screen.dart';
import 'package:cq_mobile/features/jobs/presentation/job_search_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// A refresh that fails must not take away what the user already has.
///
/// Home and Job search both set `_error` in their catch, and `_error` paints a
/// full-screen error view. So pulling to refresh in a lift or a tunnel — where
/// a request is most likely to fail, and where a commuting candidate is most
/// likely to be reading — replaced a screen full of results with an error page.
/// The user lost what they had by asking for something newer, and the way back
/// was another successful request they were in no position to make.
///
/// Same class as the job-detail bug where a failed similar-jobs query replaced
/// a job that had loaded perfectly. The rule is now the same in all three
/// places: the full error view is for a screen with nothing to show.
///
/// The transport starts healthy and is broken mid-test, because the bug only
/// exists on the second load. A test that fails from the start cannot see it.
class _Flaky implements HttpClientAdapter {
  _Flaky(this.routes);

  final Map<String, String> routes;
  bool broken = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (broken) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'network is gone',
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

const _slug = 'flutter-engineer-acme-42';

final _routes = <String, String>{
  '/v1/home':
      '{"counts":{"activeJobs":1240,"companies":86,"recruiters":31},'
      '"featuredJobs":[{"canonicalSlug":"$_slug","title":"Flutter Engineer",'
      '"companyName":"Acme Corp","cityName":"Pune",'
      '"postedAt":"2026-08-01T09:00:00.000Z"}]}',
  '/v1/jobs':
      '{"hits":[{"id":42,"title":"Flutter Engineer","canonicalSlug":"$_slug",'
      '"company":{"id":7,"name":"Acme Corp","slug":"acme"},'
      '"postedAt":"2026-08-01T09:00:00.000Z","city":"Pune"}],'
      '"total":1,"page":1,"pageSize":20}',
};

Future<void> _mount(WidgetTester tester, Widget screen, _Flaky transport) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = transport;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(theme: CqTheme.light, home: screen),
    ),
  );
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Drags the list far enough to arm the RefreshIndicator, then lets it run.
Future<void> _pullToRefresh(WidgetTester tester) async {
  // Target the scrollable the RefreshIndicator actually wraps. Taking the
  // first Scrollable in the tree instead picks up the horizontal filter-chip
  // row on Job search, and flinging that does nothing -- which made this test
  // pass for the wrong reason.
  final scrollable = find.descendant(
    of: find.byType(RefreshIndicator),
    matching: find.byType(Scrollable),
  );
  await tester.fling(scrollable.first, const Offset(0, 320), 1000);
  await _settle(tester);
}

void main() {
  group('a failed refresh', () {
    testWidgets('leaves the Home feed on screen and says what went wrong',
        (tester) async {
      final transport = _Flaky(_routes);
      await _mount(tester, const HomeScreen(), transport);
      await _settle(tester);

      // Precondition: there is something to lose.
      expect(find.textContaining('Flutter Engineer'), findsWidgets,
          reason: 'the test needs a loaded Home before it can test losing it');

      transport.broken = true;
      await _pullToRefresh(tester);

      expect(find.textContaining('Flutter Engineer'), findsWidgets,
          reason: 'a failed refresh threw away the feed the user already had');
      // Silence would be its own bug: the user pulled, so something has to
      // acknowledge that nothing new arrived.
      expect(find.byType(SnackBar), findsOneWidget);
    });

    testWidgets('leaves the search results on screen', (tester) async {
      final transport = _Flaky(_routes);
      await _mount(tester, const JobSearchScreen(), transport);
      await _settle(tester);

      expect(find.textContaining('Flutter Engineer'), findsWidgets);

      transport.broken = true;
      await _pullToRefresh(tester);

      expect(find.textContaining('Flutter Engineer'), findsWidgets,
          reason: 'a failed refresh threw away results the user already had');
      expect(find.byType(SnackBar), findsOneWidget);
    });
  });

  group('a first load that fails', () {
    // The carve-out has to stay narrow. A screen with nothing on it must still
    // show the error and the way out of it, or the user is stranded on a tab
    // they cannot leave without killing the app.
    testWidgets('still shows the full error view on Home', (tester) async {
      final transport = _Flaky(_routes)..broken = true;
      await _mount(tester, const HomeScreen(), transport);
      await _settle(tester);

      expect(find.text('Try again'), findsOneWidget);
      expect(find.textContaining('Flutter Engineer'), findsNothing);
    });

    testWidgets('still shows the full error view on Job search', (tester) async {
      final transport = _Flaky(_routes)..broken = true;
      await _mount(tester, const JobSearchScreen(), transport);
      await _settle(tester);

      expect(find.text('Try again'), findsOneWidget);
    });
  });
}
