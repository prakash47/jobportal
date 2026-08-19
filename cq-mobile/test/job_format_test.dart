import 'package:cq_mobile/core/format/job_format.dart';
import 'package:flutter_test/flutter_test.dart';

/// One lakh rupees, in paise.
const int _lakh = 100 * 100000;

int lpa(double lakhs) => (lakhs * _lakh).round();

void main() {
  group('formatSalaryLpa', () {
    test('a whole range keeps whole numbers — the common recruiter case', () {
      expect(formatSalaryLpa(lpa(12), lpa(18)), '₹12–18 LPA');
    });

    test(
      'a max only a rounding step above the min collapses to ONE number '
      '(was "₹32–32.0 LPA" on live seed data)',
      () {
        expect(formatSalaryLpa(320000000, 320305827), '₹32 LPA');
      },
    );

    test('both ends carry a decimal, or neither does', () {
      // Was "₹19–19.4 LPA": decimal shown on one side, hidden on the other.
      expect(formatSalaryLpa(190000000, 194308391), '₹19.0–19.4 LPA');
    });

    test('identical min and max render as a single value', () {
      expect(formatSalaryLpa(lpa(15), lpa(15)), '₹15 LPA');
    });

    test('open-ended ranges', () {
      expect(formatSalaryLpa(lpa(8), null), '₹8+ LPA');
      expect(formatSalaryLpa(null, lpa(20)), 'Up to ₹20 LPA');
    });

    test('past a crore it switches unit', () {
      expect(formatSalaryLpa(lpa(120), lpa(150)), '₹1.2–1.5 Cr');
    });

    test('a range straddling a crore keeps a unit on each end', () {
      // Never "₹90–1.2", which is what a single shared unit would produce.
      expect(formatSalaryLpa(lpa(90), lpa(120)), '₹90 LPA–₹1.2 Cr');
    });

    test('null in, null out', () {
      expect(formatSalaryLpa(null, null), isNull);
    });
  });
}
