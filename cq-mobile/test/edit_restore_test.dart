import 'package:cq_mobile/features/languages/data/language_models.dart';
import 'package:cq_mobile/features/languages/data/languages_repository.dart';
import 'package:cq_mobile/features/projects/data/project_models.dart';
import 'package:cq_mobile/features/projects/data/projects_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Neither `/me/projects` nor `/me/languages` has a PATCH, so editing a row
/// means deleting it and creating a replacement. That leaves a window in which
/// the candidate's data exists nowhere, and the original code simply let the
/// row die there: open the editor, change one field, hit a validation error or
/// a dropped connection, and the entry is gone with no way to get it back.
///
/// These tests pin the recovery. They drive the real Dio stack through an
/// interceptor so the request sequence is asserted end to end, not mocked at
/// the repository seam where the ordering bug lived.
class _Server extends Interceptor {
  _Server({this.failCreateTimes = 0, this.failEveryCreate = false});

  /// Fail the first N creates — the edit's create — then let restores through.
  int failCreateTimes;

  /// Fail every create, so even the restore cannot land.
  final bool failEveryCreate;

  final List<String> calls = [];
  final List<Map<String, dynamic>> createBodies = [];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final method = options.method;
    calls.add('$method ${options.path}');

    if (method == 'POST') {
      createBodies.add(Map<String, dynamic>.from(options.data as Map));
      if (failEveryCreate || failCreateTimes > 0) {
        failCreateTimes--;
        handler.reject(
          DioException(
            requestOptions: options,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: 409,
              data: const {'message': 'Already added'},
            ),
            type: DioExceptionType.badResponse,
          ),
        );
        return;
      }
    }
    handler.resolve(
      Response<dynamic>(
        requestOptions: options,
        statusCode: 200,
        data: <String, dynamic>{
          'id': 99,
          'title': 'x',
          'name': 'x',
          'proficiency': 'BASIC',
          'techStack': <String>[],
          'createdAt': '2026-08-01T00:00:00.000Z',
        },
      ),
    );
  }
}

Dio _dio(_Server s) => Dio()..interceptors.add(s);

final _project = ProjectItem.fromJson(const {
  'id': 7,
  'title': 'Realtime bus tracker',
  'description': 'Live ETAs for BMTC routes',
  'techStack': ['Flutter', 'Go'],
  'url': 'https://example.com/bus',
  'createdAt': '2026-07-01T00:00:00.000Z',
});

final _language = LanguageItem.fromJson(const {
  'id': 3,
  'name': 'Kannada',
  'proficiency': 'FLUENT',
  'createdAt': '2026-07-01T00:00:00.000Z',
});

void main() {
  group('project edit', () {
    test('a successful edit deletes the old row then creates the new one', () async {
      final server = _Server();
      await ProjectsRepository(_dio(server))
          .replace(_project, const {'title': 'Bus tracker v2'});

      expect(server.calls, ['DELETE /me/projects/7', 'POST /me/projects']);
      expect(server.createBodies.single['title'], 'Bus tracker v2');
    });

    test('a failed edit puts the original back', () async {
      // One create fails (the edit); the next — the restore — succeeds.
      final server = _Server(failCreateTimes: 1);
      final repo = ProjectsRepository(_dio(server));

      await expectLater(
        repo.replace(_project, const {'title': ''}),
        throwsA(isA<ProjectsException>()),
      );

      expect(server.calls, [
        'DELETE /me/projects/7',
        'POST /me/projects', // the edit, rejected
        'POST /me/projects', // the restore
      ]);

      // The restore must rebuild the row as it stood, not a husk of it.
      final restored = server.createBodies.last;
      expect(restored['title'], 'Realtime bus tracker');
      expect(restored['description'], 'Live ETAs for BMTC routes');
      expect(restored['techStack'], ['Flutter', 'Go']);
      expect(restored['url'], 'https://example.com/bus');
    });

    test('the error the user sees is why the EDIT failed, not a restore notice',
        () async {
      final server = _Server(failCreateTimes: 1);
      final repo = ProjectsRepository(_dio(server));
      try {
        await repo.replace(_project, const {'title': ''});
        fail('should have thrown');
      } on ProjectsException catch (e) {
        // The original is safely back, so the message must explain the edit —
        // telling them about a restore they did not ask for would bury it.
        expect(e.message, isNot(contains('could not be restored')));
      }
    });

    test('when the restore also fails, it says so instead of going quiet',
        () async {
      final server = _Server(failEveryCreate: true);
      final repo = ProjectsRepository(_dio(server));
      try {
        await repo.replace(_project, const {'title': 'whatever'});
        fail('should have thrown');
      } on ProjectsException catch (e) {
        expect(e.message, contains('could not be restored'));
        expect(e.message, contains('add it again'));
      }
      // Both the edit and the restore were genuinely attempted.
      expect(server.createBodies, hasLength(2));
    });
  });

  group('language edit', () {
    test('a successful edit deletes then creates', () async {
      final server = _Server();
      await LanguagesRepository(_dio(server))
          .replace(_language, const {'name': 'Kannada', 'proficiency': 'NATIVE'});

      expect(server.calls, ['DELETE /me/languages/3', 'POST /me/languages']);
    });

    test('a 409 on the new name restores the old language', () async {
      // The real repro: rename a language to one already on the profile.
      // CandidateLanguage is @@unique([candidateId, name]), so the create 409s
      // — and the row being edited has already been deleted by then.
      final server = _Server(failCreateTimes: 1);
      final repo = LanguagesRepository(_dio(server));

      await expectLater(
        repo.replace(_language, const {'name': 'Hindi', 'proficiency': 'FLUENT'}),
        throwsA(isA<LanguagesException>()),
      );

      expect(server.createBodies.last, {
        'name': 'Kannada',
        'proficiency': 'FLUENT',
      });
    });

    test('when the restore also fails, it says so', () async {
      final server = _Server(failEveryCreate: true);
      try {
        await LanguagesRepository(_dio(server))
            .replace(_language, const {'name': 'Hindi', 'proficiency': 'BASIC'});
        fail('should have thrown');
      } on LanguagesException catch (e) {
        expect(e.message, contains('could not be restored'));
      }
    });
  });
}
