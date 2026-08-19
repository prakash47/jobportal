import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/shared/widgets/cq_chips.dart';
// Tristate lives in dart:ui; `show` keeps TextStyle and friends from
// clashing with the Material ones.
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pump(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: CqTheme.light,
      home: Scaffold(body: Center(child: child)),
    ),
  );
}

void main() {
  group('CqChip', () {
    testWidgets(
      'the tap target is at least 48dp tall — Material asks 48, Apple 44, and '
      'every hand-rolled chip in this app used to be about 30',
      (tester) async {
        await _pump(tester, CqChip(label: 'Remote', onTap: () {}));

        expect(tester.getSize(find.byType(CqChip)).height,
            greaterThanOrEqualTo(48.0));
      },
    );

    testWidgets('a tap anywhere in that target fires, not just on the pill', (
      tester,
    ) async {
      var taps = 0;
      await _pump(tester, CqChip(label: 'Remote', onTap: () => taps++));

      // Near the top edge of the 48dp box — outside the ~32px visible pill.
      final box = tester.getRect(find.byType(CqChip));
      await tester.tapAt(Offset(box.center.dx, box.top + 3));
      await tester.pump();

      expect(taps, 1);
    });

    testWidgets('selected is exposed to screen readers, not just painted', (
      tester,
    ) async {
      await _pump(tester, CqChip(label: 'Remote', selected: true, onTap: () {}));

      final node = tester.getSemantics(find.text('Remote'));
      // isSelected is a Tristate, not a bool: a control can be selected,
      // unselected, or not selectable at all.
      expect(node.flagsCollection.isSelected, Tristate.isTrue);
      expect(node.flagsCollection.isButton, isTrue);
    });

    testWidgets(
      'sizes to its label, so a row of chips does not stack vertically',
      (tester) async {
        // A bare Center inside the tap-target box expanded to the full width
        // offered, which put every chip in a Wrap on its own line. Caught on
        // device, not by the analyzer.
        await _pump(
          tester,
          Wrap(
            children: [
              CqChip(label: 'Relevant', onTap: () {}),
              CqChip(label: 'Newest', onTap: () {}),
            ],
          ),
        );

        final first = tester.getRect(find.byType(CqChip).first);
        final second = tester.getRect(find.byType(CqChip).last);
        expect(first.width, lessThan(200), reason: 'a chip is label-sized');
        expect(
          second.top,
          first.top,
          reason: 'both chips sit on the same line',
        );
      },
    );

    testWidgets('a trailing glyph renders when asked for', (tester) async {
      await _pump(
        tester,
        CqChip(label: 'Industry', onTap: () {}, trailing: Icons.close_rounded),
      );

      expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    });
  });

  group('CqTag', () {
    testWidgets('is a plain label with no button semantics', (tester) async {
      await _pump(tester, const CqTag('Flutter'));

      expect(find.text('Flutter'), findsOneWidget);
      expect(
        tester.getSemantics(find.text('Flutter')).flagsCollection.isButton,
        isFalse,
        reason: 'a skill on a job is a label, not a control',
      );
    });
  });
}
