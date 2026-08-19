import 'package:dio/dio.dart';

/// Turns a [DioException] into a short, user-safe message. Prefers the API's own
/// `message` field (NestJS error body) so server-side validation text surfaces
/// verbatim; falls back to a friendly generic line.
String friendlyDioMessage(DioException e) {
  if (e.response == null) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return serverMessage(e) ?? 'Something went wrong. Please try again.';
}

/// The API's own words for this failure, or null when it did not send any.
///
/// Split out from [friendlyDioMessage] because a caller sometimes wants the
/// server's text only for certain statuses and its own copy for the rest —
/// AuthRepository keeps its friendlier lines for 401 and 409, where the server
/// adds nothing, but must not swallow a 400's validation detail.
String? serverMessage(DioException e) {
  final data = e.response?.data;
  if (data is Map) {
    final message = data['message'];
    if (message is String && message.isNotEmpty) return message;
    if (message is List && message.isNotEmpty) {
      final first = message.first;
      if (first is String && first.isNotEmpty) return first;
      // The API hands Zod's issue list through untouched — the web apps read it
      // to highlight individual fields — so a validation failure arrives as
      // `[{path, message, code}, …]`, not as a sentence. Reading only the
      // String case turned every one of them into "Something went wrong",
      // which told a candidate nothing about the field they had to fix.
      if (first is Map) {
        final issue = _fromZodIssue(first);
        if (issue != null) return issue;
      }
    }
  }
  return null;
}

/// `{path: ['email'], message: 'Invalid email'}` → `Email: Invalid email`.
///
/// The field name is worth carrying: Zod's own text ("Required", "Too small")
/// is meaningless on a form with six inputs. Only the first issue is shown —
/// forms here surface a single error line, and fixing the first reveals the
/// next.
String? _fromZodIssue(Map issue) {
  final message = issue['message'];
  if (message is! String || message.isEmpty) return null;

  final path = issue['path'];
  final field = (path is List && path.isNotEmpty) ? path.last : null;
  if (field is! String || field.isEmpty) return message;

  return '${_humanise(field)}: $message';
}

/// `noticePeriodDays` → `Notice period days`. The API's field names are the
/// only names we have; spacing them out at least stops them reading as code.
String _humanise(String field) {
  final spaced = field.replaceAllMapped(
    RegExp(r'(?<=[a-z0-9])([A-Z])'),
    (m) => ' ${m[1]!.toLowerCase()}',
  );
  return spaced[0].toUpperCase() + spaced.substring(1);
}
