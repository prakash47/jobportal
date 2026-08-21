import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/education/data/education_models.dart';
import 'package:cq_mobile/features/education/presentation/education_editor_sheet.dart';
import 'package:cq_mobile/features/experience/data/experience_models.dart';
import 'package:cq_mobile/features/experience/presentation/experience_editor_sheet.dart';
import 'package:cq_mobile/features/languages/data/language_models.dart';
import 'package:cq_mobile/features/languages/presentation/language_editor_sheet.dart';
import 'package:cq_mobile/features/projects/data/project_models.dart';
import 'package:cq_mobile/features/projects/presentation/project_editor_sheet.dart';
import 'package:cq_mobile/shared/widgets/cq_buttons.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// The four record editors — language, project, education, experience — are the
/// only places in this app where a candidate can destroy their own profile, and
/// until this file none of them had ever been mounted.
///
/// Two of the four cannot really edit at all. `/me/languages` and `/me/projects`
/// have no PATCH, so "Save changes" is a DELETE followed by a POST, and between
/// the two the row exists nowhere. The repositories put the original back when
/// the create is refused, and edit_restore_test.dart pins that at the repository
/// seam. What that file cannot see is the sheet — whether the body handed to the
/// repository is the row as it stood, whether the sheet stays open when the edit
/// is refused, and whether the candidate is told why. A sheet that closes
/// reporting success over a row that was quietly put back is the same lost edit
/// from where the candidate is sitting.
///
/// The other two are real PATCHes, where the danger runs the other way. An
/// absent key means "leave this alone", so a field the candidate emptied has to
/// be SENT as `''` or the old value is simply back on the next load with nothing
/// to explain it. That one shipped once already (see patch_body.dart) and it is
/// invisible from the screen, because the save succeeds.
///
/// So each test drives a sheet the way a candidate drives it — type, tick, tap
/// Save — and then asserts the two things somebody outside the app could
/// actually notice: the exact request that reached the server, and what the
/// sheet did afterwards.

// ── The server ──────────────────────────────────────────────────────────────

class _Call {
  const _Call(this.method, this.path, this.body);

  final String method;
  final String path;

  /// The request body exactly as the sheet built it, before encoding — so a
  /// key holding `null` stays distinguishable from a key that is not there.
  /// That distinction is the whole subject of the PATCH tests below.
  final Map<String, dynamic>? body;

  String get signature => '$method $path';
}

class _Reply {
  const _Reply.ok()
    : status = 200,
      body = const <String, dynamic>{},
      neverAnswers = false;

  const _Reply.status(this.status, this.body) : neverAnswers = false;

  /// A request that is accepted and never answered — the save is in flight.
  /// A Completer rather than a delay, because a pending timer fails the test at
  /// teardown and there is nothing here worth waiting for.
  const _Reply.silence()
    : status = 0,
      body = const <String, dynamic>{},
      neverAnswers = true;

  final int status;
  final Map<String, dynamic> body;
  final bool neverAnswers;
}

/// One fake API for all four sheets: it answers from a script and records every
/// request, in order.
///
/// Replies are keyed by `METHOD /path` and consumed one per call, the last one
/// repeating. That queue is what makes the delete-then-create failure
/// expressible at all — the edit's POST and the restore's POST go to the same
/// route, and the entire point is that the server treats them differently.
///
/// An unscripted route answers 200 `{}`. Every model here treats every field as
/// optional, so that degrades rather than throwing.
class _Api implements HttpClientAdapter {
  _Api([Map<String, List<_Reply>> script = const {}])
    : _script = {for (final route in script.entries) route.key: [...route.value]};

  final Map<String, List<_Reply>> _script;
  final List<_Call> calls = [];

  List<String> get signatures => [for (final call in calls) call.signature];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    final sent = options.data;
    calls.add(
      _Call(
        options.method,
        options.path,
        sent is Map ? Map<String, dynamic>.from(sent) : null,
      ),
    );

    final queue = _script['${options.method} ${options.path}'];
    final reply = (queue == null || queue.isEmpty)
        ? const _Reply.ok()
        : (queue.length == 1 ? queue.first : queue.removeAt(0));

    if (reply.neverAnswers) return Completer<ResponseBody>().future;

    return Future.value(
      ResponseBody.fromString(
        jsonEncode(reply.body),
        reply.status,
        // Without the content-type Dio hands the repository a String and every
        // parser reads garbage instead of failing loudly.
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );
  }

  @override
  void close({bool force = false}) {}
}

// ── Harness ─────────────────────────────────────────────────────────────────

/// What the sheet handed back.
///
/// [result] is `true` only when the sheet itself decided the save landed;
/// [returned] is how a test tells "still open, still arguing" from "closed".
class _Opened {
  bool? result;
  bool returned = false;
}

const _phone = Size(390, 844);
const _openLabel = 'Open the editor';

/// Puts a real Riverpod scope over a faked transport, then opens one editor the
/// way the profile screens open it — from a tap, on a context that has a
/// Navigator over it, keeping whatever the sheet returns.
///
/// Overriding `dioProvider` alone reaches every repository, and keeps
/// `cookieJarProvider` out of the graph, which would otherwise hit
/// path_provider and throw MissingPluginException.
Future<_Opened> _openEditor(
  WidgetTester tester,
  _Api api,
  Future<bool?> Function(BuildContext context) show,
) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;
  final opened = _Opened();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(
        // Every sheet reads `context.cq`, the theme extension CqTheme registers;
        // a bare MaterialApp throws on the first build.
        theme: CqTheme.light,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async {
                  opened.result = await show(context);
                  opened.returned = true;
                },
                child: const Text(_openLabel),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text(_openLabel));
  // Past the end of the sheet's entrance, so a later tap lands on a control
  // that has stopped moving.
  await _pumpFrames(tester, 30);
  return opened;
}

/// Taps the sheet's save button and pumps until the sheet is done with it —
/// closed, or back to an idle button with something to say.
///
/// `pumpAndSettle` is not usable in this suite: the button's own spinner (and
/// CqLoader elsewhere) animates forever, so settling on a save that is still in
/// flight never returns.
Future<void> _save(WidgetTester tester, _Opened opened, String label) async {
  // Named through CqPrimaryButton because on an "Add …" sheet the heading and
  // the button carry the same words.
  final button = find.widgetWithText(CqPrimaryButton, label);
  expect(button, findsOneWidget, reason: 'the sheet has no "$label" button');
  await tester.ensureVisible(button);
  await tester.tap(button);

  // While saving, the label is replaced by a spinner — so the label coming back
  // means the sheet has finished and decided to stay. A validation refusal
  // never hides it in the first place, and ends this immediately, which is
  // correct: nothing was sent and nothing is coming.
  await _pumpUntil(
    tester,
    'the save to finish — the sheet either closes or says why it could not',
    () => opened.returned || button.evaluate().isNotEmpty,
  );
  // The pop's exit animation, and the frame the error line is painted on.
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> _pumpFrames(WidgetTester tester, int frames) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Pumps until [ready] holds, and fails saying what it was waiting for if it
/// never does — rather than passing on a half-finished frame.
Future<void> _pumpUntil(
  WidgetTester tester,
  String what,
  bool Function() ready,
) async {
  // ~4s of frames: longer than any honest round trip through this fake, short
  // enough that a sheet which never finishes fails instead of hanging CI.
  for (var frame = 0; frame < 250; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
    if (ready()) return;
  }
  fail('Waited about four seconds of frames for $what. It never happened.');
}

/// A text field carrying [text] — its current value, or its hint while it is
/// still empty. Finding a pre-filled field by its value doubles as a check that
/// the editor opened on what the profile actually holds.
Finder _field(String text) => find.widgetWithText(TextField, text);

/// Opens the dropdown currently displaying [showing] and picks [choose] out of
/// it, the way a candidate changes a year or a month.
///
/// A closed DropdownButton keeps only its selected item onstage, so `showing`
/// names exactly one widget before the menu opens and the option appears only
/// after — no `.last` disambiguation, and a typo in either argument fails
/// loudly here instead of silently tapping nothing. The open menu is the only
/// ListView these sheets ever put on screen (their own scroller is a
/// SingleChildScrollView), which is what separates the option in the menu from
/// the value still painted on the button behind it.
///
/// [choose] has to be within a dozen or so rows of [showing]: an 80-year list
/// only builds the rows around the current value, and this deliberately does
/// not scroll the menu looking for the rest — a silent scroll would turn "that
/// option is not where you think" into a passing test.
Future<void> _pickFromDropdown(
  WidgetTester tester, {
  required String showing,
  required String choose,
}) async {
  final closed = find.text(showing);
  expect(closed, findsOneWidget, reason: 'no dropdown is showing "$showing"');
  await tester.ensureVisible(closed);
  await tester.tap(closed);
  await _pumpFrames(tester, 40);

  final option = find.descendant(
    of: find.byType(ListView),
    matching: find.text(choose),
  );
  expect(option, findsOneWidget, reason: '"$choose" is not in the open menu');
  await tester.tap(option);
  await _pumpFrames(tester, 40);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

final _kannada = LanguageItem.fromJson(const {
  'id': 3,
  'name': 'Kannada',
  'proficiency': 'ADVANCED',
  'createdAt': '2026-07-01T00:00:00.000Z',
});

final _busTracker = ProjectItem.fromJson(const {
  'id': 7,
  'title': 'Realtime bus tracker',
  'description': 'Live ETAs for BMTC routes',
  'techStack': ['Flutter', 'Go'],
  'url': 'https://example.com/bus',
  'createdAt': '2026-07-01T00:00:00.000Z',
});

final _bTech = EducationItem.fromJson(const {
  'id': 5,
  'institute': 'Delhi University',
  'degree': 'B.Tech',
  'fieldOfStudy': 'Computer Science',
  'startYear': 2015,
  'endYear': 2019,
  'grade': '8.6 CGPA',
});

final _nimbus = WorkExperienceItem.fromJson(const {
  'id': 8,
  'companyName': 'Nimbus Technologies',
  'title': 'Senior Flutter Developer',
  // Midday mid-month on purpose. The sheet reads .month/.year off the LOCAL
  // date, and a midnight-UTC fixture slides into the previous month for anyone
  // west of Greenwich — which would make these assertions pass in Pune and fail
  // in CI.
  'startDate': '2019-03-15T12:00:00.000Z',
  'endDate': '2024-08-15T12:00:00.000Z',
  'isCurrent': false,
  'description': 'Led the payments rewrite.',
});

/// The first-of-month UTC stamp the experience API demands. `z.iso.datetime()`
/// refuses a local offset outright, so a `DateTime(y, m).toIso8601String()`
/// would 400 the whole form.
final _utcMonthStamp = RegExp(r'^\d{4}-\d{2}-01T00:00:00\.000Z$');

void main() {
  group('language — the editor that must delete before it can save', () {
    testWidgets('an empty name is refused here, so the row is never deleted', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showLanguageEditor(context, existing: _kannada),
      );

      // Whitespace, not '': trimming is the part that decides.
      await tester.enterText(_field('Kannada'), '   ');
      await _save(tester, opened, 'Save changes');

      // The DELETE goes first and unconditionally, so a client-side check that
      // let this through would cost the candidate the row in exchange for a
      // 400 they could have been shown for free.
      expect(
        api.calls,
        isEmpty,
        reason: 'the sheet deleted a row it was never going to be able to '
            'recreate',
      );
      expect(find.text('A language name is required.'), findsOneWidget);
      expect(opened.returned, isFalse);
    });

    testWidgets('renaming onto a language already on the profile keeps the '
        'original and says why', (tester) async {
      // The real repro: CandidateLanguage is @@unique([candidateId, name]), so
      // the create 409s — and the row being edited is already deleted by then.
      final api = _Api(const {
        'POST /me/languages': [
          _Reply.status(409, {'message': 'Language already added'}),
          _Reply.ok(),
        ],
      });
      final opened = await _openEditor(
        tester,
        api,
        (context) => showLanguageEditor(context, existing: _kannada),
      );

      await tester.enterText(_field('Kannada'), 'Hindi');
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, [
        'DELETE /me/languages/3',
        'POST /me/languages', // the rename, refused
        'POST /me/languages', // Kannada, put back
      ]);
      // Not a husk of the row — the proficiency has to come back too, or the
      // candidate silently loses it while being told the rename failed.
      expect(api.calls.last.body, {
        'name': 'Kannada',
        'proficiency': 'ADVANCED',
      });
      expect(find.text('That language is already added.'), findsOneWidget);
      expect(
        opened.returned,
        isFalse,
        reason: 'the sheet closed as though the rename had worked',
      );
    });

    testWidgets('when the restore also fails, the sheet admits the row is gone',
        (tester) async {
      // A single scripted reply repeats, so every create is refused — including
      // the one putting Kannada back.
      final api = _Api(const {
        'POST /me/languages': [
          _Reply.status(409, {'message': 'Language already added'}),
        ],
      });
      final opened = await _openEditor(
        tester,
        api,
        (context) => showLanguageEditor(context, existing: _kannada),
      );

      await tester.enterText(_field('Kannada'), 'Hindi');
      await _save(tester, opened, 'Save changes');

      // Both were genuinely attempted; the restore is not a comment in the
      // repository.
      expect(api.signatures.where((s) => s.startsWith('POST')), hasLength(2));
      // The one case where the candidate has to act, so it cannot be worded as
      // an ordinary failure.
      expect(find.textContaining('could not be restored'), findsOneWidget);
      expect(find.textContaining('add it again'), findsOneWidget);
      expect(opened.returned, isFalse);
    });

    testWidgets('a rename that lands carries the proficiency untouched', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showLanguageEditor(context, existing: _kannada),
      );

      await tester.enterText(_field('Kannada'), 'Hindi');
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, ['DELETE /me/languages/3', 'POST /me/languages']);
      // The recreated row is a whole new row. If the sheet opened on the
      // dropdown's default instead of the value on the profile, a candidate
      // renaming a typo would be quietly demoted from Advanced to Intermediate
      // and told it saved.
      expect(api.calls.last.body, {'name': 'Hindi', 'proficiency': 'ADVANCED'});
      expect(opened.result, isTrue);
    });

    testWidgets('a second tap mid-save cannot start a second delete', (
      tester,
    ) async {
      final api = _Api(const {
        'POST /me/languages': [_Reply.silence()],
      });
      final opened = await _openEditor(
        tester,
        api,
        (context) => showLanguageEditor(context, existing: _kannada),
      );

      await tester.enterText(_field('Kannada'), 'Hindi');
      await tester.tap(find.byType(CqPrimaryButton));
      await _pumpUntil(
        tester,
        'the delete to land and the create to go out',
        () => api.calls.length == 2,
      );

      expect(
        find.byType(CircularProgressIndicator),
        findsOneWidget,
        reason: 'the sheet gave no sign it was working, which is what invites '
            'the second tap',
      );

      await tester.tap(find.byType(CqPrimaryButton));
      await _pumpFrames(tester, 20);

      // A second run would DELETE the (already gone) row and POST a duplicate —
      // on a route where the first POST may still be about to succeed.
      expect(
        api.calls.length,
        2,
        reason: 'an impatient tap started a second delete-and-recreate',
      );
      expect(opened.returned, isFalse);
    });
  });

  group('project — the other editor with no PATCH', () {
    testWidgets('a refused edit puts the whole row back and keeps the typing', (
      tester,
    ) async {
      final api = _Api(const {
        'POST /me/projects': [
          _Reply.status(400, {'message': 'Title must be 150 characters or less.'}),
          _Reply.ok(),
        ],
      });
      final opened = await _openEditor(
        tester,
        api,
        (context) => showProjectEditor(context, existing: _busTracker),
      );

      await tester.enterText(
        _field('Realtime bus tracker'),
        'Realtime bus tracker v2',
      );
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, [
        'DELETE /me/projects/7',
        'POST /me/projects', // the edit, refused
        'POST /me/projects', // the original, put back
      ]);
      // Every writable column, not just the title: the description, the tags
      // and the link were never part of this edit and must survive it.
      final restored = api.calls.last.body;
      expect(restored, {
        'title': 'Realtime bus tracker',
        'description': 'Live ETAs for BMTC routes',
        'techStack': ['Flutter', 'Go'],
        'url': 'https://example.com/bus',
      });

      // The server's own sentence, verbatim — a generic apology here leaves the
      // candidate guessing which of four fields to change.
      expect(
        find.text('Title must be 150 characters or less.'),
        findsOneWidget,
      );
      // And the work is still in the box, so a retry is one tap rather than
      // typing it all again.
      expect(_field('Realtime bus tracker v2'), findsOneWidget);
      expect(opened.returned, isFalse);
    });

    testWidgets('a new project sends the tags typed and a link the server can '
        'store', (tester) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showProjectEditor(context),
      );

      await tester.enterText(_field('e.g. CQ Mobile — Job app'), 'Bus tracker');
      await tester.enterText(_field('Add a tag, e.g. Flutter'), 'Flutter');
      // The tag row commits on the keyboard's done action; a candidate who
      // never finds the little + button would otherwise save no tags at all.
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      await tester.enterText(
        _field('https://github.com/…'),
        'github.com/asha/bus',
      );
      await _save(tester, opened, 'Add project');

      expect(api.signatures, ['POST /me/projects']);
      final body = api.calls.single.body;
      expect(body?['title'], 'Bus tracker');
      expect(body?['techStack'], ['Flutter']);
      // Typed bare, as people type links. Stored bare it is not a link at all —
      // nothing downstream can open it.
      expect(body?['url'], 'https://github.com/asha/bus');
      // This one is a POST, where an absent key means "no value" rather than
      // "no change" — so omitting the untouched description is right here, and
      // is exactly what the two PATCH sheets below must NOT do.
      expect(body?.containsKey('description'), isFalse);
      expect(opened.result, isTrue);
    });
  });

  group('education — a PATCH where a missing key means "no change"', () {
    testWidgets('clearing the field of study and the grade sends them empty, '
        'not missing', (tester) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showEducationEditor(context, existing: _bTech),
      );

      // An editor that opened blank would PATCH the institute away on save.
      expect(_field('Delhi University'), findsOneWidget);
      expect(_field('Computer Science'), findsOneWidget);

      await tester.enterText(_field('Computer Science'), '');
      await tester.enterText(_field('8.6 CGPA'), '');
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, ['PATCH /me/education/5']);
      final body = api.calls.single.body;
      // The bug this guards is silent in both directions: the save succeeds,
      // the sheet closes, and the deleted grade is back on the next load.
      expect(
        body?.containsKey('fieldOfStudy'),
        isTrue,
        reason: 'an omitted key tells the server to keep the old value',
      );
      expect(body?['fieldOfStudy'], '');
      expect(body?.containsKey('grade'), isTrue);
      expect(body?['grade'], '');
      // The fields nobody touched still travel unchanged.
      expect(body?['institute'], 'Delhi University');
      expect(body?['degree'], 'B.Tech');
      expect(body?['startYear'], 2015);
      expect(body?['endYear'], 2019);
      expect(opened.result, isTrue);
    });

    testWidgets('ticking "currently pursuing" sends endYear as an explicit '
        'null', (tester) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showEducationEditor(context, existing: _bTech),
      );

      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      // The end-year dropdown is gone, so there is nothing left to disagree
      // with the tick.
      expect(find.text('Present'), findsOneWidget);

      await _save(tester, opened, 'Save changes');

      final body = api.calls.single.body;
      // `endYear` is nullable in the education DTO, and null is what means
      // ongoing. Dropping the key instead would leave 2019 in the row and the
      // degree reading as finished.
      expect(body?.containsKey('endYear'), isTrue);
      expect(body?['endYear'], isNull);
      expect(opened.result, isTrue);
    });

    testWidgets('a start year moved past the end year never leaves the sheet', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showEducationEditor(context, existing: _bTech),
      );

      // A candidate correcting when they started, past the year they finished.
      // 2015 is the start year the fixture opened on; the end year shows 2019,
      // so the two controls are never confusable.
      await _pickFromDropdown(tester, showing: '2015', choose: '2020');
      await _save(tester, opened, 'Save changes');

      // Nothing was sent. EducationUpdateDto refines endYear >= startYear, so
      // the server would refuse this too — but a round trip later and in Zod's
      // words, over a form where the candidate has to guess which of the two
      // years it means.
      //
      // The refusal is also the only proof in this file that a picked year
      // reaches the sheet's state at all: on the fixture's own 2015–2019 this
      // guard cannot fire, so a dropdown wired to nothing would save happily.
      expect(api.calls, isEmpty);
      expect(
        find.text('End year must be after the start year.'),
        findsOneWidget,
      );
      expect(opened.returned, isFalse);
    });

    testWidgets('a validation refusal reaches the candidate in the server\'s '
        'own words', (tester) async {
      // The API hands Zod's issue list through untouched, so a refusal arrives
      // as `[{path, message}]` rather than a sentence.
      final api = _Api(const {
        'PATCH /me/education/5': [
          _Reply.status(400, {
            'message': [
              {
                'path': ['grade'],
                'message': 'String must contain at most 40 character(s)',
              },
            ],
          }),
        ],
      });
      final opened = await _openEditor(
        tester,
        api,
        (context) => showEducationEditor(context, existing: _bTech),
      );

      await tester.enterText(
        _field('8.6 CGPA'),
        'Distinction with honours in every semester, first class',
      );
      await _save(tester, opened, 'Save changes');

      // Named field included: "Too long" over a form with six inputs tells the
      // candidate nothing about which one to fix.
      expect(
        find.text('Grade: String must contain at most 40 character(s)'),
        findsOneWidget,
      );
      expect(
        opened.returned,
        isFalse,
        reason: 'the sheet closed on a save the server had rejected',
      );
    });
  });

  group('experience', () {
    testWidgets('an empty form is refused here rather than by the server', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showExperienceEditor(context),
      );

      await _save(tester, opened, 'Add experience');

      expect(api.calls, isEmpty);
      // The server would answer this with a Zod line about `companyName`.
      expect(find.text('Company and title are required.'), findsOneWidget);
      expect(opened.returned, isFalse);
    });

    testWidgets('clearing the description sends it empty, so the old text '
        'really goes', (tester) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showExperienceEditor(context, existing: _nimbus),
      );

      await tester.enterText(_field('Led the payments rewrite.'), '');
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, ['PATCH /me/experience/8']);
      final body = api.calls.single.body;
      expect(
        body?.containsKey('description'),
        isTrue,
        reason: 'the emptied description was omitted, which reads to the '
            'server as "keep what you have"',
      );
      expect(body?['description'], '');
      // And the two dates the candidate never opened come back as they were.
      // The form collects only a month, so a sheet whose pickers opened on
      // today would move this job from March 2019 to the current month and
      // still report a clean save — the same silent rewrite as the salary that
      // changed itself. Both stamps are timezone-proof: the fixture is midday
      // UTC, which falls in the same calendar month at every offset on earth.
      expect(body?['startDate'], '2019-03-01T00:00:00.000Z');
      expect(body?['endDate'], '2024-08-01T00:00:00.000Z');
      expect(opened.result, isTrue);
    });

    testWidgets('ticking "I currently work here" cannot clear the end date the '
        'server is holding', (tester) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showExperienceEditor(context, existing: _nimbus),
      );

      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      await _save(tester, opened, 'Save changes');

      expect(api.signatures, ['PATCH /me/experience/8']);
      final body = api.calls.single.body;
      expect(body?['isCurrent'], isTrue);
      // Ticking the box must not disturb the start date it opened on.
      expect(body?['startDate'], '2019-03-01T00:00:00.000Z');

      // This asserts the gap rather than endorsing it, and it is reported as a
      // bug. The row still carries August 2024 as its endDate afterwards,
      // because a PATCH key that is absent means "no change" — and the sheet
      // has no way to send anything else. `endDate` in ExperienceUpdateDto is
      // `z.iso.datetime().optional()` and NOT nullable, so `null` is a 400;
      // sending the date alongside `isCurrent: true` trips the DTO's own refine
      // ("endDate must be omitted when isCurrent is true"). Omitting it is the
      // only body the server accepts, so the stale date survives a save the
      // candidate is told succeeded.
      expect(body?.containsKey('endDate'), isFalse);
      expect(opened.result, isTrue);
    });

    testWidgets('an end date before the start date never leaves the sheet', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showExperienceEditor(context, existing: _nimbus),
      );

      // 2024 is the end year on the fixture; the start year shows 2019, and
      // the months read Mar and Aug, so nothing else answers to "2024".
      await _pickFromDropdown(tester, showing: '2024', choose: '2018');
      await _save(tester, opened, 'Save changes');

      expect(api.calls, isEmpty);
      // The whole sentence, because the sheet also prints an "End date" section
      // label — a substring match here would pass on the label alone.
      expect(
        find.text('End date must be after the start date.'),
        findsOneWidget,
      );
      expect(opened.returned, isFalse);
    });

    testWidgets('a new entry is dated the only way the API accepts', (
      tester,
    ) async {
      final api = _Api();
      final opened = await _openEditor(
        tester,
        api,
        (context) => showExperienceEditor(context),
      );

      await tester.enterText(
        _field('e.g. Nimbus Technologies'),
        'Nimbus Technologies',
      );
      await tester.enterText(
        _field('e.g. Senior Flutter Developer'),
        'QA Engineer',
      );
      await _save(tester, opened, 'Add experience');

      expect(api.signatures, ['POST /me/experience']);
      final body = api.calls.single.body;
      final startDate = body?['startDate'] as String?;
      // Month precision is all the form collects, so the day has to be pinned:
      // a stamp built from "today" would make every duration on the profile
      // drift by up to a month depending on when it was entered.
      expect(startDate, matches(_utcMonthStamp));
      expect(body?['endDate'], matches(_utcMonthStamp));
      expect(body?['isCurrent'], isFalse);
      // …and it is *this* month. The pattern above pins the shape only, so it
      // would sit just as happily over a hardcoded epoch date.
      expect(
        DateTime.now().difference(DateTime.parse(startDate!)).inHours,
        // The first of this month sits between a day ahead of now (a candidate
        // east of Greenwich, on the 1st) and a 31-day month plus a westward
        // offset behind it. Any other month is decades away, not hours.
        inInclusiveRange(-24, 32 * 24),
        reason: 'a new entry was dated some month other than the current one',
      );
      expect(opened.result, isTrue);
    });
  });
}
