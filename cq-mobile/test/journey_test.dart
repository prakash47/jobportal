import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/router/app_router.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/applications/presentation/applications_screen.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:cq_mobile/features/jobs/presentation/job_detail_screen.dart';
import 'package:cq_mobile/features/jobs/presentation/job_search_screen.dart';
import 'package:cq_mobile/features/saved_jobs/presentation/saved_jobs_screen.dart';
import 'package:cq_mobile/shared/widgets/cq_loader.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every other widget test in this suite mounts ONE screen, hands it a canned
/// answer, and asks whether it painted. That is the right shape for the
/// questions those files ask, and it is structurally blind to the questions
/// this one asks — because each of them starts from a fresh tree, and the bugs
/// that survive here all live in the space *between* two screens:
///
///  * The five tabs sit in an `IndexedStack`. All five mount at launch and each
///    loads exactly once — switching tabs shows a screen that was built minutes
///    ago, it does not build a new one. So when the candidate applies, the
///    Applied tab has already asked the server and already been told there is
///    nothing, and nothing will ever ask again. It only stops lying because the
///    detail screen announces the change on the `CqData` bus — and a per-screen
///    test, which mounts the Applied tab *after* the application exists, passes
///    whether or not that announcement is ever made.
///  * The same holds in reverse: unsaving from the Saved tab has to clear the
///    bookmark on a search-results row that is sitting off-screen behind it.
///  * And the search the candidate typed has to still be there when they come
///    back from a job, rather than quietly resetting to every job in India.
///
/// So this file mounts the real router at the real launch route, over one
/// stateful fake of the whole API, and walks a single candidate through:
/// search → job → apply → the tab they check next. What is asserted is only
/// what that candidate would see; the API shapes underneath are pinned by the
/// repository contract tests, not repeated here.
///
/// The fake is stateful on purpose. Canned per-path JSON cannot express "the
/// Applied tab is empty *until* the apply lands", which is the entire point.

// ── Fixtures ────────────────────────────────────────────────────────────────

class _Job {
  const _Job({
    required this.id,
    required this.slug,
    required this.title,
    required this.companyId,
    required this.companyName,
    required this.companySlug,
    required this.city,
    required this.skillSlug,
    required this.skillName,
  });

  final int id;
  final String slug;
  final String title;
  final int companyId;
  final String companyName;
  final String companySlug;
  final String city;
  final String skillSlug;
  final String skillName;
}

const _flutterJob = _Job(
  id: 42,
  slug: 'flutter-engineer-acme-42',
  title: 'Flutter Engineer',
  companyId: 7,
  companyName: 'Acme Corp',
  companySlug: 'acme',
  city: 'Pune',
  skillSlug: 'dart',
  skillName: 'Dart',
);

/// A second job with nothing in common with the first — no shared word in the
/// title, no shared skill. It is what makes "the search narrowed" and "the
/// search is still narrowed" observable rather than assumed.
const _warehouseJob = _Job(
  id: 77,
  slug: 'warehouse-supervisor-bluewave-77',
  title: 'Warehouse Supervisor',
  companyId: 11,
  companyName: 'Bluewave Logistics',
  companySlug: 'bluewave',
  city: 'Surat',
  skillSlug: 'logistics',
  skillName: 'Logistics',
);

const _jobs = [_flutterJob, _warehouseJob];

const _postedAt = '2026-08-01T09:00:00.000Z';
const _now = '2026-08-19T09:00:00.000Z';

const _candidate = AuthUser(
  id: 3,
  email: 'asha@example.com',
  name: 'Asha Nair',
  role: 'CANDIDATE',
  emailVerified: true,
);

// ── The server ──────────────────────────────────────────────────────────────

/// One fake API for the whole journey, holding the two pieces of state a
/// candidate changes from inside the app: what they have saved and what they
/// have applied to.
///
/// Routing is by method AND path, and the split the real API makes is honoured
/// exactly — public reads carry `/v1`, the signed-in `/me/*` routes do not.
/// That is not decoration: an unknown GET answers `{}`, which every parser in
/// this app degrades into an empty list, so a screen that asked
/// `/v1/me/saved-jobs` would show "No saved jobs yet" and the journey would
/// fail on the thing the candidate sees rather than on a URL string.
class _Api implements HttpClientAdapter {
  /// jobId → the status the server would report for this candidate's
  /// application to it.
  final Map<int, String> applied = {};
  final Set<int> saved = {};

  final Map<int, int> _applicationIds = {};
  int _nextApplicationId = 900;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.path;

    if (options.method == 'GET') {
      switch (path) {
        case '/v1/home':
          return _json(_homeFeed);
        case '/v1/jobs':
          return _json(_search(options.queryParameters));
        case '/me/saved-jobs':
          return _json(_savedPage);
        case '/me/applications':
          return _json(_applicationsPage(options.queryParameters['status']));
        case '/me/applications/quota':
          return _json({
            'count': applied.length,
            'limit': 10,
            'unlimited': false,
            'upgradeAvailable': false,
          });
        case '/me/profile':
          // Two nested objects, not one flat one. A flat fixture here parses
          // to a profile with no name and no email, and the Profile tab shows
          // a signed-in candidate an empty identity.
          return _json({
            'user': {
              'name': _candidate.name,
              'email': _candidate.email,
              'emailVerified': true,
            },
            'candidate': {
              'profileCompleteness': 72,
              'headline': 'Flutter developer',
              'workStatus': 'EXPERIENCED',
              'experienceMonths': 36,
            },
          });
        case '/me/alerts' ||
            '/me/education' ||
            '/me/experience' ||
            '/me/languages' ||
            '/me/projects':
          return _json(const []);
      }
      if (path.startsWith('/v1/jobs/')) {
        final job = _bySlug(path.substring('/v1/jobs/'.length));
        return job == null
            ? _json({'message': 'Not found'}, 404)
            : _json(_detail(job));
      }
      // The profile tab decorates itself from a handful of side-calls this
      // journey never looks at. Every model treats every field as optional, so
      // an empty object leaves those sections blank instead of throwing.
      return _json(const <String, dynamic>{});
    }

    if (options.method == 'POST' && path == '/v1/me/job-state') {
      final ids = ((options.data as Map)['jobIds'] as List).cast<num>().map(
        (n) => n.toInt(),
      );
      return _json({
        'saved': ids.where(saved.contains).toList(),
        'applied': {
          for (final id in ids)
            if (applied.containsKey(id)) '$id': applied[id],
        },
      });
    }

    if (options.method == 'POST' && path == '/me/applications') {
      final jobId = ((options.data as Map?)?['jobId'] as num?)?.toInt() ?? 0;
      if (applied.containsKey(jobId)) {
        return _json({'message': 'You have already applied to this job.'}, 409);
      }
      applied[jobId] = 'APPLIED';
      _applicationIds[jobId] = _nextApplicationId++;
      return _json({
        'id': _applicationIds[jobId],
        'jobId': jobId,
        'status': 'APPLIED',
      }, 201);
    }

    // Save and unsave both put the id in the PATH and send no body.
    if (path.startsWith('/me/saved-jobs/')) {
      final jobId = int.tryParse(path.substring('/me/saved-jobs/'.length));
      if (jobId != null && options.method == 'POST') {
        saved.add(jobId);
        return _json({'jobId': jobId}, 201);
      }
      if (jobId != null && options.method == 'DELETE') {
        saved.remove(jobId);
        return _json(const <String, dynamic>{});
      }
    }

    // A mutation aimed anywhere else is a 404, never a polite empty object.
    // Posting the save to the collection with the id in the body matched no
    // route at all on the real server, and shipped: every save 404'd in
    // silence. Answering it here would hide the same mistake again.
    return _json({'message': 'No route for ${options.method} $path'}, 404);
  }

  @override
  void close({bool force = false}) {}

  _Job? _bySlug(String slug) {
    for (final job in _jobs) {
      if (job.slug == slug) return job;
    }
    return null;
  }

  /// `GET /v1/jobs`, honouring the keyword and the repeatable `skill` filter —
  /// the two the journey actually sends. Everything else is ignored.
  Map<String, dynamic> _search(Map<String, dynamic> query) {
    final q = (query['q'] as String? ?? '').toLowerCase();
    final skills = switch (query['skill']) {
      final List<dynamic> many => many.map((s) => '$s').toList(),
      final String one => [one],
      _ => const <String>[],
    };
    final hits = _jobs
        .where((j) => q.isEmpty || j.title.toLowerCase().contains(q))
        .where((j) => skills.isEmpty || skills.contains(j.skillSlug))
        .map(_hit)
        .toList();
    return {'hits': hits, 'total': hits.length, 'page': 1, 'pageSize': 20};
  }

  Map<String, dynamic> _hit(_Job j) => {
    'id': j.id,
    'title': j.title,
    'canonicalSlug': j.slug,
    'company': {'id': j.companyId, 'name': j.companyName, 'slug': j.companySlug},
    'city': j.city,
    'postedAt': _postedAt,
    'salaryMin': 120000000,
    'salaryMax': 180000000,
    'minExperienceMonths': 24,
    'maxExperienceMonths': 60,
    'skills': [j.skillName],
  };

  /// Deliberately carries no `isSaved` / `isApplied`: the real detail resource
  /// has no per-user markers, which is why the screen has to ask
  /// `/v1/me/job-state` for them separately.
  Map<String, dynamic> _detail(_Job j) => {
    'id': j.id,
    'canonicalSlug': j.slug,
    'title': j.title,
    'description': 'Build things people use every day.',
    'status': 'ACTIVE',
    'postedAt': _postedAt,
    'company': {'id': j.companyId, 'name': j.companyName, 'slug': j.companySlug},
    'employmentType': 'FULL_TIME',
    'workMode': 'HYBRID',
    'salaryMinPaise': 120000000,
    'salaryMaxPaise': 180000000,
    'experienceMinYears': 2,
    'experienceMaxYears': 5,
    'cities': [j.city],
    'skills': [
      {'id': 1, 'slug': j.skillSlug, 'name': j.skillName},
    ],
  };

  /// The job is NESTED under the saved row, and the company under the job.
  Map<String, dynamic> get _savedPage {
    final hits = [
      for (final id in saved)
        if (_jobs.where((j) => j.id == id).firstOrNull case final job?)
          {
            'jobId': job.id,
            'savedAt': _now,
            'applied': applied.containsKey(job.id),
            'appliedStatus': applied[job.id],
            'job': {
              'canonicalSlug': job.slug,
              'title': job.title,
              'status': 'ACTIVE',
              'company': {'name': job.companyName},
            },
          },
    ];
    return {'hits': hits, 'total': hits.length, 'page': 1, 'pageSize': 20};
  }

  Map<String, dynamic> _applicationsPage(Object? status) {
    final wanted = status is String ? status : 'ALL';
    final hits = [
      for (final entry in applied.entries)
        if (wanted == 'ALL' || wanted == entry.value)
          if (_jobs.where((j) => j.id == entry.key).firstOrNull case final job?)
            {
              'id': _applicationIds[entry.key],
              'status': entry.value,
              'appliedAt': _now,
              'job': {
                'title': job.title,
                'canonicalSlug': job.slug,
                'company': {
                  'id': job.companyId,
                  'name': job.companyName,
                  'slug': job.companySlug,
                },
              },
            },
    ];
    final counts = <String, int>{'ALL': applied.length};
    for (final s in applied.values) {
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return {
      'hits': hits,
      'total': hits.length,
      'page': 1,
      'pageSize': 20,
      'counts': counts,
    };
  }

  Map<String, dynamic> get _homeFeed => {
    'counts': {'activeJobs': 1240, 'companies': 86, 'recruiters': 31},
    'latestJobs': [
      for (final j in _jobs)
        {
          'canonicalSlug': j.slug,
          'title': j.title,
          'companyName': j.companyName,
          'cityName': j.city,
          'postedAt': _postedAt,
        },
    ],
    'popularCities': [
      {'name': 'Pune', 'slug': 'pune', 'jobCount': 225},
    ],
  };
}

/// Without the JSON content type Dio hands the repository a raw String and
/// every parser silently reads garbage instead of failing loudly.
ResponseBody _json(Object? body, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

// ── Driving the app ─────────────────────────────────────────────────────────

/// Pins the auth state instead of letting the real controller probe the server
/// and sit on the splash hold. Signed in and verified: an unverified candidate
/// is diverted into the email sheet before the apply can land.
class _SignedIn extends AuthController {
  @override
  AuthState build() => const AuthAuthenticated(_candidate);
}

/// Launches the app the way it launches: the real router at its real initial
/// location, with only the transport and the session faked.
///
/// The redirect resolves `/` to `/home` before the splash ever builds, so what
/// mounts is the tabbed shell — all five tabs at once, each firing its one
/// load. That is the starting position the journeys need, and the reason none
/// of them can be assembled by mounting a screen directly.
Future<void> _launch(WidgetTester tester, _Api api) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWith((ref) async => dio),
        authControllerProvider.overrideWith(_SignedIn.new),
      ],
      child: Consumer(
        builder: (context, ref, _) => MaterialApp.router(
          // Every screen reads `context.cq`, the theme extension CqTheme
          // registers; a bare MaterialApp throws on the first build.
          theme: CqTheme.light,
          routerConfig: ref.watch(routerProvider),
        ),
      ),
    ),
  );
  await _pumpUntil(tester, 'the app to reach its tabbed shell', _shellIsUp);
}

/// Pumps frames until [ready] holds, and fails saying what it was waiting for
/// if it never does.
///
/// Waiting by frame count is the obvious thing here and it is a trap. Halfway
/// through a route transition BOTH the outgoing shell and the incoming job
/// page are on screen, so a finder for "the bookmark" matches the job's app
/// bar and the bottom bar's Saved tab at once — measured, one frame short of
/// the transition ends the journey on an ambiguous finder, and a finder that
/// was ever made to pick one would pick the wrong one. A budget that covers
/// every step today also silently stops covering them the day a load chain
/// gains one more hop, and the test that then fails blames the app.
///
/// `pumpAndSettle` cannot do this job either: CqLoader's brand animation
/// repeats forever, so settling on a screen that is still loading never
/// returns.
Future<void> _pumpUntil(
  WidgetTester tester,
  String what,
  bool Function() ready,
) async {
  // ~4s of frames. Long enough that no honest load chain reaches it, short
  // enough that a screen which never finishes fails rather than hangs CI.
  for (var frame = 0; frame < 250; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
    if (ready()) return;
  }
  fail('Waited about four seconds of frames for $what. It never happened.');
}

/// True when nothing the candidate can see is still a spinner.
///
/// Finders skip both the tabs behind the front one and the shell under a
/// pushed page, so this only ever asks about the surface actually on screen —
/// a tab still loading in the background is none of its business.
bool _idle() => find.byType(CqLoader).evaluate().isEmpty;

/// The shell is up and no page is pushed over it.
bool _shellIsUp() =>
    find.byType(NavigationBar).evaluate().isNotEmpty && _idle();

/// Taps something that talks to the server, then waits out the toast it
/// raises — so what gets asserted afterwards is what the candidate is still
/// looking at a moment later. A toast fades; an apply bar does not.
///
/// Waiting for the toast to APPEAR before touching the clock is the proof that
/// the tap was answered at all: skip ahead first and the response resolves into
/// a toast whose whole four seconds are still in front of it.
///
/// Then the clock is jumped TWICE, which looks redundant and is not. A
/// snackbar's four-second display timer is only created once its entrance
/// animation reports completion, so the first jump is what finishes the
/// entrance and starts the timer, and the second is what runs it out. With one
/// jump the toast simply stays on screen — asserted against, that leaves every
/// 'is the message still there?' question below answered by the message that
/// was never supposed to still be there.
Future<void> _tapAndLetTheToastFade(WidgetTester tester, Finder target) async {
  await tester.tap(target);
  await _pumpUntil(
    tester,
    'the server to answer the tap and the app to say something about it',
    () => find.byType(SnackBar).evaluate().isNotEmpty,
  );
  await tester.pump(const Duration(seconds: 5));
  await tester.pump(const Duration(seconds: 5));
  await _pumpUntil(
    tester,
    'the toast to leave and the screens it woke to finish reloading',
    () => find.byType(SnackBar).evaluate().isEmpty && _idle(),
  );
}

/// Names the screen an assertion is about.
///
/// The unselected tabs stay mounted behind the front one, but a finder skips
/// them, so this is not about tab bleed-through. It is about the surfaces that
/// really are on screen together: the bottom bar carries a bookmark icon at the
/// same time as a search row does, and 'Applied' is simultaneously a tab, a
/// filter chip and a badge on a card.
Finder _on<T extends Widget>(Finder finder) =>
    find.descendant(of: find.byType(T), matching: finder);

/// The one card in a list that is about [title] — the tappable row, not the
/// screen. Scoping to the row is what stops a badge assertion being satisfied
/// by a filter chip or a neighbouring card that happens to carry the same word.
Finder _cardFor(Finder within, String title) => find
    .ancestor(
      of: find.descendant(of: within, matching: find.text(title)),
      matching: find.byType(InkWell),
    )
    .first;

// The bottom-nav destinations, by their UNSELECTED icon — the only variant
// NavigationBar keeps in the tree for a tab you are not standing on, which is
// the only kind anything here taps. By icon rather than by label because
// 'Jobs' and 'Saved' are also app-bar titles of the screens they open.
const _tabIcons = <Type, IconData>{
  JobSearchScreen: Icons.work_outline_rounded,
  SavedJobsScreen: Icons.bookmark_border_rounded,
  ApplicationsScreen: Icons.assignment_outlined,
};

Future<void> _openTab<T extends Widget>(WidgetTester tester) async {
  await tester.tap(_on<NavigationBar>(find.byIcon(_tabIcons[T]!)));
  await _pumpUntil(
    tester,
    'the $T tab to come to the front with something on it',
    () => find.byType(T).evaluate().isNotEmpty && _idle(),
  );
}

/// Types into the search box and submits it, the way a thumb does.
Future<void> _searchFor(WidgetTester tester, String keyword) async {
  await tester.enterText(_on<JobSearchScreen>(find.byType(TextField)), keyword);
  await tester.testTextInput.receiveAction(TextInputAction.search);
  await _pumpUntil(tester, 'the results for "$keyword"', _idle);
}

/// Opens the job's full page from the search results.
///
/// Waiting for the bottom bar to GO is what makes this safe: it is the only
/// signal that the shell has finished sliding out from under the job page, and
/// until it has, every unscoped finder sees two screens' worth of widgets.
Future<void> _openJob(WidgetTester tester, String title) async {
  await tester.tap(_on<JobSearchScreen>(find.text(title)));
  await _pumpUntil(
    tester,
    'the job page for "$title" to open and load',
    () =>
        find.byType(JobDetailScreen).evaluate().isNotEmpty &&
        find.byType(NavigationBar).evaluate().isEmpty &&
        _idle(),
  );
}

/// The system back gesture, out of a job and onto whatever was under it.
Future<void> _goBack(WidgetTester tester) async {
  await tester.pageBack();
  await _pumpUntil(
    tester,
    'the job page to close and give the shell back',
    () => find.byType(JobDetailScreen).evaluate().isEmpty && _shellIsUp(),
  );
}

/// The live Applied tab, found whether or not it is the tab in front.
State<StatefulWidget> _appliedTabState(WidgetTester tester) => tester.state(
  find.byType(ApplicationsScreen, skipOffstage: false),
);

void main() {
  testWidgets(
    'a candidate searches, applies, and finds the application waiting in the '
    'tab that was already open and already empty',
    (tester) async {
      final api = _Api();
      await _launch(tester, api);

      // The starting position, and the whole reason this is a journey: the
      // candidate looks at the Applied tab before applying to anything. That
      // one look is the only load this screen will ever do.
      await _openTab<ApplicationsScreen>(tester);
      expect(
        _on<ApplicationsScreen>(find.text('No applications yet')),
        findsOneWidget,
      );
      final appliedTab = _appliedTabState(tester);

      await _openTab<JobSearchScreen>(tester);

      // What is on screen before they type. Asserting it is what turns the
      // pair below into an observed change rather than an assumed one — a
      // search box that silently does nothing leaves this same list behind.
      expect(_on<JobSearchScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(
        _on<JobSearchScreen>(find.text('Warehouse Supervisor')),
        findsOneWidget,
      );

      await _searchFor(tester, 'flutter');

      expect(_on<JobSearchScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(
        _on<JobSearchScreen>(find.text('Warehouse Supervisor')),
        findsNothing,
        reason: 'the keyword the candidate typed narrowed nothing',
      );

      await _openJob(tester, 'Flutter Engineer');

      expect(
        _on<JobDetailScreen>(find.text('Flutter Engineer')),
        findsOneWidget,
      );
      expect(
        _on<JobDetailScreen>(find.text('Acme Corp')),
        findsOneWidget,
        reason: 'the row that was tapped opened somebody else\'s job',
      );

      await _tapAndLetTheToastFade(
        tester,
        _on<JobDetailScreen>(find.text('Apply now')),
      );

      // The bar, not the toast — the toast has gone by now, and if it had not
      // this would find two.
      expect(
        _on<JobDetailScreen>(find.text('Application submitted')),
        findsOneWidget,
      );
      expect(
        _on<JobDetailScreen>(find.text('Apply now')),
        findsNothing,
        reason: 'the bar still invites a second application to the same job',
      );

      await _goBack(tester);

      // Back on the results the candidate left. The Jobs tab was never
      // unmounted, so a reset here would mean the screen threw away a search
      // it was still displaying.
      expect(_on<JobSearchScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(
        _on<JobSearchScreen>(find.text('Warehouse Supervisor')),
        findsNothing,
        reason: 'coming back from a job reset the search to every job there is',
      );
      expect(
        find.descendant(
          of: _cardFor(find.byType(JobSearchScreen), 'Flutter Engineer'),
          matching: find.text('Applied'),
        ),
        findsOneWidget,
        reason: 'the row still offers a job this candidate has already applied '
            'to, with nothing to say so',
      );

      await _openTab<ApplicationsScreen>(tester);

      // Guards this test against passing for the wrong reason. Everything below
      // is only evidence that the freshness bus works if the screen showing the
      // application is the same one that was told there were none — a tab that
      // got rebuilt on the way back would have refetched anyway, and would
      // report a healthy list over a bus that had been deleted.
      expect(
        _appliedTabState(tester),
        same(appliedTab),
        reason: 'the Applied tab was remounted, so this test can no longer '
            'tell a working freshness bus from an absent one',
      );
      expect(
        _on<ApplicationsScreen>(find.text('No applications yet')),
        findsNothing,
        reason: 'the tab that was mounted before the application existed is '
            'still telling the candidate they have never applied to anything',
      );
      expect(
        _on<ApplicationsScreen>(find.text('Flutter Engineer')),
        findsOneWidget,
      );

      // Read off the row itself. Screen-wide, 'Applied' is also the label of a
      // status filter chip sitting a few pixels above, so a screen-wide find
      // would go green for a card that had lost its status entirely.
      final row = _cardFor(find.byType(ApplicationsScreen), 'Flutter Engineer');
      expect(
        find.descendant(of: row, matching: find.text('Acme Corp')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.text('Applied')),
        findsOneWidget,
        reason: 'the application is listed with no status on it',
      );
    },
  );

  testWidgets(
    'a job saved from its page reaches the Saved tab, and removing it there '
    'takes the bookmark off the search row behind it',
    (tester) async {
      final api = _Api();
      await _launch(tester, api);

      await _openTab<SavedJobsScreen>(tester);
      expect(
        _on<SavedJobsScreen>(find.text('No saved jobs yet')),
        findsOneWidget,
      );

      await _openTab<JobSearchScreen>(tester);

      // Nothing is bookmarked yet, so every filled bookmark asserted from here
      // on is a change this journey caused rather than a fixture that arrived
      // that way.
      expect(
        _on<JobSearchScreen>(find.byIcon(Icons.bookmark_rounded)),
        findsNothing,
      );

      await _openJob(tester, 'Flutter Engineer');

      await _tapAndLetTheToastFade(
        tester,
        _on<JobDetailScreen>(find.byIcon(Icons.bookmark_border_rounded)),
      );

      expect(
        _on<JobDetailScreen>(find.byIcon(Icons.bookmark_rounded)),
        findsOneWidget,
        reason: 'the bookmark did not stay filled, so the save was reverted',
      );
      expect(
        api.saved,
        contains(_flutterJob.id),
        reason: 'the bookmark filled in but nothing the server recognised ever '
            'arrived, so the job is saved on this screen only',
      );

      await _goBack(tester);

      expect(_on<JobSearchScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(
        _on<JobSearchScreen>(find.byIcon(Icons.bookmark_rounded)),
        findsOneWidget,
        reason: 'the results row is still showing this job as unsaved',
      );

      await _openTab<SavedJobsScreen>(tester);

      expect(_on<SavedJobsScreen>(find.text('No saved jobs yet')), findsNothing);
      expect(_on<SavedJobsScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(_on<SavedJobsScreen>(find.text('Acme Corp')), findsOneWidget);

      // Second half, and the direction that is easier to get wrong: the same
      // bus has to carry a REMOVAL back to a list sitting off-screen. The
      // markers call legitimately answers "nothing saved" here, and treating
      // an empty answer as nothing-to-do would leave the bookmark filled.
      await _tapAndLetTheToastFade(
        tester,
        _on<SavedJobsScreen>(find.byTooltip('Remove')),
      );

      expect(
        _on<SavedJobsScreen>(find.text('No saved jobs yet')),
        findsOneWidget,
      );
      expect(
        api.saved,
        isEmpty,
        reason: 'the row vanished optimistically and the server was never told, '
            'so the job comes back on the next load',
      );

      await _openTab<JobSearchScreen>(tester);

      // The row has to still be there for the next line to mean anything: a
      // bare "no filled bookmark" is equally true of a screen showing a
      // spinner, an error or no results at all.
      expect(_on<JobSearchScreen>(find.text('Flutter Engineer')), findsOneWidget);
      expect(
        _on<JobSearchScreen>(find.byIcon(Icons.bookmark_rounded)),
        findsNothing,
        reason: 'the search row still shows the job as saved after the '
            'candidate removed it from the Saved tab',
      );
    },
  );
}
