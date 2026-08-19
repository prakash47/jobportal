import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/shared/widgets/company_avatar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every seeded company has `logoUrl: null`, so the initials tile is the NORMAL
/// view of a company in this app, not a rare fallback. It is worth a test.
Future<void> _pump(WidgetTester tester, String name) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: CqTheme.light,
      home: Scaffold(body: Center(child: CompanyAvatar(name: name))),
    ),
  );
}

void main() {
  testWidgets('a hyphen between words is not treated as an initial', (
    tester,
  ) async {
    // Rendered "D-" before the fix: the split produced ["Davis", "-", "Nader"]
    // and the second "word" was the hyphen.
    await _pump(tester, 'Davis - Nader');

    expect(find.text('DN'), findsOneWidget);
  });

  testWidgets('two ordinary words give their first letters', (tester) async {
    await _pump(tester, 'Lumen Labs');

    expect(find.text('LL'), findsOneWidget);
  });

  testWidgets('punctuation attached to a word is kept', (tester) async {
    await _pump(tester, 'Jacobson, Medhurst and Powlowski');

    expect(find.text('JM'), findsOneWidget);
  });

  testWidgets('a single word uses its first two letters', (tester) async {
    await _pump(tester, 'Finixo');

    expect(find.text('FI'), findsOneWidget);
  });

  testWidgets('a digit is a valid initial', (tester) async {
    await _pump(tester, '3M India');

    expect(find.text('3I'), findsOneWidget);
  });

  testWidgets('a name with no usable characters falls back to ?', (
    tester,
  ) async {
    await _pump(tester, '- -');

    expect(find.text('?'), findsOneWidget);
  });
}
