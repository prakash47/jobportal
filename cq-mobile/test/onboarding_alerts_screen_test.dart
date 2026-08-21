import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/router/app_router.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/alerts/presentation/alert_editor_screen.dart';
import 'package:cq_mobile/features/alerts/presentation/alerts_screen.dart';
import 'package:cq_mobile/features/auth/application/auth_controller.dart';
import 'package:cq_mobile/features/auth/data/auth_user.dart';
import 'package:cq_mobile/features/onboarding/presentation/onboarding_screen.dart';
import 'package:cq_mobile/features/onboarding/presentation/steps/education_step.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Onboarding is the first thing that happens to a brand-new account — and to
/// a store reviewer, who registers and is dropped straight into this wizard.
/// Nothing in the suite had ever mounted it. The same was true of the alerts
/// tab, which is the only screen in the app where a seeker can delete
/// something.
///
/// What is at risk on these screens is not layout. It is the writes:
///
///  * The wizard collects six things across three steps and sends them to
///    three different routes. A step that shows its fields, accepts typing and
///    then quietly sends nothing looks identical on a device to one that
///    works — the wizard advances either way, and the candidate finds out
///    weeks later when no recruiter can see their experience.
///  * Both salary fields are pickers in *lakhs per annum* over an API that
///    stores *paise*. They were free-text rupee boxes once, and a candidate
///    who typed 12 meaning 12 LPA saved a current salary of twelve rupees.
///    Worse, the picker only offers whole lakhs, so a stored ₹8,50,000 shows
///    as "₹9 LPA" — re-saving a field the candidate never touched must not
///    round their salary up by fifty thousand rupees behind their back.
///  * Education is the one step that can be saved twice. It POSTs, keeps the
///    id it gets back, and must PATCH that id on a re-save. Losing the id
///    means the same degree listed twice on the profile, which the candidate
///    has to spot and delete by hand from a screen they have not seen yet.
///  * Every step is advertised as skippable, and "Skip for now" as a way out
///    of the whole wizard. If either one saves a half-filled step on the way
///    past, it records data the candidate declined to give.
///  * On the alerts side, an edit merges over the saved query. That query
///    holds filters the app has no controls for (the website sets them), so a
///    save that rebuilt the map instead of merging would throw away the
///    seeker's saved search the first time they renamed an alert — and a
///    cleared keyword box that failed to *remove* its key is a search they can
///    never widen again.
///
/// Everything asserted below is either something the candidate can see or
/// something the server would receive. The request shapes for these routes are
/// pinned in the repository contract tests; what is pinned here is that the
/// screen sends the right thing at the right moment, and only then.

// ── The fake server ─────────────────────────────────────────────────────────

/// Records every request and answers from a subclass's route table.
///
/// Assertions read [bodies] — the bytes actually handed to the socket — never
/// `RequestOptions.data`, which is the map the caller passed in before Dio's
/// transformer ran and so cannot tell a body that reaches the server from one
/// that gets dropped on the way out.
abstract class _RecordingApi implements HttpClientAdapter {
  final List<RequestOptions> seen = [];
  final List<String?> bodies = [];

  /// 'PATCH /me/profile', in call order.
  List<String> get calls => [for (final o in seen) '${o.method} ${o.path}'];

  /// Everything that was not a read — what a "nothing was saved" claim is about.
  List<String> get writes => [
    for (final c in calls)
      if (!c.startsWith('GET ')) c,
  ];

  /// Every body sent to [call], oldest first.
  List<Map<String, dynamic>> bodiesOf(String call) => [
    for (var i = 0; i < seen.length; i++)
      if ('${seen[i].method} ${seen[i].path}' == call)
        jsonDecode(bodies[i] ?? '{}') as Map<String, dynamic>,
  ];

  /// The last body sent to [call]. Fails naming what was sent instead, because
  /// a bare "No element" three frames later says nothing useful.
  Map<String, dynamic> bodyOf(String call) {
    final all = bodiesOf(call);
    if (all.isEmpty) fail('The app never sent $call. It sent: $calls');
    return all.last;
  }

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
    return respond(options);
  }

  Future<ResponseBody> respond(RequestOptions options);

  @override
  void close({bool force = false}) {}
}

/// A transport whose requests never answer — the screen is stuck mid-load. A
/// Completer rather than a delay: a pending timer fails the test at teardown.
class _Hanging extends _RecordingApi {
  @override
  Future<ResponseBody> respond(RequestOptions options) =>
      Completer<ResponseBody>().future;
}

/// The seeker profile endpoints the wizard writes through.
class _ProfileApi extends _RecordingApi {
  _ProfileApi({this.candidate = const <String, dynamic>{}});

  /// The `candidate` half of `GET /me/profile`. A brand-new account has it
  /// empty; the salary cases seed it to reopen a value that was already saved.
  final Map<String, dynamic> candidate;

  /// How many profile loads still fail before the network comes back.
  int failingLoads = 0;

  int _nextEducationId = 55;

  /// Only the routes the wizard itself writes through — so a "nothing was
  /// saved" assertion still means something when it runs against the whole
  /// app, where the tab shell behind the wizard issues writes of its own.
  List<String> get profileWrites => [
    for (final c in writes)
      if (c.contains('/me/profile') ||
          c.contains('/me/skills') ||
          c.contains('/me/education'))
        c,
  ];

  @override
  Future<ResponseBody> respond(RequestOptions options) async {
    if (options.path == '/me/profile' && options.method == 'GET') {
      if (failingLoads > 0) {
        failingLoads -= 1;
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'no network',
        );
      }
      // Two nested objects, not one flat one: a flat fixture parses to a
      // profile with nothing in it, and every prefill assertion below would be
      // comparing an empty form against an empty form.
      return _json({
        'user': {'name': 'Asha Nair', 'email': 'asha@example.com'},
        'candidate': candidate,
      });
    }
    if (options.path == '/me/education' && options.method == 'POST') {
      return _json({'id': _nextEducationId++}, 201);
    }
    // The last step and the tab shell decorate themselves from side-calls
    // these tests never look at, and every model treats every field as
    // optional, so an empty object leaves them blank instead of throwing.
    return _json(const <String, dynamic>{});
  }
}

/// `/me/alerts`, holding the list so a delete or a pause is observable in the
/// next GET rather than assumed.
class _AlertsApi extends _RecordingApi {
  _AlertsApi([List<Map<String, dynamic>> seed = const []]) : alerts = [...seed];

  final List<Map<String, dynamic>> alerts;

  /// How many list loads still fail before the network comes back.
  int failingLoads = 0;

  int _nextId = 100;

  @override
  Future<ResponseBody> respond(RequestOptions options) async {
    final path = options.path;
    if (path == '/me/alerts') {
      if (options.method == 'GET') {
        if (failingLoads > 0) {
          failingLoads -= 1;
          throw DioException.connectionError(
            requestOptions: options,
            reason: 'no network',
          );
        }
        return _json(alerts);
      }
      if (options.method == 'POST') {
        final body = (options.data as Map).cast<String, dynamic>();
        alerts.add({...body, 'id': _nextId++});
        return _json(alerts.last, 201);
      }
    }
    if (path.startsWith('/me/alerts/')) {
      final id = int.tryParse(path.substring('/me/alerts/'.length));
      final at = alerts.indexWhere((a) => a['id'] == id);
      if (at >= 0 && options.method == 'PATCH') {
        alerts[at] = {
          ...alerts[at],
          ...(options.data as Map).cast<String, dynamic>(),
        };
        return _json(alerts[at]);
      }
      if (at >= 0 && options.method == 'DELETE') {
        alerts.removeAt(at);
        return _json(const <String, dynamic>{});
      }
    }
    // A mutation aimed anywhere else is a 404, never a polite empty object. An
    // id sent in the body instead of the path has shipped in this app before,
    // and answering it politely would hide the same mistake again.
    return _json({'message': 'No route for ${options.method} $path'}, 404);
  }
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

// ── Mounting ────────────────────────────────────────────────────────────────

const _phone = Size(390, 844);

/// A viewport tall enough to lay a whole wizard step out at once. `tester.tap`
/// only reaches what is on screen, and these steps are long forms; scrolling
/// between every field would exercise the scroll view rather than the step.
const _tallPhone = Size(390, 1800);

Future<void> _mount(
  WidgetTester tester,
  Widget screen,
  HttpClientAdapter api, {
  Size size = _phone,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  // Overriding dioProvider alone fakes the whole data layer — every repository
  // is a FutureProvider built from it — and keeps cookieJarProvider out of the
  // graph, which would otherwise reach path_provider and throw.
  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(theme: CqTheme.light, home: screen),
    ),
  );
  await tester.pump();
}

/// Advances frames until a load chain (provider → repository → request →
/// setState) and the wizard's 220ms page slide have both landed.
///
/// `pumpAndSettle` is not available here: CqLoader's brand animation repeats
/// forever, so settling on a screen that is still loading never returns.
Future<void> _settle(WidgetTester tester, [int frames = 40]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Pumps until [ready] holds, and says what it was waiting for if it never
/// does. Used for the two hops through the real router, where a fixed frame
/// budget would land mid-transition with both screens on stage at once.
Future<void> _pumpUntil(
  WidgetTester tester,
  String what,
  bool Function() ready,
) async {
  for (var frame = 0; frame < 250; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
    if (ready()) return;
  }
  fail('Waited about four seconds of frames for $what. It never happened.');
}

/// Opens the wizard on a candidate whose saved profile is [candidate].
Future<_ProfileApi> _openWizard(
  WidgetTester tester, {
  Map<String, dynamic> candidate = const <String, dynamic>{},
}) async {
  final api = _ProfileApi(candidate: candidate);
  await _mount(tester, const OnboardingScreen(), api, size: _tallPhone);
  await _settle(tester);
  return api;
}

const _newUser = AuthUser(
  id: 12,
  email: 'asha@example.com',
  name: 'Asha Nair',
  role: 'CANDIDATE',
  emailVerified: true,
);

/// The state the app is in the instant registration succeeds: signed in, and
/// flagged as new, which is what makes the router's redirect choose the wizard.
class _JustRegistered extends AuthController {
  @override
  AuthState build() => const AuthAuthenticated(_newUser, justRegistered: true);
}

/// Launches the real app the way a just-registered account launches it: the
/// real router at its real initial location, with only the transport and the
/// session faked. Needed for the two exits out of the wizard, which are
/// `context.go` calls — a directly-mounted screen has no router to answer them.
Future<void> _launchAfterRegistration(
  WidgetTester tester,
  HttpClientAdapter api,
) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        dioProvider.overrideWith((ref) async => dio),
        authControllerProvider.overrideWith(_JustRegistered.new),
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
  await _pumpUntil(
    tester,
    'registration to land the new account on the wizard',
    () => find.text('STEP 1 OF 3').evaluate().isNotEmpty,
  );
}

// ── Wizard interactions ─────────────────────────────────────────────────────

Finder _hinted(String hint) => find.widgetWithText(TextField, hint);

Future<void> _tap(WidgetTester tester, Finder target) async {
  await tester.tap(target);
  await _settle(tester);
}

/// Picks [option] out of a dropdown. `.last` because the closed button renders
/// the current selection using the same string the open menu offers.
Future<void> _pick(WidgetTester tester, Finder dropdown, String option) async {
  await tester.tap(dropdown);
  await _settle(tester);
  await tester.tap(find.text(option).last);
  await _settle(tester);
}

/// The salary control on whichever step is showing. Typed `int?` rather than
/// `int` because "Not set" is one of its options — which is also what tells it
/// apart from the experience and notice-period pickers beside it.
Finder get _salaryPicker => find.byType(DropdownButtonFormField<int?>);

Finder _yearPicker(int index) =>
    find.byType(DropdownButtonFormField<int>).at(index);

/// Scopes a finder to the education step. A step whose text field still holds
/// focus stays mounted behind the one on screen (see the two education cases),
/// and step 1 carries year/month dropdowns and free-text boxes of its own — so
/// an unscoped finder here can land on the neighbouring step's fields.
Finder _inEducation(Finder finder) =>
    find.descendant(of: find.byType(EducationStep), matching: finder);

/// The education step's year pickers, in build order: degree start, degree end,
/// Class 12 start, Class 12 end.
Finder _eduYear(int index) =>
    _inEducation(find.byType(DropdownButtonFormField<int>)).at(index);

/// Fills the degree half of the education step. [gradeLast] leaves the caret in
/// a text field, which is load-bearing — see the two education cases.
Future<void> _fillDegree(WidgetTester tester, {bool gradeLast = false}) async {
  await tester.enterText(
    _inEducation(_hinted('e.g. Delhi University')),
    'IIT Bombay',
  );
  await tester.enterText(_inEducation(_hinted('e.g. B.Tech')), 'B.Tech');
  await _settle(tester);
  await _pick(tester, _eduYear(0), '2020');
  await _pick(tester, _eduYear(1), '2024');
  if (gradeLast) {
    await tester.enterText(_inEducation(_hinted('e.g. 8.4 CGPA')), '8.4');
    await _settle(tester);
  }
}

String? _textIn(WidgetTester tester, Finder field) =>
    tester.widget<TextField>(field).controller?.text;

// ── Alerts interactions ─────────────────────────────────────────────────────

/// Scopes a finder to the pushed editor. The list it was pushed over is still
/// in the tree and its cards carry the same words the editor does.
Finder _inEditor(Finder finder) =>
    find.descendant(of: find.byType(AlertEditorScreen), matching: finder);

/// A field in the editor, named by its prefix icon: once an alert is being
/// edited its hint text is gone, so a hint-based finder only works on a blank
/// form.
Finder _editorField(IconData icon) =>
    find.ancestor(of: find.byIcon(icon), matching: find.byType(TextFormField));

/// The editor's three nullable dropdowns, in build order: minimum experience,
/// maximum experience, minimum salary. All three offer "Any", which is what
/// makes them `int?`.
Finder _editorDropdown(int index) =>
    _inEditor(find.byType(DropdownButtonFormField<int?>)).at(index);

/// The card belonging to one alert, rather than whichever card happens to be
/// first. Every assertion about a row's state has to be scoped like this or it
/// is satisfied by the neighbour.
Finder _cardOf(String alertName) =>
    find.ancestor(of: find.text(alertName), matching: find.byType(Row)).first;

Finder _cardMenu(String alertName) => find.descendant(
  of: _cardOf(alertName),
  matching: find.byType(PopupMenuButton<String>),
);

Map<String, dynamic> _alert({
  required int id,
  required String name,
  String frequency = 'daily',
  bool isActive = true,
  Map<String, dynamic> query = const {},
  String? lastSentAt,
}) => {
  'id': id,
  'name': name,
  'frequency': frequency,
  'isActive': isActive,
  'query': query,
  'lastSentAt': lastSentAt,
};

void main() {
  group('onboarding — the wizard a brand-new account lands in', () {
    testWidgets('it says it is working while the profile load is in flight', (
      tester,
    ) async {
      final api = _Hanging();
      await _mount(tester, const OnboardingScreen(), api);
      await _settle(tester);

      // Asserted first, because a wizard showing a loader over a request it
      // never sent reads as perfectly fine on screen. The load is not
      // decoration either: GET /me/profile is what provisions the Candidate
      // row, and every write below 404s for a new account without it.
      expect(api.calls, ['GET /me/profile']);
      expect(find.text('Setting up your profile…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed profile load blocks with a retry that recovers', (
      tester,
    ) async {
      final api = _ProfileApi()..failingLoads = 1;
      await _mount(tester, const OnboardingScreen(), api, size: _tallPhone);
      await _settle(tester);

      expect(find.text('Setting up your profile…'), findsNothing);
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      // Nothing in this wizard works without the profile, so the way out has
      // to be on screen — the alternative is a new account stranded on a dead
      // page with the app freshly installed.
      expect(find.text('Try again'), findsOneWidget);

      await _tap(tester, find.text('Try again'));

      expect(find.text('STEP 1 OF 3'), findsOneWidget);
      expect(api.calls, ['GET /me/profile', 'GET /me/profile']);
    });

    testWidgets('the three steps advance in order and end on the all-set page', (
      tester,
    ) async {
      await _openWizard(tester);

      expect(find.text('STEP 1 OF 3'), findsOneWidget);
      expect(find.text('Work profile'), findsOneWidget);

      await _tap(tester, find.text('Continue'));
      expect(find.text('STEP 2 OF 3'), findsOneWidget);
      expect(find.text('Education'), findsOneWidget);

      await _tap(tester, find.text('Continue'));
      expect(find.text('STEP 3 OF 3'), findsOneWidget);
      // The last step's button has to stop saying Continue, or the candidate
      // has no idea the wizard is about to end.
      expect(find.text('Continue'), findsNothing);

      await _tap(tester, find.text('Finish'));
      expect(find.text("You're all set"), findsOneWidget);
      expect(find.text('Go to Home'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('every step can be skipped, and skipping saves nothing', (
      tester,
    ) async {
      final api = await _openWizard(tester);

      // Each step is filled in before it is skipped, which is the whole point:
      // every save on this wizard is a no-op on an empty form — an empty
      // profile body is never sent, a blank education section is never posted —
      // so skipping past three untouched steps would send nothing whether Skip
      // saves or not, and would prove nothing either way.
      expect(find.text('STEP 1 OF 3'), findsOneWidget);
      await _tap(tester, find.text('Experienced'));
      await _tap(tester, find.text('Job'));
      await _tap(tester, find.text('Skip this step'));

      expect(find.text('STEP 2 OF 3'), findsOneWidget);
      await _fillDegree(tester);
      await _tap(tester, find.text('Skip this step'));

      expect(find.text('STEP 3 OF 3'), findsOneWidget);
      await tester.enterText(
        _hinted('e.g. Frontend developer skilled in Flutter & React'),
        'Flutter developer, 3 years',
      );
      await _settle(tester);
      await _tap(tester, find.text('Skip this step'));

      expect(find.text("You're all set"), findsOneWidget);
      // Skip is a promise not to collect. Each of those three steps held
      // enough to produce a request — a work status, a whole degree, a
      // headline — and none of them may have sent one.
      expect(api.writes, isEmpty);
    });

    testWidgets('the work-profile step patches everything it collected', (
      tester,
    ) async {
      final api = await _openWizard(tester);

      await _tap(tester, find.text('Experienced'));
      await _tap(tester, find.text('Job'));
      await _pick(tester, _yearPicker(0), '3'); // years of experience
      await _pick(tester, _salaryPicker, '₹12 LPA');
      await tester.enterText(_hinted('Company name'), 'Acme Corp');
      await tester.enterText(_hinted('e.g. Software Engineer'), 'Engineer');
      await tester.enterText(_hinted('e.g. Bengaluru'), 'Pune');
      await _settle(tester);

      await _tap(tester, find.text('Continue'));

      expect(api.bodyOf('PATCH /me/profile'), {
        'workStatus': 'EXPERIENCED',
        'lookingFor': 'JOB',
        // Years and months are two pickers; the API stores one number.
        'experienceMonths': 36,
        // ₹12,00,000 in paise. This is a lakhs-per-annum picker over an API
        // that stores paise, and it used to be a rupee text box — where the
        // same "12" meant twelve rupees.
        'currentSalaryPaise': 120000000,
        'currentCompanyName': 'Acme Corp',
        'currentTitle': 'Engineer',
        'currentCityName': 'Pune',
      });
    });

    testWidgets('salary is offered in whole lakhs, never as a rupee amount', (
      tester,
    ) async {
      await _openWizard(tester, candidate: {'workStatus': 'EXPERIENCED'});

      await _tap(tester, _salaryPicker);

      // Every option carries its unit, and "Not set" is one of them — a
      // candidate with no salary to declare must not have to invent one.
      expect(find.text('₹3 LPA'), findsOneWidget);
      expect(find.text('₹12 LPA'), findsOneWidget);
      expect(find.text('₹100 LPA'), findsOneWidget);
      expect(find.text('Not set'), findsWidgets);
    });

    testWidgets('a salary the candidate never touched is written back intact', (
      tester,
    ) async {
      // ₹8,50,000 a year. The picker only offers whole lakhs, so the only
      // thing it can show is ₹9 LPA.
      final api = await _openWizard(
        tester,
        candidate: {'workStatus': 'EXPERIENCED', 'currentSalaryPaise': 85000000},
      );

      expect(find.text('₹9 LPA'), findsOneWidget);

      await _tap(tester, find.text('Continue'));

      // Multiplying the displayed 9 back out would hand the candidate a
      // ₹9,00,000 salary they never typed, from a screen they only opened to
      // fill in something else, with nothing on screen to say so.
      expect(api.bodyOf('PATCH /me/profile')['currentSalaryPaise'], 85000000);
    });

    testWidgets('key skills go to the skills route, not the profile body', (
      tester,
    ) async {
      final api = await _openWizard(tester);

      await tester.enterText(_hinted('e.g. Flutter, Python, Excel'), 'Flutter');
      await _settle(tester);
      await _tap(tester, find.byTooltip('Add skill'));
      expect(find.widgetWithText(Chip, 'Flutter'), findsOneWidget);

      await _tap(tester, find.text('Continue'));

      // Two things at once: skills are their own route, and the profile PATCH
      // is skipped entirely when nothing else was filled in. ProfilePatchDto
      // is strict, so a body carrying a stray `customSkills` 400s the step.
      expect(api.calls, ['GET /me/profile', 'PATCH /me/skills']);
      expect(api.bodyOf('PATCH /me/skills'), {
        'skillIds': <int>[],
        'customSkills': ['Flutter'],
      });
    });

    testWidgets('the headline step patches the headline and expected salary', (
      tester,
    ) async {
      final api = await _openWizard(tester);
      await _tap(tester, find.text('Skip this step'));
      await _tap(tester, find.text('Skip this step'));
      expect(find.text('STEP 3 OF 3'), findsOneWidget);

      await tester.enterText(
        _hinted('e.g. Frontend developer skilled in Flutter & React'),
        'Flutter developer, 3 years',
      );
      await _settle(tester);
      await _pick(tester, _salaryPicker, '₹12 LPA');

      await _tap(tester, find.text('Finish'));

      expect(api.bodyOf('PATCH /me/profile'), {
        'headline': 'Flutter developer, 3 years',
        // The same lakhs-to-paise conversion as the current-salary field. This
        // is the number recruiters filter on, so being a factor of a lakh out
        // here hides the candidate from every search they belong in.
        'expectedSalaryMinPaise': 120000000,
      });
      expect(find.text("You're all set"), findsOneWidget);
    });

    testWidgets('an education row with no start year is refused before it is sent', (
      tester,
    ) async {
      final api = await _openWizard(tester);
      await _tap(tester, find.text('Skip this step'));

      await tester.enterText(_hinted('e.g. Delhi University'), 'IIT Bombay');
      await tester.enterText(_hinted('e.g. B.Tech'), 'B.Tech');
      await _settle(tester);
      await _tap(tester, find.text('Continue'));

      // Caught in the step rather than by a 400 from the server: the wizard
      // has to stay put and name the missing field, because advancing past a
      // rejected save is how a degree gets silently dropped.
      expect(find.text('Select your degree start year.'), findsOneWidget);
      expect(find.text('STEP 2 OF 3'), findsOneWidget);
      expect(api.writes, isEmpty);
    });

    testWidgets('re-saving education updates the row it created, not a new one', (
      tester,
    ) async {
      final api = await _openWizard(tester);
      await _tap(tester, find.text('Skip this step'));

      // Grade typed last on purpose. The step only survives being paged away
      // from while one of its text fields still holds focus — the case below
      // is the same journey with the caret left somewhere else.
      await _fillDegree(tester, gradeLast: true);
      await _tap(tester, find.text('Continue'));
      expect(api.calls.where((c) => c == 'POST /me/education'), hasLength(1));

      await _tap(tester, find.byTooltip('Back'));
      expect(_textIn(tester, _hinted('e.g. Delhi University')), 'IIT Bombay');

      await _tap(tester, find.text('Continue'));

      // The id came back from the create and has to be used. A second POST
      // here lists the same degree twice on the profile, and the only cure is
      // the candidate noticing it later and deleting one by hand.
      expect(api.calls.where((c) => c == 'POST /me/education'), hasLength(1));
      expect(api.calls, contains('PATCH /me/education/55'));
    });

    testWidgets(
      'paging back to education after using a year picker loses the row it made',
      (tester) async {
        final api = await _openWizard(tester);
        await _tap(tester, find.text('Skip this step'));

        // The ordinary way through this step: the year pickers are required
        // and the grade box is optional, so the last thing most candidates
        // touch is a dropdown, leaving no text field holding focus.
        await _fillDegree(tester);
        await _tap(tester, find.text('Continue'));
        expect(api.calls.where((c) => c == 'POST /me/education'), hasLength(1));

        await _tap(tester, find.byTooltip('Back'));

        // Current behaviour, and it is a bug: the step was thrown away, so the
        // degree that was just saved is no longer on the form. It reads as
        // "nothing was saved".
        expect(_textIn(tester, _hinted('e.g. Delhi University')), isEmpty);

        // So the candidate types it again — and because the id went with the
        // discarded step, the second save creates a second row rather than
        // updating the first.
        await _fillDegree(tester);
        await _tap(tester, find.text('Continue'));

        expect(api.calls.where((c) => c == 'POST /me/education'), hasLength(2));
        expect(
          api.calls.where((c) => c.startsWith('PATCH /me/education')),
          isEmpty,
        );
        expect(
          [for (final b in api.bodiesOf('POST /me/education')) b['institute']],
          ['IIT Bombay', 'IIT Bombay'],
          reason: 'the same degree was created twice',
        );
      },
    );

    testWidgets('"Skip for now" reaches the app without saving anything', (
      tester,
    ) async {
      final api = _ProfileApi();
      await _launchAfterRegistration(tester, api);

      // Half-filled before the escape hatch is used. Leaving the step blank
      // would make the "saved nothing" assertion below true no matter what
      // "Skip for now" does, because an empty profile body is never sent.
      await _tap(tester, find.text('Experienced'));
      await _tap(tester, find.text('Job'));

      await tester.tap(find.text('Skip for now'));
      // Waiting for the wizard to LEAVE rather than for the shell to arrive:
      // halfway through the route transition both are on stage, and a check
      // that only asks for the shell is satisfied while the wizard is still
      // sliding out behind it.
      await _pumpUntil(
        tester,
        'the wizard to hand the new account over to the tabbed app',
        () => find.text('Skip for now').evaluate().isEmpty,
      );

      expect(find.byType(NavigationBar), findsOneWidget);
      // The one guarantee the escape hatch makes: nothing collected so far is
      // kept.
      expect(api.profileWrites, isEmpty);
    });

    testWidgets('the all-set page hands the candidate over to Home', (
      tester,
    ) async {
      final api = _ProfileApi();
      await _launchAfterRegistration(tester, api);

      // Same reason as above: something the wizard could save has to be on the
      // form for the closing assertion to mean anything.
      await _tap(tester, find.text('Experienced'));
      await _tap(tester, find.text('Job'));
      for (var step = 0; step < 3; step++) {
        await _tap(tester, find.text('Skip this step'));
      }
      expect(find.text("You're all set"), findsOneWidget);

      await tester.tap(find.text('Go to Home'));
      await _pumpUntil(
        tester,
        'the finished wizard to give way to the tabbed app',
        () => find.text('Go to Home').evaluate().isEmpty,
      );

      // A wizard that ends on a congratulation the candidate cannot leave is
      // an uninstall, and this is the last screen of a first run.
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(api.profileWrites, isEmpty);
    });
  });

  group('job alerts', () {
    testWidgets('it says it is loading while the list is in flight', (
      tester,
    ) async {
      final api = _Hanging();
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      expect(api.calls, ['GET /me/alerts']);
      expect(find.text('Loading alerts…'), findsOneWidget);
    });

    testWidgets('the saved alerts render with their state and the usage count', (
      tester,
    ) async {
      final api = _AlertsApi([
        _alert(
          id: 4,
          name: 'Flutter in Bengaluru',
          lastSentAt: '2026-08-18T06:00:00.000Z',
        ),
        _alert(id: 5, name: 'Remote Dart', frequency: 'weekly', isActive: false),
      ]);
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      expect(find.text('Flutter in Bengaluru'), findsOneWidget);
      expect(find.text('Remote Dart'), findsOneWidget);
      expect(find.text('Daily'), findsOneWidget);
      expect(find.text('Weekly'), findsOneWidget);
      // Only the paused one is badged; a badge on both would leave the seeker
      // unable to tell which of their alerts is actually sending.
      expect(find.text('Paused'), findsOneWidget);
      expect(find.text('Last sent 18 Aug 2026'), findsOneWidget);
      expect(find.text('Not sent yet'), findsOneWidget);
      // The cap is enforced server-side, so the count has to be visible before
      // the seeker hits it rather than arriving as a 409 on save.
      expect(find.text('2 of 10 alerts used'), findsOneWidget);
    });

    testWidgets('an empty list offers the way to make the first alert', (
      tester,
    ) async {
      await _mount(tester, const AlertsScreen(), _AlertsApi());
      await _settle(tester);

      expect(find.text('No job alerts yet'), findsOneWidget);
      expect(find.text('Create alert'), findsOneWidget);
    });

    testWidgets('a failed load offers a retry that recovers', (tester) async {
      final api = _AlertsApi([_alert(id: 4, name: 'Flutter in Bengaluru')])
        ..failingLoads = 1;
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      expect(find.text('Loading alerts…'), findsNothing);
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);

      await _tap(tester, find.text('Try again'));

      expect(find.text('Flutter in Bengaluru'), findsOneWidget);
    });

    testWidgets('a new alert is created with the query the editor built', (
      tester,
    ) async {
      final api = _AlertsApi();
      await _mount(tester, const AlertsScreen(), api, size: _tallPhone);
      await _settle(tester);

      await _tap(tester, find.text('Create alert'));
      expect(find.text('New alert'), findsOneWidget);

      await tester.enterText(
        _editorField(Icons.label_outline_rounded),
        'Remote Dart',
      );
      await tester.enterText(_editorField(Icons.search_rounded), 'dart');
      await _settle(tester);
      await _tap(tester, _inEditor(find.text('Weekly')));
      await _tap(tester, _inEditor(find.text('Create alert')));

      expect(api.bodyOf('POST /me/alerts'), {
        'name': 'Remote Dart',
        'frequency': 'weekly',
        // The filters live one level down. AlertQueryDto is strict and nested,
        // so flattening these into the alert body is a 400 on every filter at
        // once — and a filter left blank has to be absent, not sent as null.
        'query': {'q': 'dart'},
        'isActive': true,
      });
      // The list has to notice: it was already on screen, and had already been
      // told there were no alerts.
      expect(find.text('Remote Dart'), findsOneWidget);
      expect(find.text('1 of 10 alerts used'), findsOneWidget);
    });

    testWidgets('an alert with no name is refused before anything is sent', (
      tester,
    ) async {
      final api = _AlertsApi();
      await _mount(tester, const AlertsScreen(), api, size: _tallPhone);
      await _settle(tester);

      await _tap(tester, find.text('Create alert'));
      await _tap(tester, _inEditor(find.text('Create alert')));

      expect(find.text('Give your alert a name'), findsOneWidget);
      expect(api.writes, isEmpty);
    });

    testWidgets('an edit keeps the filters the app cannot show and drops a cleared one', (
      tester,
    ) async {
      final api = _AlertsApi([
        _alert(
          id: 4,
          name: 'Flutter in Bengaluru',
          query: const {
            'q': 'flutter',
            'skillSlugs': ['dart'],
            'citySlugs': ['bengaluru'],
            'minExperienceMonths': 24,
            'salaryMin': 150000000,
            // Set from the website. The app has no control for it at all.
            'workMode': 'REMOTE',
          },
        ),
      ]);
      await _mount(tester, const AlertsScreen(), api, size: _tallPhone);
      await _settle(tester);

      await _tap(tester, find.text('Flutter in Bengaluru'));
      expect(find.text('Edit alert'), findsOneWidget);
      // Reopened, not blank: an editor that lost the saved query would look
      // like a brand-new alert and overwrite the real one on save.
      expect(
        tester
            .widget<TextFormField>(_editorField(Icons.search_rounded))
            .controller
            ?.text,
        'flutter',
      );

      await tester.enterText(
        _editorField(Icons.label_outline_rounded),
        'Dart roles',
      );
      await tester.enterText(_editorField(Icons.search_rounded), '');
      await _settle(tester);
      await _tap(tester, _inEditor(find.text('Save changes')));

      final body = api.bodyOf('PATCH /me/alerts/4');
      expect(body['name'], 'Dart roles');
      expect(body['query'], {
        // 'q' is gone, not sent as an empty string: the seeker cleared the
        // keyword box, and a cleared field that quietly stays set is a search
        // they can never widen again.
        'skillSlugs': ['dart'],
        'citySlugs': ['bengaluru'],
        // Everything else the seeker did not touch comes back byte-identical.
        // Note what this does and does not prove: the two lists went out
        // through slug → chip → slug, but the merge would carry the two
        // numbers over on its own, so this case cannot tell a working
        // experience/salary control from one that is wired to nothing. That is
        // the next case's job.
        'minExperienceMonths': 24,
        'salaryMin': 150000000,
        'workMode': 'REMOTE',
      });
      expect(find.text('Dart roles'), findsOneWidget);
    });

    testWidgets('the experience and salary controls send what they show', (
      tester,
    ) async {
      final api = _AlertsApi([
        _alert(
          id: 4,
          name: 'Flutter in Bengaluru',
          query: const {'minExperienceMonths': 24, 'salaryMin': 150000000},
        ),
      ]);
      await _mount(tester, const AlertsScreen(), api, size: _tallPhone);
      await _settle(tester);

      await _tap(tester, find.text('Flutter in Bengaluru'));

      // Stored in months and paise, shown in years and lakhs. Asserted on
      // screen, because a control that silently reopened on "Any" would hand
      // the seeker a widened search the moment they saved anything else.
      expect(_inEditor(find.text('2 years')), findsOneWidget);
      expect(_inEditor(find.text('15 LPA+')), findsOneWidget);

      await _pick(tester, _editorDropdown(0), '5 years');
      await _pick(tester, _editorDropdown(2), '20 LPA+');
      await _tap(tester, _inEditor(find.text('Save changes')));

      // The units invert on the way out. Both of these are the number the
      // server filters on, so a control that shows lakhs and years but sends
      // lakhs and years — or sends nothing, leaving the old value merged back
      // in — is a filter the seeker cannot actually change.
      final query = api.bodyOf('PATCH /me/alerts/4')['query'] as Map;
      expect(query['minExperienceMonths'], 60);
      expect(query['salaryMin'], 200000000);
    });

    testWidgets('pausing an alert marks that alert and sends only that change', (
      tester,
    ) async {
      final api = _AlertsApi([
        _alert(id: 4, name: 'Flutter in Bengaluru'),
        _alert(id: 5, name: 'Remote Dart'),
      ]);
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      await _tap(tester, _cardMenu('Remote Dart'));
      await _tap(tester, find.text('Pause'));

      // AlertUpdateDto is a partial over a strict object, so every key is
      // `T | undefined` and never nullable — a body padded out with explicit
      // nulls 400s instead of pausing.
      expect(api.bodyOf('PATCH /me/alerts/5'), {'isActive': false});
      expect(
        find.descendant(
          of: _cardOf('Remote Dart'),
          matching: find.text('Paused'),
        ),
        findsOneWidget,
        reason: 'the badge went to the alert that was not paused',
      );
      expect(find.text('Paused'), findsOneWidget);
    });

    testWidgets('deleting asks first, then removes that alert and no other', (
      tester,
    ) async {
      final api = _AlertsApi([
        _alert(id: 4, name: 'Flutter in Bengaluru'),
        _alert(id: 5, name: 'Remote Dart'),
      ]);
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      await _tap(tester, _cardMenu('Remote Dart'));
      await _tap(tester, find.text('Delete'));

      // Delete is the only irreversible thing a seeker can do in this app, so
      // the prompt has to name which alert is about to go.
      expect(find.text('Delete alert?'), findsOneWidget);
      expect(
        find.text('Delete "Remote Dart"? This can\'t be undone.'),
        findsOneWidget,
      );

      await _tap(tester, find.text('Cancel'));
      expect(api.writes, isEmpty);
      expect(find.text('Remote Dart'), findsOneWidget);

      await _tap(tester, _cardMenu('Remote Dart'));
      await _tap(tester, find.text('Delete'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Delete'));

      expect(api.writes, ['DELETE /me/alerts/5']);
      expect(find.text('Remote Dart'), findsNothing);
      expect(find.text('Flutter in Bengaluru'), findsOneWidget);
      expect(find.text('1 of 10 alerts used'), findsOneWidget);
      expect(find.text('Alert deleted'), findsOneWidget);
    });

    testWidgets('at the cap the list says so and refuses to open the editor', (
      tester,
    ) async {
      final api = _AlertsApi([
        for (var i = 1; i <= 10; i++) _alert(id: i, name: 'Alert $i'),
      ]);
      await _mount(tester, const AlertsScreen(), api);
      await _settle(tester);

      expect(
        find.text('10 of 10 alerts used — delete one to add another'),
        findsOneWidget,
      );

      await _tap(tester, find.byIcon(Icons.add_rounded));

      // Refused here rather than after the seeker has filled in a whole
      // editor, which is where the server's 409 would land.
      expect(find.text('New alert'), findsNothing);
      expect(api.writes, isEmpty);

      await _tap(tester, _cardMenu('Alert 1'));
      await _tap(tester, find.text('Delete'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Delete'));
      expect(find.text('9 of 10 alerts used'), findsOneWidget);

      // The same control, one alert later. Without this half, the case above
      // would read exactly the same for a plus button that never opened the
      // editor at any count.
      await _tap(tester, find.byIcon(Icons.add_rounded));
      expect(find.text('New alert'), findsOneWidget);
    });
  });
}
