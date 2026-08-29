import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cq_mobile/core/network/network_providers.dart';
import 'package:cq_mobile/core/router/app_router.dart';
import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/career_advice/presentation/article_detail_screen.dart';
import 'package:cq_mobile/features/career_advice/presentation/career_advice_screen.dart';
import 'package:cq_mobile/shared/widgets/cq_chips.dart';
import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// Career advice is the only place in Career Queue where the SERVER decides
/// what the app renders as UI. Every other screen is handed values and lays
/// them out; here an article body arrives as raw markdown and is turned into
/// headings, bullets and quotes on the phone. Neither of these two screens had
/// ever been mounted in a test.
///
/// What that leaves unguarded:
///
///  * **The renderer is proven, the wiring is not.** simple_markdown_test.dart
///    checks SimpleMarkdown character by character, and passes on a string the
///    test itself wrote. It cannot see the field in between:
///    `ArticleDetail.fromJson` reads `body`, falls back to `bodyMarkdown`, then
///    `bodyHtml`, then to the empty string — so the API renaming that column is
///    not an error anywhere in this app. It is a reader who opens an article
///    and finds a headline with nothing under it. The same silence covers a
///    200 whose shape has drifted entirely.
///  * **The topic chips have no server behind them.** `GET /v1/career-advice`
///    returns hits and a total and no facet counts whatsoever, so the row of
///    topics is assembled out of whichever page happens to be loaded and grows
///    as the reader pages on. That is the shipped design given the endpoint,
///    not a defect — but it is surprising enough to be worth pinning, so that
///    nobody reads the chip row as "every topic we publish".
///  * **It is a list-then-detail pair over a mobile network.** That is the
///    exact shape that already cost this codebase a refresh which erased a
///    loaded list, so the failure paths are tested from both directions: with
///    nothing on screen (full error view, retry) and with something on screen
///    (keep it, say so).
///
/// The repository underneath is already pinned by repositories_contract_test —
/// the `/v1` prefix, the trimmed `q`, the 404 wording, and the way "related"
/// is derived from the index. None of that is repeated here. What is asserted
/// here is what the reader ends up looking at.

// ── The server ──────────────────────────────────────────────────────────────

/// One canned answer. A status >= 400 makes Dio raise the same `DioException`,
/// body attached, that the repository catches in production.
class _Reply {
  const _Reply(this.json, {this.status = 200});

  final String json;
  final int status;
}

/// The API, scripted per request. Returning null from the script means "never
/// answers" — a request still in flight; throwing from it is a dead network.
///
/// [script] is deliberately mutable: several tests below need a server that is
/// broken for one call and healthy for the next, which is the only way to
/// reach a refresh failure (as opposed to a first-load failure).
class _Api implements HttpClientAdapter {
  _Api(this.script);

  _Reply? Function(RequestOptions options) script;

  final List<RequestOptions> seen = [];

  /// 'GET /v1/career-advice', in call order.
  List<String> get calls =>
      seen.map((o) => '${o.method} ${o.path}').toList(growable: false);

  /// The query string of every index request, in order — the screen's own
  /// choice of tag, search words and page, stringified.
  List<Map<String, String>> get indexQueries => seen
      .where((o) => o.path == _indexPath)
      .map((o) => o.queryParameters.map((k, v) => MapEntry(k, '$v')))
      .toList(growable: false);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    final reply = script(options);
    if (reply == null) return Completer<ResponseBody>().future;
    // Without the content-type Dio hands the repository a String and every
    // parser in article_models.dart silently reads garbage instead of failing.
    return ResponseBody.fromString(
      reply.json,
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const _indexPath = '/v1/career-advice';

/// PAGE_SIZE in apps/api/src/public-articles/public-articles.service.ts. It
/// matters: the pager the reader taps is drawn from `total` divided by this,
/// so a fixture that shrank it would make paging reachable in a way the real
/// endpoint never is.
const _pageSize = 20;

// ── Fixtures ────────────────────────────────────────────────────────────────

const _resumeSlug = 'how-to-write-an-indian-resume';
const _interviewSlug = 'ten-questions-every-interviewer-asks';
const _salarySlug = 'negotiating-your-first-salary';

const _resumeTitle = 'How to write an Indian resume';
const _interviewTitle = 'Ten questions every interviewer asks';
const _salaryTitle = 'Negotiating your first salary';

/// One row of `GET /v1/career-advice`, field for field as the Nest service
/// projects it.
///
/// `coverImageUrl` is null throughout, matching the shipped corpus — and a URL
/// here would send ArticleCoverImage at the network, which in a widget test
/// resolves to a 400 and an exception box over the card being asserted on.
Map<String, Object?> _summary({
  required String slug,
  required String title,
  required List<String> tags,
}) => {
  'slug': slug,
  'title': title,
  'excerpt': 'What hiring managers actually look for.',
  'authorName': 'Meera Rao',
  'publishedAt': '2026-07-14T06:30:00.000Z',
  'readTimeMinutes': 6,
  'tags': tags,
  'coverImageUrl': null,
};

/// 21 published articles — one more than a page — so the pager is real rather
/// than arranged, and so the second page carries a topic the first page never
/// mentions.
final _corpus = <Map<String, Object?>>[
  _summary(slug: _resumeSlug, title: _resumeTitle, tags: ['resume', 'freshers']),
  _summary(slug: _interviewSlug, title: _interviewTitle, tags: ['interview']),
  for (var i = 1; i <= 18; i++)
    _summary(slug: 'resume-basics-$i', title: 'Resume basics $i', tags: [
      'resume',
    ]),
  _summary(slug: _salarySlug, title: _salaryTitle, tags: ['salary']),
];

/// A body using every construct the shipped corpus actually contains: a
/// heading, a bold run, bullets, a pull quote, and one outbound link.
const _resumeBody = '''
## Before you start

Recruiters skim. Give them your numbers in the top third of the page, and keep
the whole thing to **one page** unless you have shipped a decade of work.

- Lead with impact, not with duties
- Name the tools you actually used

> A resume gets six seconds. Spend them on the top third.

The [official format guide](https://careerqueue.in/resume-format) has a
template worth copying.
''';

String _detailJson({
  required String slug,
  required String title,
  required String body,
  List<String> tags = const [],
  List<Map<String, String>> faqs = const [],
}) => jsonEncode({
  'id': 4,
  'slug': slug,
  'title': title,
  'body': body,
  'excerpt': 'What hiring managers actually look for.',
  'authorName': 'Meera Rao',
  'publishedAt': '2026-07-14T06:30:00.000Z',
  'updatedAt': '2026-07-20T06:30:00.000Z',
  'readTimeMinutes': 6,
  'tags': tags,
  'faqs': faqs,
  'coverImageUrl': null,
});

final _details = <String, String>{
  _resumeSlug: _detailJson(
    slug: _resumeSlug,
    title: _resumeTitle,
    body: _resumeBody,
    tags: const ['resume', 'freshers'],
    faqs: const [
      {
        'question': 'How long should a fresher resume be?',
        'answer': 'One page. Nobody reads the second.',
      },
    ],
  ),
  // The second card in the list, and the one the navigation test opens: a card
  // that always opened `hits.first` would be indistinguishable from a correct
  // one if the test only ever tapped the top of the list.
  _interviewSlug: _detailJson(
    slug: _interviewSlug,
    title: _interviewTitle,
    body: 'Rehearse the weakness answer out loud before the call.',
    tags: const ['interview'],
  ),
  _salarySlug: _detailJson(
    slug: _salarySlug,
    title: _salaryTitle,
    body: 'Ask for the range before you name a number.',
  ),
};

/// What `friendlyDioMessage` gives a request that never reached a server. It is
/// the sentence the reader is actually left holding, so the tests below assert
/// it rather than settling for "some error is on screen".
const _offline = "Can't reach the server. Check your connection and try again.";

/// A whole library: the index filters by `tag` and `q` and slices by `page`
/// exactly as the Nest service does, so what comes back is decided by the
/// query the SCREEN chose to send. That is what makes the filter and pager
/// tests about the reader's list rather than about a string in a URL.
_Api _library() => _Api((o) {
  if (o.path == _indexPath) {
    final tag = o.queryParameters['tag'] as String?;
    final q = o.queryParameters['q'] as String?;
    var hits = _corpus;
    if (tag != null) {
      hits = hits.where((a) => (a['tags']! as List).contains(tag)).toList();
    }
    if (q != null) {
      final needle = q.toLowerCase();
      hits = hits
          .where((a) => '${a['title']}'.toLowerCase().contains(needle))
          .toList();
    }
    final page = int.tryParse('${o.queryParameters['page'] ?? 1}') ?? 1;
    final from = math.min((page - 1) * _pageSize, hits.length);
    final to = math.min(from + _pageSize, hits.length);
    return _Reply(
      jsonEncode({
        'hits': hits.sublist(from, to),
        'total': hits.length,
        'page': page,
        'pageSize': _pageSize,
      }),
    );
  }
  if (o.path.startsWith('$_indexPath/')) {
    final json = _details[o.path.substring(_indexPath.length + 1)];
    // A draft, an archived article and a slug that never existed are one
    // response — the service makes them byte-identical on purpose.
    return json == null
        ? const _Reply('{"message":"Article not found"}', status: 404)
        : _Reply(json);
  }
  return const _Reply('{}');
});

/// A phone with no signal.
_Reply? _noSignal(RequestOptions options) => throw DioException.connectionError(
  requestOptions: options,
  reason: 'no network',
);

// ── Harness ─────────────────────────────────────────────────────────────────

const _phone = Size(390, 844);

/// Mounts [screen] over a real Dio whose transport is faked.
///
/// Overriding `dioProvider` reaches the whole data layer — the articles
/// repository is a `FutureProvider` built from it — and keeps `cookieJarProvider`,
/// and so path_provider, out of the graph entirely.
Future<void> _mount(WidgetTester tester, Widget screen, _Api api) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp(theme: CqTheme.light, home: screen),
    ),
  );
  await tester.pump();
}

/// The list and the article behind a router, for the one test that crosses
/// between them.
///
/// A local route table rather than the app's own: `routerProvider` starts at
/// the splash and reaches the article only through the tabbed shell, which
/// would mount five unrelated screens and their five unrelated requests around
/// the two under test. The two paths here are copied from app_router.dart, and
/// the destination is the real ArticleDetailScreen — so what this proves is
/// that the card carries the right slug all the way to the request, not that
/// the app's route table contains the pattern (router_redirect_test owns that).
Future<void> _mountRouted(WidgetTester tester, _Api api) async {
  tester.view.physicalSize = _phone;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = api;

  final router = GoRouter(
    initialLocation: AppRoutes.careerAdvice,
    routes: [
      GoRoute(
        path: AppRoutes.careerAdvice,
        builder: (_, _) => const CareerAdviceScreen(),
      ),
      GoRoute(
        path: '/article/:slug',
        builder: (_, state) =>
            ArticleDetailScreen(slug: state.pathParameters['slug'] ?? ''),
      ),
    ],
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWith((ref) async => dio)],
      child: MaterialApp.router(theme: CqTheme.light, routerConfig: router),
    ),
  );
  await tester.pump();
}

/// Advances a handful of frames so the load chain (provider → repository →
/// request → setState) lands.
///
/// `pumpAndSettle` is not an option: CqLoader's brand animation repeats
/// forever, so settling on a screen that is still loading never returns — and
/// "still loading" is one of the states under test.
Future<void> _pumpFrames(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

/// Frames plus the length of a route transition, for the push between screens.
Future<void> _pumpRoute(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  await _pumpFrames(tester);
}

/// Drags the article list far enough to arm its RefreshIndicator.
///
/// Targeting the RefreshIndicator's own scrollable matters: the first
/// Scrollable in this tree is the horizontal topic-chip row, and flinging that
/// refreshes nothing while looking like it did.
Future<void> _pullToRefresh(WidgetTester tester) async {
  final scrollable = find.descendant(
    of: find.byType(RefreshIndicator),
    matching: find.byType(Scrollable),
  );
  await tester.fling(scrollable.first, const Offset(0, 320), 1000);
  await _pumpFrames(tester);
}

/// The list's own scrollable, for reaching the pager below twenty cards.
Finder get _articleList => find
    .descendant(
      of: find.byType(RefreshIndicator),
      matching: find.byType(Scrollable),
    )
    .first;

// ── Reading the screen ──────────────────────────────────────────────────────

/// Every line of text on screen, so a test can assert that markdown markers
/// are gone without depending on how the body was split into blocks.
List<String> _visibleLines(WidgetTester tester) => tester
    .widgetList<RichText>(find.byType(RichText))
    .map((w) => w.text.toPlainText())
    .where((s) => s.trim().isNotEmpty)
    .toList(growable: false);

String _visibleText(WidgetTester tester) => _visibleLines(tester).join('\n');

/// The style the reader actually sees on the rendered line containing [needle].
///
/// Reading `RichText.text.style` directly gives the ambient DefaultTextStyle
/// for every line on the page — `Text.rich` puts that on the root span and
/// nests the span it was handed underneath. The block's own choice of size and
/// weight is one level down.
TextStyle _styleOfLine(WidgetTester tester, String needle) {
  final root =
      tester
              .widgetList<RichText>(find.byType(RichText))
              .firstWhere((w) => w.text.toPlainText().contains(needle))
              .text
          as TextSpan;
  return root.children!.first.style!;
}

/// Walks the span tree of everything on screen.
List<TextSpan> _spans(WidgetTester tester) {
  final out = <TextSpan>[];
  void walk(InlineSpan s) {
    if (s is TextSpan) {
      out.add(s);
      for (final c in s.children ?? const <InlineSpan>[]) {
        walk(c);
      }
    }
  }

  for (final w in tester.widgetList<RichText>(find.byType(RichText))) {
    walk(w.text);
  }
  return out;
}

/// Whether the topic chip labelled [label] is drawn as the current filter.
bool _chipIsSelected(WidgetTester tester, String label) =>
    tester.widget<CqChip>(find.widgetWithText(CqChip, label)).selected;

void main() {
  group('the career-advice list', () {
    testWidgets('says it is loading, and has actually asked for articles', (
      tester,
    ) async {
      // `_loading` is a field initialiser, so the loading line is on screen one
      // frame after mount whether or not initState ever sent a request. A
      // spinner over a request that was never made is a forever-spinner, so
      // the request has to be part of this assertion.
      final api = _Api((_) => null);
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      expect(api.calls, contains('GET $_indexPath'));
      expect(find.text('Loading articles…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows the page it was given, and only that page', (
      tester,
    ) async {
      await _mount(tester, const CareerAdviceScreen(), _library());
      await _pumpFrames(tester);

      expect(find.text('Loading articles…'), findsNothing);
      expect(find.text(_resumeTitle), findsOneWidget);
      expect(find.text(_interviewTitle), findsOneWidget);

      // The 21st article exists on the server and belongs to page two. Looking
      // for it from the top of the list would prove nothing — a card nobody has
      // scrolled to is never built, so page two's articles are "absent" either
      // way. It has to be looked for at the foot of the list, where a 21st card
      // would sit, immediately above the pager.
      await tester.scrollUntilVisible(
        find.byTooltip('Next page'),
        300,
        scrollable: _articleList,
      );
      expect(find.text(_salaryTitle), findsNothing,
          reason: 'the screen rendered more than the page it asked for');
      expect(tester.takeException(), isNull);
    });

    testWidgets('a first load that fails offers a retry that works', (
      tester,
    ) async {
      final api = _Api(_noSignal);
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      expect(find.text('Loading articles…'), findsNothing,
          reason: 'the screen span forever instead of reporting the failure');
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(find.text(_offline), findsOneWidget,
          reason: 'an icon without words leaves the reader guessing whether it '
              'is their signal or our library that is broken');
      expect(find.text('Try again'), findsOneWidget,
          reason: 'without a retry the reader can only kill the app');

      // The network comes back. The retry has to be a real reload, not a
      // repaint of the error it is standing on.
      api.script = _library().script;
      await tester.tap(find.text('Try again'));
      await _pumpFrames(tester);

      expect(find.text(_resumeTitle), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an empty library explains itself instead of showing nothing', (
      tester,
    ) async {
      // A CMS with nothing published yet, which is also what every tag filter
      // looks like on day one.
      await _mount(
        tester,
        const CareerAdviceScreen(),
        _Api(
          (_) => const _Reply(
            '{"hits":[],"total":0,"page":1,"pageSize":$_pageSize}',
          ),
        ),
      );
      await _pumpFrames(tester);

      expect(find.text('No articles here yet'), findsOneWidget);
      // Nothing was searched for, so blaming a search would be a lie.
      expect(find.text('Try a different topic.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the topic chips are built from the page in hand', (
      tester,
    ) async {
      // `GET /v1/career-advice` returns hits and a total and NO facet counts,
      // so there is nothing to build a catalogue of topics from. The screen
      // unions the tags of whatever it has loaded — which means the chip row
      // is not the list of topics the site publishes, it is the list of topics
      // this reader has happened to scroll past. Pinned, not judged: without
      // an endpoint the alternative is no chips at all.
      await _mount(tester, const CareerAdviceScreen(), _library());
      await _pumpFrames(tester);

      expect(find.widgetWithText(CqChip, 'Resume'), findsOneWidget);
      expect(find.widgetWithText(CqChip, 'Freshers'), findsOneWidget);
      expect(find.widgetWithText(CqChip, 'Interview'), findsOneWidget);
      // Salary is the topic of the 21st article and of no other. A reader on
      // page one cannot filter by it, because as far as this screen knows it
      // does not exist.
      expect(find.widgetWithText(CqChip, 'Salary'), findsNothing);

      await tester.scrollUntilVisible(
        find.byTooltip('Next page'),
        300,
        scrollable: _articleList,
      );
      await tester.tap(find.byTooltip('Next page'));
      await _pumpFrames(tester);

      // Having paged there, the topic is offered — and the earlier ones stay,
      // because the set only ever grows.
      expect(find.widgetWithText(CqChip, 'Salary'), findsOneWidget);
      expect(find.widgetWithText(CqChip, 'Interview'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('picking a topic narrows the list, and All widens it again', (
      tester,
    ) async {
      final api = _library();
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      await tester.tap(find.widgetWithText(CqChip, 'Interview'));
      await _pumpFrames(tester);

      expect(api.indexQueries.last['tag'], 'interview',
          reason: 'the filter has to reach the server — the screen holds one '
              'page and cannot filter the other twenty articles itself');
      expect(find.text(_interviewTitle), findsOneWidget);
      expect(find.text(_resumeTitle), findsNothing);

      await tester.tap(find.widgetWithText(CqChip, 'All'));
      await _pumpFrames(tester);

      // Absent, not empty: `tag: ''` would filter for a tag nothing carries.
      expect(api.indexQueries.last.containsKey('tag'), isFalse);
      expect(find.text(_resumeTitle), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a search that matches nothing names what was searched for', (
      tester,
    ) async {
      final api = _library();
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      await tester.enterText(find.byType(TextField), 'kubernetes');
      // Searched on submit, not per keystroke — the screen wires onSubmitted.
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await _pumpFrames(tester);

      expect(api.indexQueries.last['q'], 'kubernetes');
      expect(find.text('No results for "kubernetes"'), findsOneWidget);
      expect(
        find.text('Try different words, or clear the search.'),
        findsOneWidget,
        reason: 'a dead end here is a reader who has to guess that the box at '
            'the top is why the screen is empty',
      );

      await tester.tap(find.byTooltip('Clear'));
      await _pumpFrames(tester);

      expect(api.indexQueries.last.containsKey('q'), isFalse);
      expect(find.text(_resumeTitle), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('paging forward asks for the next page and shows it', (
      tester,
    ) async {
      final api = _library();
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      // The pager sits under twenty cards, where the reader meets it.
      await tester.scrollUntilVisible(
        find.byTooltip('Next page'),
        300,
        scrollable: _articleList,
      );
      expect(find.text('Page 1 of 2'), findsOneWidget);

      await tester.tap(find.byTooltip('Next page'));
      await _pumpFrames(tester);

      expect(api.indexQueries.last['page'], '2');
      expect(find.text(_salaryTitle), findsOneWidget);
      expect(find.text(_resumeTitle), findsNothing);
      expect(find.text('Page 2 of 2'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed refresh keeps the articles already on screen', (
      tester,
    ) async {
      final api = _library();
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      // Precondition: there is something to lose.
      expect(find.text(_resumeTitle), findsOneWidget);

      api.script = _noSignal;
      await _pullToRefresh(tester);

      expect(find.text(_resumeTitle), findsOneWidget,
          reason: 'a failed refresh threw away the reading list the user had');
      expect(find.byIcon(Icons.cloud_off_rounded), findsNothing);
      // Silence would be its own bug: the reader pulled, so something has to
      // say that nothing newer arrived — and say what went wrong, not just
      // flash a bar.
      expect(
        find.descendant(
          of: find.byType(SnackBar),
          matching: find.text(_offline),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a topic that fails to load puts its chip back', (
      tester,
    ) async {
      // `_selectTag` sets the tag before the request so the chip lights up at
      // once, and a failed request with content on screen keeps that content.
      // Each rule is right alone; together they used to leave the chip painted
      // as the active filter over a list that was never filtered by it — a
      // reader tapping Interview on a bad connection saw resume articles under
      // a lit Interview chip. _selectTag now restores the previous tag when the
      // results it promised never arrive, so the chip row and the list always
      // agree.
      final api = _library();
      await _mount(tester, const CareerAdviceScreen(), api);
      await _pumpFrames(tester);

      api.script = _noSignal;
      await tester.tap(find.widgetWithText(CqChip, 'Interview'));
      await _pumpFrames(tester);

      expect(
        find.descendant(
          of: find.byType(SnackBar),
          matching: find.text(_offline),
        ),
        findsOneWidget,
      );
      expect(_chipIsSelected(tester, 'Interview'), isFalse,
          reason: 'the chip must not claim a filter that was never applied');
      expect(_chipIsSelected(tester, 'All'), isTrue,
          reason: 'the selection returns to what the list on screen actually is');
      expect(find.text(_resumeTitle), findsOneWidget,
          reason: 'the results the reader already had are kept');
      expect(tester.takeException(), isNull);
    });

    testWidgets('tapping an article opens that article', (tester) async {
      final api = _library();
      await _mountRouted(tester, api);
      await _pumpFrames(tester);

      // Deliberately the SECOND card. A card wired to `hits.first` — or to a
      // slug captured once outside the builder — behaves identically to a
      // correct one for as long as the only card anybody taps is the top one.
      await tester.tap(find.text(_interviewTitle));
      await _pumpRoute(tester);

      expect(api.calls, contains('GET $_indexPath/$_interviewSlug'),
          reason: 'the card has to carry its own slug through the route');
      expect(api.calls, isNot(contains('GET $_indexPath/$_resumeSlug')),
          reason: 'tapping the second card opened the first one');
      // Prose only this article's detail response contains — the card it was
      // opened from carried a title and an excerpt, never a body.
      expect(find.textContaining('Rehearse the weakness answer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('the article', () {
    testWidgets('says it is loading, and has actually asked for the slug', (
      tester,
    ) async {
      final api = _Api((_) => null);
      await _mount(tester, const ArticleDetailScreen(slug: _resumeSlug), api);
      await _pumpFrames(tester);

      expect(api.calls, contains('GET $_indexPath/$_resumeSlug'));
      expect(find.text('Loading article…'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('renders the body as prose, not as markdown', (tester) async {
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _library(),
      );
      await _pumpFrames(tester);

      final visible = _visibleText(tester);

      // Every construct arrives as words.
      expect(find.text('Before you start'), findsOneWidget);
      expect(find.textContaining('Lead with impact'), findsOneWidget);
      expect(find.textContaining('A resume gets six seconds'), findsOneWidget);
      expect(visible, contains('one page'));

      // And none of them arrives as a marker. This is the whole difference
      // between a rendered article and a text file on screen, and the failure
      // is silent: a body handed to the wrong renderer still fills the page.
      expect(visible, isNot(contains('#')));
      expect(visible, isNot(contains('**')));
      expect(visible, isNot(contains('>')));
      expect(visible, isNot(contains('- ')));

      // Markers gone is not enough on its own — a renderer that stripped `##`
      // and then drew the heading at body size would pass everything above and
      // still give the reader an undifferentiated wall.
      final heading = _styleOfLine(tester, 'Before you start');
      final paragraph = _styleOfLine(tester, 'Recruiters skim');
      expect(heading.fontSize!, greaterThan(paragraph.fontSize!));
      expect(heading.fontWeight!.value, greaterThan(paragraph.fontWeight!.value));
      expect(tester.takeException(), isNull);
    });

    testWidgets('a link in the body is tappable and shows its words', (
      tester,
    ) async {
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _library(),
      );
      await _pumpFrames(tester);

      final link = _spans(
        tester,
      ).firstWhere((s) => s.text == 'official format guide');
      expect(link.recognizer, isA<TapGestureRecognizer>(),
          reason: 'a link the reader cannot tap is a dead reference');
      // The destination belongs in the tap target, not in the sentence.
      expect(_visibleText(tester), isNot(contains('careerqueue.in')));
      expect(tester.takeException(), isNull);
    });

    testWidgets('an FAQ answer stays behind its question until asked', (
      tester,
    ) async {
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _library(),
      );
      await _pumpFrames(tester);

      const question = 'How long should a fresher resume be?';
      expect(find.text('FAQs'), findsOneWidget);
      expect(find.text(question), findsOneWidget);
      expect(find.text('One page. Nobody reads the second.'), findsNothing,
          reason: 'an FAQ list that is already open is just more body text');

      await tester.tap(find.text(question));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('One page. Nobody reads the second.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a failed load offers a retry that works', (tester) async {
      final api = _Api(_noSignal);
      await _mount(tester, const ArticleDetailScreen(slug: _resumeSlug), api);
      await _pumpFrames(tester);

      expect(find.text('Loading article…'), findsNothing);
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);

      api.script = _library().script;
      await tester.tap(find.text('Try again'));
      await _pumpFrames(tester);

      expect(find.text(_resumeTitle), findsOneWidget);
      expect(find.textContaining('Recruiters skim'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('an article that is gone says so, and is still recoverable', (
      tester,
    ) async {
      // Unpublishing an article is a 404 to everyone already holding its link,
      // and those links are shared. "Article not found." is the difference
      // between a reader who understands and a reader who blames the app.
      await _mount(
        tester,
        const ArticleDetailScreen(slug: 'an-article-we-unpublished'),
        _library(),
      );
      await _pumpFrames(tester);

      expect(find.text('Article not found.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a related-articles failure does not take the article away', (
      tester,
    ) async {
      // "More on this topic" is decoration below the fold, fetched with a
      // second request AFTER the article has already been painted — and inside
      // the same try/catch that owns the article's own error state. If that
      // request's failure ever escaped, a perfectly good article the reader is
      // halfway through would be replaced by an error page.
      final library = _library();
      final api = _Api((o) {
        if (o.path == _indexPath) return _noSignal(o);
        return library.script(o);
      });
      await _mount(tester, const ArticleDetailScreen(slug: _resumeSlug), api);
      await _pumpFrames(tester);

      expect(find.textContaining('Recruiters skim'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_rounded), findsNothing);
      expect(find.text('More on this topic'), findsNothing,
          reason: 'an empty Read next section is worse than none');
      expect(tester.takeException(), isNull);
    });

    testWidgets('related reading appears without the article being read', (
      tester,
    ) async {
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _library(),
      );
      await _pumpFrames(tester);

      expect(find.text('More on this topic'), findsOneWidget);
      expect(find.text('Resume basics 1'), findsOneWidget);
      // "You are reading this" offered as the first thing to read next is the
      // classic version of this bug, and the headline says those same words at
      // the top of the same page — so the check has to be scoped to the rows
      // that are tappable. The headline is not inside an InkWell; every related
      // row is.
      final relatedRows = find.byType(InkWell);
      expect(
        find.descendant(of: relatedRows, matching: find.text('Resume basics 1')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: relatedRows, matching: find.text(_resumeTitle)),
        findsNothing,
        reason: 'the article is offered as somewhere else to go from itself',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('an article with no body says so, and offers the website', (
      tester,
    ) async {
      // `ArticleDetail.fromJson` treats a missing body as the empty string, so
      // an API that renames the column — or an editor who publishes an empty
      // draft — produces a 200 with no error and nothing to read. This used to
      // render as a headline and a byline over blankness, leaving the reader to
      // guess whether to scroll or reload. The screen now says which of the two
      // it is and hands them the website copy, which renders the same article
      // through a different pipeline.
      //
      // Tags are empty here so no related request fires and the emptiness
      // underneath the headline is unambiguous.
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _Api(
          (_) => _Reply(
            jsonEncode({
              'slug': _resumeSlug,
              'title': _resumeTitle,
              'authorName': 'Meera Rao',
              'publishedAt': '2026-07-14T06:30:00.000Z',
              'readTimeMinutes': 6,
              'tags': <String>[],
              'faqs': <Object>[],
            }),
          ),
        ),
      );
      await _pumpFrames(tester);

      // Not an error state — the request succeeded — so no retry. What the
      // reader gets instead is a sentence and a way out.
      expect(find.text('Try again'), findsNothing);
      expect(find.text('This article has no text yet.'), findsOneWidget);
      expect(find.text('Open on the website'), findsOneWidget);
      // The headline and byline still stand above it.
      expect(find.text(_resumeTitle), findsOneWidget);
      expect(
        _visibleLines(tester).any((l) => l.contains('Meera Rao')),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('a response the app cannot read is explained, not blank', (
      tester,
    ) async {
      // CURRENT BEHAVIOUR, reported rather than fixed. Every field in
      // ArticleDetail.fromJson has a fallback and the repository turns a null
      // body into `const {}`, so a 200 carrying a shape this app has never
      // seen — a proxy's error page, a renamed envelope, a wrong endpoint that
      // still answers — is indistinguishable from a real article with nothing
      // in it. The reader gets an app bar and white space, with no failure to
      // retry and no reason given.
      await _mount(
        tester,
        const ArticleDetailScreen(slug: _resumeSlug),
        _Api((_) => const _Reply('{}')),
      );
      await _pumpFrames(tester);

      expect(find.text('Loading article…'), findsNothing);
      // Still not an error state — the request DID succeed, so there is nothing
      // to retry. But the reader is no longer left on white space.
      expect(find.text('Try again'), findsNothing);
      expect(find.text('This article has no text yet.'), findsOneWidget);
      expect(find.text('Open on the website'), findsOneWidget);

      // The honest limit of this fix, worth stating: a drifted response and a
      // genuinely empty draft are indistinguishable to the app — both arrive as
      // a 200 that parses into an article with no body — so both land on the
      // same sentence. Telling them apart needs the API to stop letting every
      // field fall back, which is a backend change.
      expect(tester.takeException(), isNull);
    });
  });
}
