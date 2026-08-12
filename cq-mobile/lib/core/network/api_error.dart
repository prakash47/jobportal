import 'package:dio/dio.dart';

/// Turns a [DioException] into a short, user-safe message. Prefers the API's own
/// `message` field (NestJS error body) so server-side validation text surfaces
/// verbatim; falls back to a friendly generic line.
String friendlyDioMessage(DioException e) {
  if (e.response == null) {
    return "Can't reach the server. Check your connection and try again.";
  }
  final data = e.response?.data;
  if (data is Map && data['message'] is String) {
    return data['message'] as String;
  }
  if (data is Map && data['message'] is List && (data['message'] as List).isNotEmpty) {
    final first = (data['message'] as List).first;
    if (first is String) return first;
  }
  return 'Something went wrong. Please try again.';
}
