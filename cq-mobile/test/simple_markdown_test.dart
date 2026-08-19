import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/shared/widgets/simple_markdown.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pump(WidgetTester tester, String source) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: CqTheme.light,
      home: Scaffold(
        body: SingleChildScrollView(child: SimpleMarkdown(source)),
      ),
    ),
  );
}

/// Every rendered character, so a test can assert that syntax markers are gone
/// without depending on how the body was split into blocks.
String _visibleText(WidgetTester tester) => tester
    .widgetList<RichText>(find.byType(RichText))
    .map((w) => w.text.toPlainText())
    .join('\n');

/// Walks the span tree of the paragraph containing [text].
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

void main() {
  group('SimpleMarkdown', () {
    testWidgets('renders a blockquote as a quote, not a literal angle bracket',
        (tester) async {
      // Three of the seeded career-advice articles use `>`. Before this the
      // reader saw the raw marker in the middle of the prose.
      await _pump(tester, 'Intro line.\n\n> The best time to apply is early.');
      final text = _visibleText(tester);
      expect(text, contains('The best time to apply is early.'));
      expect(text, isNot(contains('>')));
    });

    testWidgets('joins consecutive quote lines into one block', (tester) async {
      await _pump(tester, '> first half\n> second half');
      expect(_visibleText(tester), contains('first half second half'));
      // One quote block, so one bar — not one per source line.
      expect(find.byType(Container), findsOneWidget);
    });

    testWidgets('keeps the author numbering on an ordered list', (tester) async {
      await _pump(tester, '3. third\n4. fourth');
      final text = _visibleText(tester);
      expect(text, contains('3.'));
      expect(text, contains('4.'));
      expect(text, contains('third'));
    });

    testWidgets('makes an https link tappable', (tester) async {
      await _pump(tester, 'See [our guide](https://example.com/guide) first.');
      final link = _spans(tester).firstWhere((s) => s.text == 'our guide');
      expect(link.recognizer, isA<TapGestureRecognizer>());
      // The URL itself is never shown — only the label.
      expect(_visibleText(tester), isNot(contains('https://example.com')));
    });

    testWidgets('refuses to make a non-http link tappable but keeps its words',
        (tester) async {
      // Article bodies are authored content. A hostile or careless one must not
      // be able to hand the OS an arbitrary scheme.
      await _pump(tester, 'Click [here](javascript:alert(1)) now.');
      final span = _spans(tester).firstWhere((s) => s.text == 'here');
      expect(span.recognizer, isNull);
      expect(_visibleText(tester), contains('here'));
      expect(_visibleText(tester), isNot(contains('javascript')));
    });

    testWidgets('does not italicise mid-word underscores', (tester) async {
      // Job descriptions are full of identifiers; emphasis is rare.
      await _pump(tester, 'Set the snake_case_name value.');
      final styled = _spans(tester)
          .where((s) => s.style?.fontStyle == FontStyle.italic);
      expect(styled, isEmpty);
      expect(_visibleText(tester), contains('snake_case_name'));
    });

    testWidgets('still renders bold, bullets and headings', (tester) async {
      await _pump(tester, '## Role\n\n- **Own** the roadmap');
      final text = _visibleText(tester);
      expect(text, contains('Role'));
      expect(text, contains('Own'));
      expect(text, isNot(contains('**')));
      expect(text, isNot(contains('##')));
    });

    testWidgets('leaves unsupported syntax as readable text', (tester) async {
      // Tables are out of scope; the words must survive anyway.
      await _pump(tester, '| Band | Salary |');
      expect(_visibleText(tester), contains('Salary'));
    });
  });
}
