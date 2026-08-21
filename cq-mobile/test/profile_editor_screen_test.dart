import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/profile/presentation/profile_details_editor_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Everything a candidate has told us about themselves is edited on this one
/// screen, and every save is a PATCH — a body where an absent key means "leave
/// it alone" and a wrong value is written silently. Three bugs of exactly that
/// shape have already shipped from here:
///
///  * a cleared headline / summary / job title saved "successfully" and came
///    back on the next load, because an empty field was skipped instead of sent;
///  * a candidate who opened the editor to fix a typo left with an expected
///    salary they never typed, because the whole-LPA picker rounded ₹8,50,000
///    to 9 and then multiplied 9 back out;
///  * preferred cities could not be emptied at all, and a failed catalogue
///    lookup was one save away from erasing the list it had failed to read.
///
/// Each fix lives in a helper with its own unit test — `patch_body.dart`,
/// `salary_input.dart`, the `_citiesLoaded` flag — and none of those tests can
/// see this screen. The helpers stay correct while the call site quietly stops
/// using them: swap `putClearable` back to an `isNotEmpty` guard, drop
/// `unchangedFrom`, move the cities write behind `_cities.isNotEmpty`, and every
/// existing test in this repo still passes.
///
/// So these mount the real screen over a fake transport and assert on the bytes
/// that would reach the API, plus the states the candidate actually lands in:
/// still loading, loaded with their data in the fields, and failed — where the
/// only safe behaviour is to say why, because a form full of falsely blank
/// fields is a data-loss button with a friendly label.
///
/// Seven text fields and seven keys also mean the wiring itself is a bug
/// surface: two controllers handed to each other read back perfectly — every
/// string is still on screen and still in the body — while a candidate's
/// employer is published as their job title. So the loaded state is asserted
/// per label and the saved body per key, with all values distinct, rather than
/// checking that a set of strings survived somewhere.

// ── The fake API ────────────────────────────────────────────────────────────

const _cityCatalogue = <int, String>{
  1: 'Pune',
  2: 'Bengaluru',
  3: 'Hyderabad',
};

const _industryCatalogue = <int, String>{
  4: 'Consumer Internet',
  5: 'Manufacturing',
};

/// One candidate with every field on the screen already filled in, so a save
/// that drops a key is visible as an absence rather than as a value that was
/// never there.
///
/// `expectedSalaryMinPaise` is ₹8,50,000 — deliberately off the picker's ladder,
/// because a value that is already a whole number of lakhs round-trips
/// correctly even when the rounding guard is gone.
const _storedProfile =
    '{"user":{"name":"Asha Nair","phone":"+91 98765 43210",'
    '"email":"asha@example.com"},'
    '"candidate":{"workStatus":"EXPERIENCED","experienceMonths":36,'
    '"lookingFor":"JOB","headline":"Flutter developer",'
    '"summary":"Six years of Android and Flutter.",'
    '"currentTitle":"Senior Engineer","currentCompanyName":"Acme Corp",'
    '"currentCityName":"Mumbai","expectedSalaryMinPaise":85000000,'
    '"noticePeriodDays":30,"industryId":4,"preferredCityIds":[1,2],'
    '"gender":"FEMALE"}}';

String _catalogPage(Map<int, String> rows) {
  final hits = rows.entries
      .map(
        (e) =>
            '{"id":${e.key},"slug":"${e.value.toLowerCase().replaceAll(' ', '-')}",'
            '"name":"${e.value}"}',
      )
      .join(',');
  return '{"hits":[$hits],"total":${rows.length},"page":1,"pageSize":30}';
}

/// Keeps the requested order, so `?ids=1,2` resolves to "Pune, Bengaluru" the
/// way the field renders it.
Map<int, String> _subset(Map<int, String> all, String ids) => {
  for (final id in ids.split(',').map(int.parse))
    if (all.containsKey(id)) id: all[id]!,
};

/// The four endpoints this screen touches, with each failure the screen has to
/// tell apart. The `/v1` split is honoured exactly: the catalogues carry it and
/// `/me/profile` does not, so a prefix slip shows up here as a fixture that
/// stops being served rather than as a passing test.
class _Api implements HttpClientAdapter {
  /// Recorded then never answered — the only way to hold the screen in its
  /// loading state long enough to look at it.
  bool silent = false;

  /// `GET /me/profile` behaves like a dead network.
  bool profileOffline = false;

  /// The `?ids=` city lookup fails with the server's own words. Separate from
  /// [profileOffline] because the screen must report *which* thing broke.
  bool cityLookupBroken = false;

  /// Non-null → the save is rejected with this NestJS-shaped message.
  String? rejectSaveWith;

  final List<RequestOptions> seen = [];

  /// Decoded PATCH bodies, in call order.
  final List<Map<String, dynamic>> patches = [];

  List<String> get calls => seen.map((o) => '${o.method} ${o.path}').toList();

  RequestOptions requestFor(String path) =>
      seen.lastWhere((o) => o.path == path);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    if (silent) return Completer<ResponseBody>().future;

    if (options.method == 'PATCH' && options.path == '/me/profile') {
      // The bytes on the wire, not the map handed to Dio: a key the client
      // builds and then loses on the way out is exactly the bug class here.
      patches.add(
        jsonDecode(
              requestStream == null
                  ? '{}'
                  : utf8.decode(
                      await requestStream.expand((chunk) => chunk).toList(),
                    ),
            )
            as Map<String, dynamic>,
      );
      final reject = rejectSaveWith;
      if (reject != null) return _reply('{"message":"$reject"}', 400);
      return _reply('{}');
    }

    switch (options.path) {
      case '/me/profile':
        if (profileOffline) {
          throw DioException.connectionError(
            requestOptions: options,
            reason: 'no network',
          );
        }
        return _reply(_storedProfile);
      case '/v1/cities':
        if (cityLookupBroken) {
          return _reply('{"message":"Cities are unavailable right now."}', 503);
        }
        final ids = options.queryParameters['ids'] as String?;
        return _reply(
          _catalogPage(
            ids == null ? _cityCatalogue : _subset(_cityCatalogue, ids),
          ),
        );
      case '/v1/industries':
        final ids = options.queryParameters['ids'] as String?;
        return _reply(
          _catalogPage(
            ids == null ? _industryCatalogue : _subset(_industryCatalogue, ids),
          ),
        );
      default:
        return _reply('{}');
    }
  }

  /// The JSON content-type is load-bearing: without it Dio hands the repository
  /// a String and every parser reads garbage instead of failing.
  ResponseBody _reply(String json, [int status = 200]) =>
      ResponseBody.fromString(
        json,
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

  @override
  void close({bool force = false}) {}
}

// ── Harness ─────────────────────────────────────────────────────────────────

/// What the caller gets back from the editor's route.
///
/// `ProfileScreen` re-reads the profile only when the pop returns `true`, so a
/// save that lands but returns nothing leaves the candidate looking at their
/// old details — the change appears lost.
class _Route {
  bool closed = false;
  bool? result;
}

/// Pushes the editor exactly the way `ProfileScreen._edit` does, over a real
/// Dio whose transport is [api]. Overriding `dioProvider` alone reaches both
/// repositories the screen uses, and keeps `cookieJarProvider` — and
/// path_provider with it — out of the tree.
Future<_Route> _openEditor(WidgetTester tester, _Api api) async {
  // A viewport tall enough for the whole form. The screen is one long
  // ListView, and on a phone-sized surface half its fields are unbuilt; that
  // would make every test below partly a test of scrolling, which is not the
  // thing at risk here.
  tester.view.physicalSize = const Size(1000, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;
  final navigator = GlobalKey<NavigatorState>();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(
        navigatorKey: navigator,
        theme: CqTheme.light,
        home: const Scaffold(body: SizedBox.shrink()),
      ),
    ),
  );

  final route = _Route();
  unawaited(
    navigator.currentState!
        .push<bool>(
          MaterialPageRoute(
            builder: (_) => const ProfileDetailsEditorScreen(),
          ),
        )
        .then((value) {
          route.closed = true;
          route.result = value;
        }),
  );
  await tester.pump();
  return route;
}

/// Advances real frames instead of settling: the brand loader repeats forever,
/// so `pumpAndSettle` never returns on a screen that is loading or saving —
/// and both are states these tests deliberately sit in.
Future<void> _pumpFrames(WidgetTester tester, [int frames = 30]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// The input under a given form label. The label and its field are siblings in
/// the same `_field` column, so the nearest shared Column is the handle.
Finder _input(String label) => find.descendant(
  of: find.ancestor(of: find.text(label), matching: find.byType(Column)).first,
  matching: find.byType(TextField),
);

/// What the field under [label] is holding — as opposed to what is merely
/// somewhere on the screen.
///
/// The seven text inputs here carry seven strings, and asserting each one
/// "appears" only proves the set of strings survived, not that any of them
/// landed in the right box. Two controllers swapped in `_load` puts the
/// employer in the job-title field and the job title in the employer field,
/// with every string still present and every `find.text` still satisfied.
String _valueOf(WidgetTester tester, String label) =>
    tester.widget<TextField>(_input(label)).controller!.text;

Future<void> _save(WidgetTester tester) async {
  await tester.tap(find.text('Save changes'));
  await _pumpFrames(tester);
}

void main() {
  group('opening the editor', () {
    testWidgets('holds the loader over a request that is really in flight', (
      tester,
    ) async {
      final api = _Api()..silent = true;
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      // The request first: `_loading` starts true as a field initialiser, so
      // the loader is on screen one frame after mount whether or not the screen
      // ever asks the server anything. A spinner over a request that was never
      // sent is the forever-spinner, and it looks identical.
      expect(api.calls, contains('GET /me/profile'));
      expect(find.text('Loading your profile…'), findsOneWidget);
      expect(find.text('Save changes'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('fills every field from what the server stored', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      expect(find.text('Loading your profile…'), findsNothing);
      expect(find.text('Save changes'), findsOneWidget);

      // Per label, not per string: the stored values are all distinct, so a
      // pair of controllers wired to each other's field shows up here as a
      // mismatch instead of hiding behind "both words are on screen".
      expect(_valueOf(tester, 'Full name'), 'Asha Nair');
      expect(_valueOf(tester, 'Phone'), '+91 98765 43210');
      expect(_valueOf(tester, 'Headline'), 'Flutter developer');
      expect(_valueOf(tester, 'About you'), 'Six years of Android and Flutter.');
      expect(_valueOf(tester, 'Current title'), 'Senior Engineer');
      expect(_valueOf(tester, 'Current company'), 'Acme Corp');
      expect(_valueOf(tester, 'Current city'), 'Mumbai');

      // The two picker fields hold ids, not text, so they are only right if the
      // screen resolved them against the catalogue.
      expect(find.text('Consumer Internet'), findsOneWidget);
      expect(find.text('Pune, Bengaluru'), findsOneWidget);
      expect(api.requestFor('/v1/cities').queryParameters['ids'], '1,2');
      expect(api.requestFor('/v1/industries').queryParameters['ids'], '4');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a dead server produces a reason, not an empty form', (
      tester,
    ) async {
      final api = _Api()..profileOffline = true;
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      expect(
        find.text("Can't reach the server. Check your connection and try again."),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      // An empty form here would be a save away from blanking the profile.
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Save changes'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'a broken city lookup keeps the form shut instead of showing '
      '"Any location"',
      (tester) async {
        final api = _Api()..cityLookupBroken = true;
        await _openEditor(tester, api);
        await _pumpFrames(tester);

        // The catalogue's own words, because "could not load your profile" sends
        // the candidate to check a profile that is perfectly fine.
        expect(
          find.text('Cities are unavailable right now.'),
          findsOneWidget,
        );
        // The lie this whole path exists to prevent: an unread list rendering as
        // "Any location", which the next save writes back as the truth.
        expect(find.text('Any location'), findsNothing);
        expect(find.text('Save changes'), findsNothing);

        // Recovering must actually re-read, not just hide the error.
        api.cityLookupBroken = false;
        await tester.tap(find.text('Try again'));
        await _pumpFrames(tester);

        expect(find.text('Pune, Bengaluru'), findsOneWidget);
        expect(api.patches, isEmpty, reason: 'nothing was saved along the way');
        expect(tester.takeException(), isNull);
      },
    );
  });

  group('clearing a field', () {
    testWidgets('sends an empty string so the column is actually cleared', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      for (final label in const [
        'Headline',
        'About you',
        'Current title',
        'Current company',
        'Current city',
      ]) {
        await tester.enterText(_input(label), '');
      }
      await _save(tester);

      final body = api.patches.single;
      for (final key in const [
        'headline',
        'summary',
        'currentTitle',
        'currentCompanyName',
        'currentCityName',
      ]) {
        expect(
          body[key],
          '',
          reason:
              'the candidate deleted $key; skipping the key means the PATCH '
              'leaves the old value in place and reports success',
        );
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('leaves an emptied phone out of the body entirely', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.enterText(_input('Phone'), '');
      await _save(tester);

      final body = api.patches.single;
      // phone's DTO is /^[+0-9 \-()]{6,20}$/ — sending '' is a 400 that takes
      // the whole save down with it, so this one field is the exception to the
      // rule above rather than an inconsistency.
      expect(body.containsKey('phone'), isFalse);
      // And the exception is about that DTO, not about "empty means skip":
      // the untouched fields still travel.
      expect(body['headline'], 'Flutter developer');
      expect(body['name'], 'Asha Nair');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a save with no name is refused before any request', (
      tester,
    ) async {
      final api = _Api();
      final route = await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.enterText(_input('Full name'), '');
      await _save(tester);

      expect(find.text('Your name is required.'), findsOneWidget);
      // The DTO's `name: z.string().min(1)` would reject it anyway; catching it
      // here is what stops the rest of the body being written first.
      expect(api.patches, isEmpty);
      expect(route.closed, isFalse);
      expect(tester.takeException(), isNull);
    });
  });

  group('expected salary', () {
    testWidgets('a value the candidate never touched is written back exactly', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      // 9 is not on the ladder — it can only be on screen because ₹8,50,000
      // rounded to it, which is precisely why saving must not multiply it out.
      expect(find.text('9'), findsOneWidget);

      await _save(tester);

      final body = api.patches.single;
      expect(
        body['expectedSalaryMinPaise'],
        85000000,
        reason:
            'the candidate came here to edit something else and would never '
            'spot a ₹50,000 raise appearing on their profile',
      );
      // Nothing was stored for the maximum, so 'Any' must stay silent rather
      // than writing a zero the server would treat as a real ceiling.
      expect(body.containsKey('expectedSalaryMaxPaise'), isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a number the candidate does pick is written at that number', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      // A closed dropdown still holds a hidden copy of every option, for
      // sizing — so '12' is in the tree before anything is tapped, and the menu
      // opening is visible only as one more copy appearing. Counting it is what
      // stops the tap below from quietly landing on a hidden option and
      // changing nothing while the test reads as if a choice was made.
      final optionsBeforeMenu = find.text('12').evaluate().length;
      await tester.tap(find.text('9'));
      await _pumpFrames(tester);
      expect(
        find.text('12'),
        findsNWidgets(optionsBeforeMenu + 1),
        reason: 'tapping the shown value should have opened the min picker',
      );

      // The menu is pushed above the page, so its copy is the last in the tree.
      await tester.tap(find.text('12').last);
      await _pumpFrames(tester);

      await _save(tester);

      expect(api.patches.single['expectedSalaryMinPaise'], 120000000);
      expect(tester.takeException(), isNull);
    });
  });

  group('preferred cities', () {
    testWidgets('emptying the list saves the emptiness', (tester) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.tap(find.text('Pune, Bengaluru'));
      await _pumpFrames(tester);

      // Both stored cities arrive already ticked — identity is by slug, and a
      // city that failed to match itself would come back unticked and then be
      // saved twice.
      expect(find.text('Done (2)'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle_rounded), findsNWidgets(2));

      // Untick both from the list, the way the sheet offers.
      await tester.tap(find.widgetWithText(ListTile, 'Pune'));
      await _pumpFrames(tester);
      await tester.tap(find.widgetWithText(ListTile, 'Bengaluru'));
      await _pumpFrames(tester);

      await tester.tap(find.text('Done (0)'));
      await _pumpFrames(tester);

      expect(find.text('Any location'), findsOneWidget);
      await _save(tester);

      expect(
        api.patches.single['preferredCityIds'],
        isEmpty,
        reason:
            'a candidate who no longer wants to be shown roles in those cities '
            'has no other way to say so',
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('saving', () {
    testWidgets('each edited field leaves under its own key', (tester) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      // Seven different strings on purpose. Every other save test either
      // empties the text fields (so they all become '') or edits exactly one,
      // and neither can tell `currentTitle` from `currentCompanyName` if the
      // two are handed to each other — a swap that would publish a candidate's
      // employer as their job title and would round-trip looking plausible.
      const edits = <String, String>{
        'Full name': 'Asha R Nair',
        'Phone': '+91 90000 11111',
        'Headline': 'Principal engineer',
        'About you': 'Now mostly platform and tooling work.',
        'Current title': 'Staff Architect',
        'Current company': 'Globex',
        'Current city': 'Chennai',
      };
      for (final e in edits.entries) {
        await tester.enterText(_input(e.key), e.value);
      }
      await _save(tester);

      final body = api.patches.single;
      const keyForLabel = <String, String>{
        'Full name': 'name',
        'Phone': 'phone',
        'Headline': 'headline',
        'About you': 'summary',
        'Current title': 'currentTitle',
        'Current company': 'currentCompanyName',
        'Current city': 'currentCityName',
      };
      keyForLabel.forEach((label, key) {
        expect(
          body[key],
          edits[label],
          reason: 'the $label box was typed into; $key is what the API writes '
              'it to, and nothing on the profile screen would reveal a swap',
        );
      });
      expect(tester.takeException(), isNull);
    });

    testWidgets('a successful save tells the caller, so the profile refreshes', (
      tester,
    ) async {
      final api = _Api();
      final route = await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.enterText(_input('Headline'), 'Staff engineer');
      await _save(tester);

      expect(api.calls.last, 'PATCH /me/profile');
      expect(api.patches.single['headline'], 'Staff engineer');
      expect(route.closed, isTrue);
      expect(
        route.result,
        isTrue,
        reason:
            'ProfileScreen re-reads only on true; anything else leaves the '
            'candidate looking at the details they just changed',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a rejected save keeps the form and the typing', (
      tester,
    ) async {
      final api = _Api()..rejectSaveWith = 'Phone number looks wrong.';
      final route = await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.enterText(_input('Headline'), 'Staff engineer');
      await _save(tester);

      // The API's own sentence, not a generic one — it names the field to fix.
      expect(find.text('Phone number looks wrong.'), findsOneWidget);
      expect(route.closed, isFalse);
      expect(find.text('Save changes'), findsOneWidget);
      // Losing the edit on a failed save means retyping it blind — and it has
      // to still be in the Headline box, not merely somewhere on the screen.
      expect(_valueOf(tester, 'Headline'), 'Staff engineer');
      expect(tester.takeException(), isNull);
    });

    testWidgets('switching to Fresher hides the job fields and stops sending them', (
      tester,
    ) async {
      final api = _Api();
      await _openEditor(tester, api);
      await _pumpFrames(tester);

      await tester.tap(find.text('Fresher'));
      await _pumpFrames(tester);

      expect(find.text('Current title'), findsNothing);
      expect(find.text('Current company'), findsNothing);

      await _save(tester);

      final body = api.patches.single;
      expect(body['workStatus'], 'FRESHER');
      // Current, shipped behaviour, pinned rather than endorsed: the keys are
      // simply omitted, and on a PATCH that means the old job title, employer
      // and 36 months of experience stay on the record. The profile screen goes
      // on rendering "Current role — Senior Engineer at Acme Corp" under a
      // candidate who has just declared themselves a fresher. Reported as a
      // bug; the onboarding wizard's version of this step does write
      // `experienceMonths: 0` here, so the two screens disagree.
      expect(body.containsKey('currentTitle'), isFalse);
      expect(body.containsKey('currentCompanyName'), isFalse);
      expect(body.containsKey('experienceMonths'), isFalse);
      expect(tester.takeException(), isNull);
    });
  });
}
