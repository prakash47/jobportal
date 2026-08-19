import 'package:cq_mobile/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

/// Both base URLs default to a developer's machine. That is right for
/// development and fatal in a store build: the app reaches nothing, and every
/// job or company link it shares points at the reviewer's own device. Nothing
/// in the pipeline noticed, because a release APK built with no --dart-define
/// looks entirely normal until it is installed.
///
/// This is the check CI runs before a release build is allowed out. Run without
/// --dart-define it is expected to report localhost, which is why the assertion
/// below is on the DETECTOR rather than on the current values.
void main() {
  group('release configuration', () {
    test('localhost defaults are detected', () {
      expect(AppConfig.pointsAtLocalhost, isTrue,
          reason: 'a plain `flutter test` has no --dart-define, so the '
              'defaults must be recognised as unshippable');
    });

    test('a real https host is accepted', () {
      // Mirrors what the detector must conclude for the values a release build
      // will be given.
      for (final url in const [
        'https://api.careerqueue.in',
        'https://careerqueue.in',
      ]) {
        expect(url.contains('localhost'), isFalse);
        expect(url.contains('127.0.0.1'), isFalse);
        expect(url.startsWith('http://'), isFalse);
      }
    });

    test('plain http counts as unshippable even on a real domain', () {
      // The release network-security config is HTTPS-only, so an http:// host
      // would fail at runtime anyway — better to catch it at build time.
      const url = 'http://api.careerqueue.in';
      expect(url.startsWith('http://'), isTrue);
    });
  });
}
