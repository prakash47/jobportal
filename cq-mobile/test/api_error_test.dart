import 'package:cq_mobile/core/network/api_error.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// The API is NestJS + Zod, and its error envelope carries Zod's issue list
/// through untouched so the web apps can highlight individual fields:
///
///   { statusCode: 400, error: 'Bad Request',
///     message: [ { path: ['email'], message: 'Invalid email', code: … } ] }
///
/// The app only read `message` when it was a String or a List of Strings, so
/// every validation failure in the product collapsed to "Something went wrong.
/// Please try again." — a candidate rejected on one field was told nothing
/// about which field, on registration, profile edits and job alerts alike.
DioException _err(dynamic body, {int status = 400}) {
  final req = RequestOptions(path: '/me/profile');
  return DioException(
    requestOptions: req,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(
      requestOptions: req,
      statusCode: status,
      data: body,
    ),
  );
}

void main() {
  group('friendlyDioMessage', () {
    test('names the field a Zod issue points at', () {
      final msg = friendlyDioMessage(_err(const {
        'statusCode': 400,
        'error': 'Bad Request',
        'message': [
          {'path': ['email'], 'message': 'Invalid email', 'code': 'invalid_string'},
        ],
      }));
      expect(msg, 'Email: Invalid email');
      expect(msg, isNot(contains('Something went wrong')));
    });

    test('spaces out a camelCase field name', () {
      final msg = friendlyDioMessage(_err(const {
        'message': [
          {'path': ['noticePeriodDays'], 'message': 'Expected number'},
        ],
      }));
      expect(msg, 'Notice period days: Expected number');
    });

    test('uses the deepest path segment for a nested field', () {
      final msg = friendlyDioMessage(_err(const {
        'message': [
          {'path': ['body', 'password'], 'message': 'Too short'},
        ],
      }));
      expect(msg, 'Password: Too short');
    });

    test('shows the first issue when several fields failed', () {
      final msg = friendlyDioMessage(_err(const {
        'message': [
          {'path': ['email'], 'message': 'Invalid email'},
          {'path': ['password'], 'message': 'Too short'},
        ],
      }));
      expect(msg, 'Email: Invalid email');
    });

    test('falls back to the bare message when the issue has no path', () {
      final msg = friendlyDioMessage(_err(const {
        'message': [
          {'message': 'Passwords do not match'},
        ],
      }));
      expect(msg, 'Passwords do not match');
    });

    test('a plain string message still passes through verbatim', () {
      // The apply-quota 429 body relies on this.
      final msg = friendlyDioMessage(_err(const {
        'statusCode': 429,
        'upgradeAvailable': true,
        'message': 'Daily application limit reached.',
      }, status: 429));
      expect(msg, 'Daily application limit reached.');
    });

    test('a list of plain strings still works', () {
      final msg = friendlyDioMessage(_err(const {
        'message': ['name should not be empty'],
      }));
      expect(msg, 'name should not be empty');
    });

    test('an unrecognised body still gets a safe generic line', () {
      expect(
        friendlyDioMessage(_err(const {'weird': true})),
        'Something went wrong. Please try again.',
      );
      expect(
        friendlyDioMessage(_err(const {'message': []})),
        'Something went wrong. Please try again.',
      );
      // An issue object with no usable message must not render "null".
      final msg = friendlyDioMessage(_err(const {
        'message': [
          {'path': ['email'], 'code': 'custom'},
        ],
      }));
      expect(msg, 'Something went wrong. Please try again.');
    });

    test('no response at all reads as a connection problem', () {
      final e = DioException(
        requestOptions: RequestOptions(path: '/x'),
        type: DioExceptionType.connectionError,
      );
      expect(friendlyDioMessage(e), contains('Check your connection'));
    });
  });
}
