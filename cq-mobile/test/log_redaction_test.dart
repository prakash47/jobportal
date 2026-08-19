import 'package:cq_mobile/core/network/dio_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// The debug logger printed request bodies verbatim, so signing in wrote a
/// plaintext password to logcat, requesting a reset wrote the OTP, and
/// completing one wrote the reset ticket. "Debug only" is not containment: a
/// debug APK is precisely the build handed to a colleague to try out, on a
/// phone where `adb logcat` and any log-reading process can see it.
String _s(Object? v) => v.toString();

void main() {
  group('log redaction', () {
    test('masks a password in a login body', () {
      final out = RedactingLogInterceptor.redact(const {
        'email': 'priya@example.com',
        'password': 'hunter2-actual-secret',
      });
      expect(_s(out), contains('priya@example.com'));
      expect(_s(out), isNot(contains('hunter2-actual-secret')));
      expect((out! as Map)['password'], '***');
    });

    test('masks an OTP and a reset ticket', () {
      final out = RedactingLogInterceptor.redact(const {
        'otp': '482913',
        'ticket': 'rst_9f3a2b',
      });
      expect(_s(out), isNot(contains('482913')));
      expect(_s(out), isNot(contains('rst_9f3a2b')));
    });

    test('matches regardless of case or underscores', () {
      final out = RedactingLogInterceptor.redact(const {
        'newPassword': 'a',
        'new_password': 'b',
        'REFRESHTOKEN': 'c',
      }) as Map;
      expect(out.values.every((v) => v == '***'), isTrue);
    });

    test('reaches a secret nested inside an envelope', () {
      final out = RedactingLogInterceptor.redact(const {
        'data': {
          'session': [
            {'accessToken': 'eyJhbGciOi'},
          ],
        },
      });
      expect(_s(out), isNot(contains('eyJhbGciOi')));
    });

    test('leaves ordinary fields readable — the log still has to be useful', () {
      final out = RedactingLogInterceptor.redact(const {
        'title': 'Flutter Engineer',
        'page': 2,
        'skills': ['Dart', 'Flutter'],
      });
      expect(_s(out), contains('Flutter Engineer'));
      expect(_s(out), contains('Dart'));
      expect(_s(out), contains('2'));
    });

    test('does not try to print a multipart upload', () {
      final form = FormData.fromMap({'note': 'cv'});
      final out = RedactingLogInterceptor.redact(form);
      expect(_s(out), contains('FormData'));
    });

    test('a null body is left alone', () {
      expect(RedactingLogInterceptor.redact(null), isNull);
    });
  });
}
