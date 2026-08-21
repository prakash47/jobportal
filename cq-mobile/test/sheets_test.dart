import 'dart:async';
import 'dart:convert';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:cq_mobile/features/auth/presentation/verify_email_sheet.dart';
import 'package:cq_mobile/features/catalogs/data/catalog_models.dart';
import 'package:cq_mobile/features/jobs/data/job_filters.dart';
import 'package:cq_mobile/features/jobs/presentation/job_filters_sheet.dart';
import 'package:cq_mobile/features/reports/data/reports_repository.dart';
import 'package:cq_mobile/features/reports/presentation/report_job_sheet.dart';
import 'package:cq_mobile/shared/widgets/cq_buttons.dart';
import 'package:cq_mobile/shared/widgets/cq_chips.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Three bottom sheets nothing has ever mounted, each of them the last control
/// between a user and an outcome they cannot inspect afterwards.
///
/// **Job filters** decides which jobs exist. The sheet is the only way to reach
/// most of the facets, and the filter set it hands back is used twice — once for
/// the search, and again as the query saved into a job alert that then mails the
/// user for months. Every way this sheet can be wrong looks the same from the
/// outside: a control wired to the neighbouring field, a "Clear all" that clears
/// the chips but not the set that gets returned, or a dismissal that applies the
/// half-made selection anyway. In each case the user gets the wrong jobs and the
/// screen looks fine. job_filters_test.dart already pins how a [JobFilters]
/// serialises; nothing has ever driven the sheet that builds one.
///
/// **Report this job** is the user-generated-content control docs/DATA_SAFETY.md
/// cites in answer to a store content-rating question, so "it works" is a claim
/// already made in writing. It has to send the reason the user actually pointed
/// at, it has to confirm, and — the part only a bad day reveals — a refusal has
/// to leave the sheet standing with the words they typed still in it.
///
/// **Verify your email** is the wall a candidate hits when Apply is refused.
/// Transactional email is unconfigured server-side today, which makes this the
/// screen the largest share of real users would actually meet. Its two buttons
/// are the only ways past it: a resend that has to reach the version-NEUTRAL
/// `/auth/resend-verification` (a `/v1` prefix here is a 404, which the user
/// would read as "the email is on its way"), and a re-check that has to tell
/// "verified now" from "still not" from "I could not reach the server" —
/// collapsing the last two tells someone on a train they never clicked the link.

// ── The server ──────────────────────────────────────────────────────────────

class _Call {
  const _Call(this.method, this.path, this.body);

  final String method;
  final String path;

  /// The bytes actually handed to the socket, decoded. `RequestOptions.data`
  /// holds the map the repository passed in, captured before Dio's transformer
  /// runs, so it cannot tell a body that reached the server from one dropped on
  /// the way out.
  final String? body;

  String get signature => '$method $path';
}

class _Reply {
  const _Reply.ok([this.json = '{}']) : status = 200, silent = false;

  const _Reply.status(this.status) : json = '{}', silent = false;

  /// Accepted and never answered — the request is still in flight. A Completer
  /// rather than a delay, because a pending timer fails the test at teardown.
  const _Reply.silence() : status = 0, json = '{}', silent = true;

  final int status;
  final String json;
  final bool silent;
}

/// The API, scripted per request and recording every call in order.
class _Api implements HttpClientAdapter {
  _Api([_Reply Function(RequestOptions options)? script])
    : script = script ?? _alwaysOk;

  static _Reply _alwaysOk(RequestOptions options) => const _Reply.ok();

  final _Reply Function(RequestOptions options) script;
  final List<_Call> calls = [];

  List<String> get signatures => [for (final call in calls) call.signature];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls.add(
      _Call(
        options.method,
        options.path,
        requestStream == null
            ? null
            : utf8.decode(await requestStream.expand((c) => c).toList()),
      ),
    );
    final reply = script(options);
    if (reply.silent) return Completer<ResponseBody>().future;
    return ResponseBody.fromString(
      reply.json,
      reply.status,
      // Without the content-type Dio hands the repository a String and every
      // parser in this app silently reads garbage instead of failing loudly.
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// A phone with no signal — no HTTP response at all, which is a different case
/// from any status code and takes a different branch in all three sheets.
_Reply _noSignal(RequestOptions options) => throw DioException.connectionError(
  requestOptions: options,
  reason: 'no network',
);

// ── Harness ─────────────────────────────────────────────────────────────────

/// The caller's side of a sheet: what it handed back, and whether it has handed
/// anything back at all. [closed] is how a test tells "done" from "still open,
/// still arguing" — the distinction two of these sheets are entirely about.
class _Host {
  Object? result;
  int returns = 0;

  bool get closed => returns > 0;
}

const _phone = Size(390, 844);
const _openLabel = 'Open the sheet';

/// Mounts a real Riverpod scope over a faked transport and opens one sheet the
/// way a screen opens it — from a tap, on a context with a Navigator over it.
///
/// Overriding `dioProvider` alone reaches every repository (each is a
/// `FutureProvider` built from it) and keeps `cookieJarProvider`, and so
/// path_provider, out of the graph entirely.
Future<_Host> _mount(
  WidgetTester tester, {
  required _Api api,
  required Future<Object?> Function(BuildContext context, WidgetRef ref) show,
  AuthController Function()? auth,
}) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;
  final host = _Host();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWith((ref) async => dio),
        // Named as a builder rather than taken as a list of overrides because
        // riverpod does not export the `Override` type to name the parameter.
        if (auth != null) authControllerProvider.overrideWith(auth),
      ],
      child: MaterialApp(
        // Every sheet reads `context.cq`, the theme extension CqTheme registers;
        // a bare MaterialApp throws on the first build.
        theme: CqTheme.light,
        home: Consumer(
          builder: (context, ref, _) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async {
                  host.result = await show(context, ref);
                  host.returns++;
                },
                child: const Text(_openLabel),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await _openSheet(tester);
  return host;
}

Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.text(_openLabel));
  // Past the end of the entrance animation, so a later tap lands on a control
  // that has stopped moving.
  await _pumpFrames(tester, 30);
}

/// `pumpAndSettle` is not usable anywhere in this suite: CqLoader's brand
/// animation and CqPrimaryButton's spinner both repeat forever, so settling on
/// anything mid-flight never returns — and mid-flight is a state these tests
/// deliberately stop in.
Future<void> _pumpFrames(WidgetTester tester, [int frames = 20]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Dismisses the open sheet the way a thumb does — a tap on the dimmed strip
/// above it, which is the gesture that must NOT apply a half-made selection.
Future<void> _tapOutsideSheet(WidgetTester tester) async {
  await tester.tapAt(const Offset(195, 24));
  await _pumpFrames(tester, 40);
}

/// Scrolls [target] into view, building it first if the list has not reached it.
///
/// The filter sheet's body is a lazy ListView, so a section below the fold is
/// not in the tree at all: `ensureVisible` cannot reach it, and a plain
/// `find.text` reads "that control is missing" when it is merely further down.
Future<void> _bringIntoView(WidgetTester tester, Finder target) async {
  if (target.evaluate().isNotEmpty) {
    await tester.ensureVisible(target);
  } else {
    await tester.scrollUntilVisible(target, 140);
  }
  await tester.pump();
}

Finder _primary(String label) => find.widgetWithText(CqPrimaryButton, label);

/// Whether the button that was given [label] would DO anything if it were
/// tapped now.
///
/// Looked up by the label the button was constructed with rather than the one
/// it is rendering, because a CqPrimaryButton mid-flight replaces its text with
/// a spinner — [_primary] cannot find it at all then. And `loading` counts as
/// disabled: the spinner suppresses the tap while `onPressed` stays non-null,
/// so a send whose error path forgets to clear its flag would otherwise read as
/// armed while the button is in fact dead for good.
bool _armed(WidgetTester tester, String label) {
  final button = tester
      .widgetList<CqPrimaryButton>(find.byType(CqPrimaryButton))
      .singleWhere(
        (b) => b.label == label,
        orElse: () => throw StateError('no button labelled "$label" is up'),
      );
  return button.onPressed != null && !button.loading;
}

// ── Job filters: fixtures and helpers ───────────────────────────────────────

const _dartSkill = CatalogItem(id: 1, slug: 'dart', name: 'Dart');
const _kotlinSkill = CatalogItem(id: 2, slug: 'kotlin', name: 'Kotlin');
const _puneCity = CatalogItem(id: 9, slug: 'pune', name: 'Pune');
const _itIndustry = CatalogItem(id: 4, slug: 'it-services', name: 'IT Services');

/// A search with one of everything on — what comes back into the sheet when the
/// user reopens it over a filtered result list.
const _loadedFilters = JobFilters(
  skills: [_dartSkill],
  cities: [_puneCity],
  industry: _itIndustry,
  employmentTypes: {'FULL_TIME'},
  workModes: {'remote'},
  expMinYears: 2,
  expMaxYears: 5,
  minSalaryLpa: 10,
  postedWithin: 7,
);

/// `GET /v1/skills` with two rows, for the catalogue picker.
_Reply _catalogServer(RequestOptions options) => switch (options.path) {
  '/v1/skills' => const _Reply.ok(
    '{"hits":[{"id":1,"slug":"dart","name":"Dart"},'
    '{"id":2,"slug":"kotlin","name":"Kotlin"}],'
    '"total":2,"page":1,"pageSize":30}',
  ),
  _ => const _Reply.ok(),
};

/// Opens the filter sheet over [initial] and keeps whatever it returns, exactly
/// the way JobSearchScreen does (`if (r != null) setState(...)`). The returned
/// getter is the search the screen would now be running — so a dismissal has to
/// leave it alone rather than blanking it.
Future<(_Host, JobFilters Function())> _openFilters(
  WidgetTester tester, {
  JobFilters initial = const JobFilters(),
  _Api? api,
}) async {
  var current = initial;
  final host = await _mount(
    tester,
    api: api ?? _Api(),
    show: (context, ref) async {
      final next = await showJobFilters(context, current);
      if (next != null) current = next;
      return next;
    },
  );
  return (host, () => current);
}

/// The body of the one facet section titled [title] — the Column the sheet
/// wraps each facet in. Every control here has a twin one section away (three
/// identical year/salary dropdowns, an 'Add' chip under both Skills and
/// Cities), so a finder that is not scoped through this can read the
/// neighbour's value and call it a pass.
Finder _sectionBody(String title) =>
    find.ancestor(of: find.text(title), matching: find.byType(Column)).first;

Future<void> _tapFilterChip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(CqChip, label);
  await _bringIntoView(tester, chip);
  await tester.tap(chip);
  await _pumpFrames(tester, 10);
}

bool _filterChipOn(WidgetTester tester, String label) =>
    tester.widget<CqChip>(find.widgetWithText(CqChip, label)).selected;

Future<void> _applyFilters(WidgetTester tester) async {
  await tester.tap(_primary('Show results'));
  await _pumpFrames(tester, 40);
  // Proof the tap landed before anything reads the result. A tap that missed
  // leaves the caller holding the filter set it started with — which for a
  // test that started from an empty one is indistinguishable from a correct
  // empty answer.
  expect(
    find.text('Filters'),
    findsNothing,
    reason: 'Show results did not close the sheet',
  );
}

/// Opens the dropdown currently displaying [showing] and picks [choose].
///
/// A closed DropdownButton keeps every option in the tree behind the one it
/// displays, offstage — so the count check is what proves a menu actually
/// opened, rather than the tap landing on nothing and this walking on. `.last`
/// is then the copy inside the menu: it is pushed as a route above the sheet,
/// so it comes last in tree order.
Future<void> _pickFromDropdown(
  WidgetTester tester, {
  required String showing,
  required String choose,
}) async {
  final closed = find.text(showing);
  expect(closed, findsOneWidget, reason: 'no dropdown is showing "$showing"');
  await _bringIntoView(tester, closed);
  final before = find.text(choose).evaluate().length;
  await tester.tap(closed);
  await _pumpFrames(tester, 40);

  final options = find.text(choose);
  expect(
    options.evaluate().length,
    greaterThan(before),
    reason: 'tapping "$showing" opened no menu containing "$choose"',
  );
  await tester.tap(options.last);
  await _pumpFrames(tester, 40);
}

// ── Report a job: fixtures and helpers ──────────────────────────────────────

const _jobId = 42;
const _reportDetails = 'Asks for a registration fee before the interview.';

Future<_Host> _openReport(WidgetTester tester, _Api api) => _mount(
  tester,
  api: api,
  show: (context, ref) async {
    await showReportJobSheet(
      context,
      ref,
      jobId: _jobId,
      jobTitle: 'Flutter Engineer',
    );
    return null;
  },
);

Future<void> _chooseReason(WidgetTester tester, String label) async {
  final tile = find.widgetWithText(RadioListTile<ReportReason>, label);
  await tester.ensureVisible(tile);
  await tester.tap(tile);
  await _pumpFrames(tester, 10);
}

Future<void> _sendReport(WidgetTester tester) async {
  final button = _primary('Send report');
  await tester.ensureVisible(button);
  await tester.tap(button);
  await _pumpFrames(tester, 40);
}

// ── Verify email: fixtures and helpers ──────────────────────────────────────

const _seekerEmail = 'seeker@careerqueue.app';

String _meBody({required bool verified}) =>
    '{"user":{"id":7,"email":"$_seekerEmail","name":"Seeker",'
    '"role":"CANDIDATE","emailVerified":$verified}}';

/// Puts the app in a fixed auth state with no session probe and no splash hold.
/// Only `build` is replaced — `refreshUser`, the method this sheet's re-check
/// runs on, stays the real thing and goes to the faked server.
class _FixedAuth extends AuthController {
  @override
  AuthState build() => const AuthAuthenticated(
    AuthUser(
      id: 7,
      email: _seekerEmail,
      name: 'Seeker',
      role: 'CANDIDATE',
      emailVerified: false,
    ),
  );
}

/// Answers the platform keystore SessionCache writes the confirmed user into.
///
/// `refreshUser` awaits that write before it publishes anything, and a method
/// channel with nobody on the other end never answers under a widget test's
/// clock — so without this the re-check hangs and every assertion below it
/// would be about a sheet frozen mid-tap rather than about what it decided.
void _fakeKeystore() {
  const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final store = <String, String>{};
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(channel, (call) async {
    final key = call.arguments is Map ? call.arguments['key'] as String? : null;
    switch (call.method) {
      case 'write':
        if (key != null) store[key] = call.arguments['value'] as String? ?? '';
        return null;
      case 'read':
        return key == null ? null : store[key];
      case 'containsKey':
        return key != null && store.containsKey(key);
      case 'delete':
        store.remove(key);
        return null;
      case 'readAll':
        return store;
      case 'deleteAll':
        store.clear();
        return null;
    }
    return null;
  });
  addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
}

Future<_Host> _openVerify(WidgetTester tester, _Api api) {
  _fakeKeystore();
  return _mount(
    tester,
    api: api,
    auth: _FixedAuth.new,
    show: (context, ref) => showVerifyEmailSheet(
      context,
      ref,
      email: _seekerEmail,
      reason: 'You need a verified email address to apply for this job.',
    ),
  );
}

Finder get _resendButton =>
    find.widgetWithText(OutlinedButton, 'Send the email again');

Future<void> _tapResend(WidgetTester tester) async {
  await tester.tap(_resendButton);
  await _pumpFrames(tester, 40);
}

Future<void> _tapRecheck(WidgetTester tester) async {
  await tester.tap(_primary("I've verified it"));
  await _pumpFrames(tester, 40);
}

void main() {
  group('job filters sheet', () {
    testWidgets('offers a control for every facet a search can carry', (
      tester,
    ) async {
      await _openFilters(tester);

      // In layout order, because the list is lazy: each section is checked
      // while it is on screen, before scrolling past it to the next.
      const facets = <String, List<String>>{
        'Skills': [],
        'Cities': [],
        'Industry': [],
        'Employment type': [
          'Full-time',
          'Part-time',
          'Contract',
          'Internship',
        ],
        'Work mode': ['On-site', 'Hybrid', 'Remote'],
        'Experience': [],
        'Minimum salary': [],
        'Date posted': ['Last 24 hours', 'Last 7 days', 'Last 30 days'],
      };
      // The control that reaches a facet with no chips of its own. A heading
      // with nothing under it is exactly the failure this test is for, and the
      // heading is the half that survives a control being dropped.
      final reachedBy = <String, Finder>{
        'Skills': find.widgetWithText(ActionChip, 'Add'),
        'Cities': find.widgetWithText(ActionChip, 'Add'),
        'Industry': find.widgetWithText(ActionChip, 'Select'),
        'Experience': find.byType(DropdownButton<int?>),
        'Minimum salary': find.byType(DropdownButton<int?>),
      };
      for (final facet in facets.entries) {
        await _bringIntoView(tester, find.text(facet.key));
        expect(
          find.text(facet.key),
          findsOneWidget,
          reason: '"${facet.key}" can be searched on but not chosen here',
        );
        final control = reachedBy[facet.key];
        if (control != null) {
          expect(
            find.descendant(of: _sectionBody(facet.key), matching: control),
            findsWidgets,
            reason: '"${facet.key}" is a heading with nothing under it that '
                'sets it',
          );
        }
        for (final option in facet.value) {
          expect(
            find.widgetWithText(CqChip, option),
            findsOneWidget,
            reason: '"$option" is a value the server accepts and the sheet '
                'does not offer',
          );
        }
      }
      expect(_primary('Show results'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Clear all'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('applying hands back exactly the facets that were tapped', (
      tester,
    ) async {
      final (host, current) = await _openFilters(tester);

      await _tapFilterChip(tester, 'Full-time');
      await _tapFilterChip(tester, 'Remote');
      await _tapFilterChip(tester, 'Last 7 days');
      await _applyFilters(tester);

      expect(host.closed, isTrue, reason: 'the sheet did not close on apply');
      // The query is what the server sees, and the only place a mis-wired
      // control shows up: a work mode written into `emp`, or the frozen URL
      // spelling swapped for the enum, changes nothing on screen.
      expect(current().toQuery(), {
        'emp': ['FULL_TIME'],
        'mode': ['remote'],
        'postedWithin': 7,
      });
      expect(tester.takeException(), isNull);
    });

    testWidgets('every job-type and work-mode chip sends the spelling the '
        'server filters on', (tester) async {
      final (_, current) = await _openFilters(tester);

      for (final label in [
        'Full-time',
        'Part-time',
        'Contract',
        'Internship',
        'On-site',
        'Hybrid',
        'Remote',
      ]) {
        await _tapFilterChip(tester, label);
      }
      await _applyFilters(tester);

      // The sheet holds its own copy of these spellings, and /v1/jobs takes
      // `emp` and `mode` as free strings and DROPS anything it does not
      // recognise rather than answering 400 (public-jobs/dto.ts). So a chip
      // labelled correctly and spelled wrong — CONTRACT for CONTRACTOR, ONSITE
      // for on-site — is not an error anywhere: it is a filter the user can see
      // switched on that the search quietly ignores. Only FULL_TIME and remote
      // are exercised anywhere else in this suite.
      final query = current().toQuery();
      expect(
        query['emp'],
        unorderedEquals(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN']),
      );
      expect(
        query['mode'],
        unorderedEquals(['on-site', 'hybrid', 'remote']),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('reopening shows the search the user is already looking at', (
      tester,
    ) async {
      final (_, current) = await _openFilters(tester);

      await _tapFilterChip(tester, 'Part-time');
      await _tapFilterChip(tester, 'Hybrid');
      await _tapFilterChip(tester, 'Last 30 days');
      await _applyFilters(tester);
      await _openSheet(tester);

      // Seeding is the whole contract of reopening: a sheet that opens blank
      // over a filtered search invites the user to re-tick what is already on,
      // and the second apply then means something different from the first.
      expect(_filterChipOn(tester, 'Part-time'), isTrue);
      expect(_filterChipOn(tester, 'Hybrid'), isTrue);
      await _bringIntoView(tester, find.widgetWithText(CqChip, 'Last 30 days'));
      expect(_filterChipOn(tester, 'Last 30 days'), isTrue);
      // And nothing the user never chose came on with them.
      expect(_filterChipOn(tester, 'Last 7 days'), isFalse);
      expect(current().activeCount, 3);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a seeded sheet shows the picked and typed facets too', (
      tester,
    ) async {
      await _openFilters(tester, initial: _loadedFilters);

      expect(find.widgetWithText(InputChip, 'Dart'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'Pune'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'IT Services'), findsOneWidget);

      await _bringIntoView(tester, find.text('Experience'));
      // Read off the controls, not the rendered text: once a bound is set the
      // dropdown shows a bare "2 yrs" with nothing on it saying which bound it
      // is, so the two are told apart only by the control they sit in. Scoped
      // to the Experience section because Minimum salary below it is a
      // DropdownButton<int?> as well. Min and Max swapped would send a
      // two-year search out as a five-year floor, sheet still looking right.
      final bounds = tester
          .widgetList<DropdownButton<int?>>(
            find.descendant(
              of: _sectionBody('Experience'),
              matching: find.byType(DropdownButton<int?>),
            ),
          )
          .toList();
      expect(bounds, hasLength(2), reason: 'Experience is not two bounds');
      expect(bounds[0].value, 2, reason: 'the Min bound is not the min');
      expect(bounds[1].value, 5, reason: 'the Max bound is not the max');

      await _bringIntoView(tester, find.text('Minimum salary'));
      expect(find.text('₹10 LPA+'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('dismissing keeps the old search instead of applying a '
        'half-made one', (tester) async {
      final (host, current) = await _openFilters(
        tester,
        initial: _loadedFilters,
      );

      // A selection made and then abandoned — the case where "hand back the
      // current state" and "hand back nothing" differ.
      await _tapFilterChip(tester, 'Part-time');
      await _tapOutsideSheet(tester);

      expect(find.text('Filters'), findsNothing, reason: 'the sheet stayed up');
      expect(
        host.result,
        isNull,
        reason: 'a dismissed sheet must hand back nothing, so the caller can '
            'tell it from an empty filter set the user actually chose',
      );
      expect(current().toQuery(), _loadedFilters.toQuery());
      expect(tester.takeException(), isNull);
    });

    testWidgets('date posted is one choice, not three', (tester) async {
      final (_, current) = await _openFilters(tester);

      await _tapFilterChip(tester, 'Last 24 hours');
      await _tapFilterChip(tester, 'Last 7 days');

      // The API takes a single postedWithin, so two lit chips would be a lie
      // about what is being searched.
      expect(_filterChipOn(tester, 'Last 7 days'), isTrue);
      expect(_filterChipOn(tester, 'Last 24 hours'), isFalse);

      // Tapping the lit one turns the facet off rather than re-selecting it —
      // the only way back to "any date" short of Clear all.
      await _tapFilterChip(tester, 'Last 7 days');
      expect(_filterChipOn(tester, 'Last 7 days'), isFalse);

      await _applyFilters(tester);
      expect(current().toQuery(), isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Clear all empties the returned filter set, not just the chips',
        (tester) async {
      final (_, current) = await _openFilters(
        tester,
        initial: _loadedFilters,
      );

      await tester.tap(find.widgetWithText(TextButton, 'Clear all'));
      await _pumpFrames(tester, 20);

      expect(find.widgetWithText(InputChip, 'Dart'), findsNothing);
      expect(find.widgetWithText(InputChip, 'Pune'), findsNothing);
      expect(find.widgetWithText(InputChip, 'IT Services'), findsNothing);
      expect(_filterChipOn(tester, 'Full-time'), isFalse);
      expect(_filterChipOn(tester, 'Remote'), isFalse);
      await _bringIntoView(tester, find.text('Experience'));
      expect(find.text('Min (any)'), findsOneWidget);
      expect(find.text('Max (any)'), findsOneWidget);

      await _applyFilters(tester);
      // The assertion that matters: a Clear that only repaints leaves the
      // search running on the facets the user just watched disappear.
      expect(current().toQuery(), isEmpty);
      expect(current().isEmpty, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a skill picked from the catalogue travels back as its slug', (
      tester,
    ) async {
      final api = _Api(_catalogServer);
      final (_, current) = await _openFilters(tester, api: api);

      // The 'Add' under Skills; Cities has one too, and Industry says 'Select'.
      final addSkill = find.descendant(
        of: _sectionBody('Skills'),
        matching: find.widgetWithText(ActionChip, 'Add'),
      );
      expect(
        addSkill,
        findsOneWidget,
        reason: "unscoped, this would also match the Cities section's Add — "
            'which opens a different catalogue and still ends in a chip',
      );
      await tester.tap(addSkill);
      await _pumpFrames(tester, 40);

      await tester.tap(find.widgetWithText(ListTile, 'Kotlin'));
      await _pumpFrames(tester, 10);
      await tester.tap(find.text('Done (1)'));
      await _pumpFrames(tester, 40);

      expect(
        find.widgetWithText(InputChip, 'Kotlin'),
        findsOneWidget,
        reason: 'the picker returned a skill the filter sheet did not keep',
      );
      await _applyFilters(tester);

      expect(
        api.signatures,
        contains('GET /v1/skills'),
        reason: 'the catalogues live on the /v1 half of the API; a neutral '
            'path 404s and the picker shows an empty list instead',
      );
      // Slugs, not catalogue ids: /v1/jobs matches on slug and would drop an id
      // silently, returning an unfiltered search.
      expect(current().toQuery()['skill'], ['kotlin']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('removing one chip leaves the rest of the search alone', (
      tester,
    ) async {
      final (_, current) = await _openFilters(
        tester,
        initial: const JobFilters(
          skills: [_dartSkill, _kotlinSkill],
          cities: [_puneCity],
          employmentTypes: {'FULL_TIME'},
        ),
      );

      final dart = find.widgetWithText(InputChip, 'Dart');
      await _bringIntoView(tester, dart);
      // The chip's only icon is its remove affordance — these chips carry no
      // avatar — and its glyph is a Material default that has changed between
      // versions, so the icon is found by being the one there rather than by
      // the code point it happens to use today.
      await tester.tap(find.descendant(of: dart, matching: find.byType(Icon)));
      await _pumpFrames(tester, 20);
      await _applyFilters(tester);

      final query = current().toQuery();
      expect(query['skill'], ['kotlin'], reason: 'the wrong skill came off');
      expect(query['city'], ['pune']);
      expect(query['emp'], ['FULL_TIME']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the number pickers fill the fields they are labelled with', (
      tester,
    ) async {
      final (_, current) = await _openFilters(tester);

      await _pickFromDropdown(tester, showing: 'Min (any)', choose: '2 yrs');
      await _pickFromDropdown(tester, showing: 'Max (any)', choose: '5 yrs');
      await _pickFromDropdown(tester, showing: 'Any', choose: '₹10 LPA+');
      await _applyFilters(tester);

      final query = current().toQuery();
      expect(query['expMin'], 2);
      expect(query['expMax'], 5);
      // Picked in LPA, sent in paise. The sheet is the only place the user ever
      // sees the LPA number, so a unit mix-up is invisible until the results
      // are.
      expect(query['salaryMin'], 100000000);
      expect(tester.takeException(), isNull);
    });

  });

  group('report job sheet', () {
    testWidgets('offers every reason the server accepts, with none of them '
        'preselected', (tester) async {
      await _openReport(tester, _Api());

      for (final reason in ReportReason.values) {
        // A reason missing from the sheet is a report that cannot be filed at
        // all — the server's enum is the list of things worth telling us.
        expect(
          find.text(reason.label),
          findsOneWidget,
          reason: '${reason.wire} cannot be reported from the app',
        );
      }
      expect(
        _armed(tester, 'Send report'),
        isFalse,
        reason: 'Send is live before a reason is chosen; the server requires '
            'one, so that tap can only end in a 400 the reporter did not earn',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('sends the reason that was chosen and the words that were '
        'typed', (tester) async {
      final api = _Api();
      await _openReport(tester, api);

      await _chooseReason(tester, 'Misleading or inaccurate');
      await tester.enterText(find.byType(TextField), _reportDetails);
      await _pumpFrames(tester, 10);
      expect(_armed(tester, 'Send report'), isTrue);
      await _sendReport(tester);

      expect(api.signatures, ['POST /v1/reports']);
      // Decoded off the bytes and compared whole: the DTO is .strict(), so an
      // extra key is a 400, and the wire spelling is the server's enum value —
      // not the label the user read.
      expect(jsonDecode(api.calls.single.body!), {
        'targetType': 'JOB',
        'jobId': _jobId,
        'reason': 'MISLEADING',
        'details': _reportDetails,
      });
      expect(tester.takeException(), isNull);
    });

    testWidgets('a report that lands confirms, and Done closes the sheet', (
      tester,
    ) async {
      final host = await _openReport(tester, _Api());

      await _chooseReason(tester, 'Fake or a scam');
      await _sendReport(tester);

      expect(find.text('Thanks for telling us'), findsOneWidget);
      expect(
        find.text('Report this job'),
        findsNothing,
        reason: 'the form is still up, so the reporter cannot tell whether it '
            'sent and will send it again',
      );
      await tester.tap(_primary('Done'));
      await _pumpFrames(tester, 40);

      expect(host.closed, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a refused report keeps the sheet, the reason and the typed '
        'words', (tester) async {
      // 503 is the moderation flag being off — an operator action, and the
      // refusal most likely to be waiting when this ships.
      var status = 503;
      final api = _Api((options) => _Reply.status(status));
      final host = await _openReport(tester, api);

      await _chooseReason(tester, 'Discriminatory');
      await tester.enterText(find.byType(TextField), _reportDetails);
      await _sendReport(tester);

      expect(
        host.closed,
        isFalse,
        reason: 'the sheet closed over a report that was never filed',
      );
      expect(
        find.text(
          'Reporting is unavailable right now. Please try again later.',
        ),
        findsOneWidget,
        reason: "the server's reason was swallowed",
      );
      // Nothing the reporter did was thrown away, so the retry is one tap and
      // not a re-typed paragraph.
      expect(find.widgetWithText(TextField, _reportDetails), findsOneWidget);
      expect(_armed(tester, 'Send report'), isTrue);

      status = 200;
      await _sendReport(tester);
      expect(api.signatures, ['POST /v1/reports', 'POST /v1/reports']);
      // Still on screen is not the same as still being sent. This is the half
      // that reaches the moderation queue.
      expect(
        jsonDecode(api.calls.last.body!),
        {
          'targetType': 'JOB',
          'jobId': _jobId,
          'reason': 'DISCRIMINATORY',
          'details': _reportDetails,
        },
        reason: 'the retry filed something other than what the reporter chose '
            'and typed before the refusal',
      );
      expect(find.text('Thanks for telling us'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a network that never answered is reported, not left as a '
        'spinner', (tester) async {
      final host = await _openReport(tester, _Api(_noSignal));

      await _chooseReason(tester, 'Something else');
      await _sendReport(tester);

      expect(host.closed, isFalse);
      // Named rather than just "an error row appeared": the failure worth
      // catching is the sheet putting the raw DioException on screen, which
      // has an icon next to it too.
      expect(
        find.text(
          "Can't reach the server. Check your connection and try again.",
        ),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
      expect(_armed(tester, 'Send report'), isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('"you already reported this" reads as thanks, not as red', (
      tester,
    ) async {
      // 409 is the server enforcing one open report per person. From where the
      // reporter sits they did the right thing and it landed the first time; an
      // error here would read as "it did not send" and invite a third.
      await _openReport(
        tester,
        _Api((options) => const _Reply.status(409)),
      );

      await _chooseReason(tester, 'Duplicate posting');
      await _sendReport(tester);

      expect(find.text('Thanks for telling us'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline_rounded), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a report in flight cannot be sent twice', (tester) async {
      final api = _Api((options) => const _Reply.silence());
      await _openReport(tester, api);

      await _chooseReason(tester, 'Offensive content');
      await _sendReport(tester);
      // The label is replaced by a spinner while it sends, so the second tap
      // goes to where the button still is rather than to its text.
      await tester.tap(find.byType(CqPrimaryButton));
      await _pumpFrames(tester, 20);

      expect(
        api.signatures,
        ['POST /v1/reports'],
        reason: 'an impatient double tap filed two reports, the second of '
            'which the server answers with its 409 duplicate refusal',
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('verify email sheet', () {
    testWidgets('resend posts to the version-neutral /auth path and says it '
        'went', (tester) async {
      final api = _Api();
      await _openVerify(tester, api);

      expect(find.text(_seekerEmail), findsOneWidget);
      await _tapResend(tester);

      // /auth/* is version-neutral while /v1 carries the public routes. A /v1
      // prefix here 404s, and the sheet would report the 404 as a failure the
      // user can do nothing about.
      expect(api.signatures, ['POST /auth/resend-verification']);
      expect(
        find.text('Sent. Check your inbox — and your spam folder.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a 429 is reported as wait-a-minute, not as a send', (
      tester,
    ) async {
      final api = _Api((options) => const _Reply.status(429));
      final host = await _openVerify(tester, api);

      await _tapResend(tester);

      // The rate limit IS the cooldown — nothing on the client throttles a
      // second tap once the first has finished, so this message is all that
      // stands between the user and a silently dropped resend.
      expect(
        find.text(
          'An email was just sent. Please wait a minute before asking again.',
        ),
        findsOneWidget,
      );
      expect(
        find.text('Sent. Check your inbox — and your spam folder.'),
        findsNothing,
        reason: 'a refused resend was reported as a sent one, so the user '
            'waits for an email that is not coming',
      );
      expect(host.closed, isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a resend that fails outright is reported, not swallowed', (
      tester,
    ) async {
      final host = await _openVerify(tester, _Api(_noSignal));

      await _tapResend(tester);

      // The sentence, not just the red icon — on the one screen standing
      // between a candidate and applying, "DioException [connection error]"
      // would satisfy an icon-only assertion.
      expect(
        find.text(
          "Can't reach the server. Please check your connection and try again.",
        ),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.error_outline_rounded), findsOneWidget);
      expect(
        find.text('Sent. Check your inbox — and your spam folder.'),
        findsNothing,
      );
      expect(host.closed, isFalse);
      // Still offered: a failed send the user cannot retry is a dead end on the
      // one screen standing between them and applying.
      expect(
        tester.widget<OutlinedButton>(_resendButton).onPressed,
        isNotNull,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a resend in flight locks both buttons', (tester) async {
      final api = _Api((options) => const _Reply.silence());
      await _openVerify(tester, api);

      await _tapResend(tester);

      expect(find.text('Sending…'), findsOneWidget);
      final button = find.byType(OutlinedButton);
      expect(tester.widget<OutlinedButton>(button).onPressed, isNull);
      // The re-check is locked too, and has to be: it pops the sheet on
      // success, which would tear the in-flight resend's setState out from
      // under it.
      expect(_armed(tester, "I've verified it"), isFalse);

      await tester.tap(button);
      await tester.tap(_primary("I've verified it"));
      await _pumpFrames(tester, 20);

      expect(api.signatures, ['POST /auth/resend-verification']);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the re-check re-reads the session and closes with true once '
        'the address is verified', (tester) async {
      final api = _Api((options) => _Reply.ok(_meBody(verified: true)));
      final host = await _openVerify(tester, api);

      await _tapRecheck(tester);

      // The verification link opens the website, so the server is the only
      // place that knows. Re-reading a cached user would leave the candidate
      // tapping a button that can never change its mind.
      expect(api.signatures, ['GET /auth/me']);
      expect(host.closed, isTrue);
      expect(
        host.result,
        isTrue,
        reason: 'the caller resumes the interrupted apply on this value; false '
            'here means the candidate verified their email and still got '
            'nothing',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('still unverified keeps the sheet open and says what to do', (
      tester,
    ) async {
      final api = _Api((options) => _Reply.ok(_meBody(verified: false)));
      final host = await _openVerify(tester, api);

      await _tapRecheck(tester);

      expect(
        find.text(
          'Not verified yet. Open the link in the email, then check again.',
        ),
        findsOneWidget,
      );
      expect(
        host.closed,
        isFalse,
        reason: 'closing here hands the caller a false and drops the user back '
            'into the refusal they came from, with no explanation',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('an unreachable server is not reported as "still unverified"', (
      tester,
    ) async {
      final host = await _openVerify(tester, _Api(_noSignal));

      await _tapRecheck(tester);

      // Telling someone with no signal that they did not click the link sends
      // them back to an inbox to re-click a link that already worked.
      expect(
        find.text(
          'Could not reach the server. Check your connection and try again.',
        ),
        findsOneWidget,
      );
      expect(host.closed, isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a session the server has already ended is reported as a '
        'connection problem', (tester) async {
      // Current behaviour, asserted as it stands rather than as it should be.
      // `refreshUser` returns null for both "no session" and "could not reach
      // the server", so a 401 — the server answering clearly — reaches the user
      // as advice about their connection, while the app stays signed in behind
      // the sheet. Reported, not fixed: the fix belongs in lib/.
      final host = await _openVerify(
        tester,
        _Api((options) => const _Reply.status(401)),
      );

      await _tapRecheck(tester);

      expect(
        find.text(
          'Could not reach the server. Check your connection and try again.',
        ),
        findsOneWidget,
      );
      expect(host.closed, isFalse);
      expect(tester.takeException(), isNull);
    });
  });
}
