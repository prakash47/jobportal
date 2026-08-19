import 'package:cq_mobile/core/format/patch_body.dart';
import 'package:flutter_test/flutter_test.dart';

/// The profile and education editors both send PATCHes, where an absent key
/// means "leave this alone". Both used to skip a field whose text was empty,
/// so clearing a headline, a grade or a field of study saved successfully,
/// showed no error, and left the old value in place — the user found it back
/// on the next load with nothing to explain it.
///
/// The rule is easy to "tidy" back into `if (value.isNotEmpty)`, which is why
/// it lives in one place with these tests around it.
void main() {
  group('putClearable', () {
    test('sends an emptied field so the column is actually cleared', () {
      final body = <String, dynamic>{};
      putClearable(body, 'headline', '');
      expect(body.containsKey('headline'), isTrue);
      expect(body['headline'], '');
    });

    test('sends whitespace-only input as a clear, not as spaces', () {
      final body = <String, dynamic>{};
      putClearable(body, 'grade', '   ');
      expect(body['grade'], '');
    });

    test('trims a real value', () {
      final body = <String, dynamic>{};
      putClearable(body, 'summary', '  Backend engineer  ');
      expect(body['summary'], 'Backend engineer');
    });
  });

  group('putNonEmpty', () {
    test('omits the key entirely when empty', () {
      final body = <String, dynamic>{};
      putNonEmpty(body, 'phone', '');
      // phone's DTO is /^[+0-9 \-()]{6,20}$/, so '' is a 400 rather than a
      // clear. Omitting is the only correct behaviour for it.
      expect(body.containsKey('phone'), isFalse);
    });

    test('omits whitespace-only input too', () {
      final body = <String, dynamic>{};
      putNonEmpty(body, 'phone', '  ');
      expect(body.containsKey('phone'), isFalse);
    });

    test('sends a real value trimmed', () {
      final body = <String, dynamic>{};
      putNonEmpty(body, 'phone', ' +91 98765 43210 ');
      expect(body['phone'], '+91 98765 43210');
    });
  });

  test('the two helpers genuinely differ on empty input', () {
    // If someone collapses them into one, this fails.
    final a = <String, dynamic>{};
    final b = <String, dynamic>{};
    putClearable(a, 'x', '');
    putNonEmpty(b, 'x', '');
    expect(a.containsKey('x'), isTrue);
    expect(b.containsKey('x'), isFalse);
  });
}
