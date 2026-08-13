import 'resume_models.dart';

// In-memory resume for demo/offline mode — starts with a sample so the profile
// looks complete; upload/remove mutate it within the session.
abstract final class ResumeMock {
  static ResumeView? current = ResumeView(
    id: 1,
    originalFilename: 'Demo_Resume.pdf',
    sizeBytes: 248 * 1024,
    mimeType: 'application/pdf',
    scanStatus: 'CLEAN',
    uploadedAt: DateTime.now().subtract(const Duration(days: 5)),
  );

  static ResumeView set(String filename, int sizeBytes) {
    current = ResumeView(
      id: 2,
      originalFilename: filename,
      sizeBytes: sizeBytes,
      mimeType: 'application/pdf',
      scanStatus: 'CLEAN',
      uploadedAt: DateTime.now(),
    );
    return current!;
  }

  static void clear() => current = null;
}
