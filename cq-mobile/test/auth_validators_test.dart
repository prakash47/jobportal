import 'package:flutter_test/flutter_test.dart';

import 'package:cq_mobile/features/auth/presentation/auth_validators.dart';

void main() {
  group('validateEmail', () {
    test('accepts a valid email', () {
      expect(validateEmail('priya@example.com'), isNull);
    });
    test('rejects a malformed email', () {
      expect(validateEmail('not-an-email'), isNotNull);
    });
    test('rejects empty', () {
      expect(validateEmail(''), isNotNull);
    });
  });

  group('validateNewPassword (mirrors the API rule)', () {
    test('accepts 8+ chars with a number and special character', () {
      expect(validateNewPassword('Abcd1234!'), isNull);
    });
    test('rejects too short', () {
      expect(validateNewPassword('Ab1!'), isNotNull);
    });
    test('rejects missing a number', () {
      expect(validateNewPassword('Abcdefgh!'), isNotNull);
    });
    test('rejects missing a special character', () {
      expect(validateNewPassword('Abcd1234'), isNotNull);
    });
  });

  group('validateOptionalPhone', () {
    test('accepts empty (optional)', () {
      expect(validateOptionalPhone(''), isNull);
    });
    test('rejects too short', () {
      expect(validateOptionalPhone('123'), isNotNull);
    });
  });
}
