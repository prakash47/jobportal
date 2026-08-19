import 'package:cq_mobile/core/format/salary_input.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('expected salary input', () {
    test('a value the user never touched keeps its exact paise', () {
      // ₹8,50,000 stored. The picker offers whole LPA only, so it shows 9.
      const stored = 85000000;
      expect(lpaFromPaise(stored), 9);

      // Saving without touching salary must not write ₹9,00,000. This is the
      // whole reason unchangedFrom exists: the candidate came to fix a typo in
      // their headline, and a silent ₹50,000 raise is not something they would
      // ever spot.
      expect(paiseForLpa(9, unchangedFrom: stored), stored);
    });

    test('an actual change is written at the picked value', () {
      expect(paiseForLpa(12, unchangedFrom: 85000000), 120000000);
    });

    test('a first-time pick converts from LPA', () {
      expect(paiseForLpa(10, unchangedFrom: null), 100000000);
    });

    test('clearing the picker sends nothing rather than zero', () {
      expect(paiseForLpa(null, unchangedFrom: 85000000), isNull);
      expect(paiseForLpa(null), isNull);
    });

    test('a value already exact round-trips unchanged', () {
      const exact = 12 * paisePerLpa;
      expect(paiseForLpa(lpaFromPaise(exact), unchangedFrom: exact), exact);
    });

    test('both screens share one ladder and one unit', () {
      // The bug this file was written for was two screens disagreeing about
      // what the number meant, so the constants must have exactly one home.
      expect(paisePerLpa, 10000000);
      expect(salaryLpaOptions, contains(12));
      expect(salaryLpaOptions, orderedEquals(List.of(salaryLpaOptions)..sort()));
    });
  });
}
