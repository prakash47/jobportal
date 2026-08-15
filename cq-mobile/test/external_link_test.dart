import 'package:cq_mobile/core/network/external_link.dart';
import 'package:flutter_test/flutter_test.dart';

// Company website URLs are recruiter-supplied and the API only validates them
// with Zod's `.url()`, which accepts any parseable scheme — javascript:, data:,
// file:, intent: all pass it. These tests pin the app-side allowlist, because
// this is the only thing standing between a hostile stored value and
// launchUrl(..., externalApplication).
void main() {
  group('safeWebUri accepts real web addresses', () {
    test('https URL passes through', () {
      expect(safeWebUri('https://acme.com/careers').toString(),
          'https://acme.com/careers');
    });

    test('http URL is allowed', () {
      expect(safeWebUri('http://acme.com')?.scheme, 'http');
    });

    test('a bare host is upgraded to https', () {
      expect(safeWebUri('acme.com').toString(), 'https://acme.com');
    });

    test('surrounding whitespace is trimmed', () {
      expect(safeWebUri('  https://acme.com  ')?.host, 'acme.com');
    });
  });

  group('safeWebUri refuses everything that is not http(s)', () {
    for (final hostile in [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'intent://scan/#Intent;scheme=zxing;end',
      'ftp://files.acme.com',
      'tel:+919000000000',
      'mailto:hr@acme.com',
    ]) {
      test('refuses $hostile', () {
        expect(safeWebUri(hostile), isNull);
      });
    }

    test('refuses empty and null', () {
      expect(safeWebUri(''), isNull);
      expect(safeWebUri('   '), isNull);
      expect(safeWebUri(null), isNull);
    });

    test('a scheme-bearing hostile value is refused, not laundered', () {
      // The scheme-prepending convenience must never turn `javascript:alert(1)`
      // into `https://javascript:alert(1)` — that would convert a value we
      // reject into one we accept.
      final uri = safeWebUri('javascript:alert(1)');
      expect(uri, isNull);
    });

    test('refuses a scheme-only value with no host', () {
      expect(safeWebUri('https://'), isNull);
    });
  });

  group('hostLabel', () {
    test('strips scheme, www and path', () {
      expect(hostLabel('https://www.acme.com/careers/india'), 'acme.com');
    });

    test('keeps a non-www subdomain', () {
      expect(hostLabel('https://jobs.acme.com'), 'jobs.acme.com');
    });

    test('falls back to the raw value when unparseable as a host', () {
      expect(hostLabel('not a url'), 'not a url');
    });
  });
}
