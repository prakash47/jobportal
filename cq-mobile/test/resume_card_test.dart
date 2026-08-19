import 'dart:typed_data';

import 'package:cq_mobile/core/theme/app_theme.dart';
import 'package:cq_mobile/features/resume/data/resume_repository.dart';
import 'package:cq_mobile/features/resume/presentation/resume_section.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// A transport that fails every request, standing in for a dead network.
class _DeadAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    throw DioException.connectionError(
      requestOptions: options,
      reason: 'no network',
    );
  }

  @override
  void close({bool force = false}) {}
}

/// A transport that answers "you have no resume" truthfully.
class _EmptyAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString('{}', 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });

  @override
  void close({bool force = false}) {}
}

Future<void> _pump(WidgetTester tester, HttpClientAdapter adapter) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = adapter;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        resumeRepositoryProvider.overrideWith((ref) async =>
            ResumeRepository(dio)),
      ],
      child: MaterialApp(
        theme: CqTheme.light,
        home: const Scaffold(body: ResumeCard()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'a FAILED check never claims the candidate has no resume',
    (tester) async {
      await _pump(tester, _DeadAdapter());

      // The old code swallowed the error and fell through to the upload
      // prompt, telling someone who has a CV on file that they have none —
      // and applying requires one, so they would re-upload it.
      // Asserted on BEHAVIOUR, not on the exact sentence: the message comes
      // from the shared friendlyDioMessage helper and may legitimately be
      // reworded, but these three facts must hold.
      expect(
        find.textContaining('Add your resume'),
        findsNothing,
        reason: 'never claim there is no resume when the check failed',
      );
      expect(find.byIcon(Icons.cloud_off_rounded), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    },
  );

  testWidgets(
    'a genuinely empty response DOES show the upload prompt',
    (tester) async {
      await _pump(tester, _EmptyAdapter());

      expect(find.textContaining('Add your resume'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    },
  );
}
