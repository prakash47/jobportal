// The candidate's active resume, from `GET /me/resume` (null when none).
// Applying requires one (the API returns RESUME_REQUIRED otherwise).

class ResumeView {
  const ResumeView({
    required this.id,
    required this.originalFilename,
    required this.sizeBytes,
    required this.mimeType,
    required this.scanStatus,
    required this.uploadedAt,
  });

  final int id;
  final String originalFilename;
  final int sizeBytes;
  final String mimeType;

  /// Virus-scan state (PENDING | CLEAN | INFECTED). Applying needs CLEAN; the
  /// API returns RESUME_SCANNING while it's still PENDING.
  final String scanStatus;
  final DateTime uploadedAt;

  bool get isClean => scanStatus == 'CLEAN';
  bool get isScanning => scanStatus == 'PENDING' || scanStatus == 'SCANNING';

  String get sizeLabel {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) return '${(sizeBytes / 1024).round()} KB';
    return '${(sizeBytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }

  factory ResumeView.fromJson(Map<String, dynamic> j) => ResumeView(
    id: (j['id'] as num?)?.toInt() ?? 0,
    originalFilename: j['originalFilename'] as String? ?? 'resume',
    sizeBytes: (j['sizeBytes'] as num?)?.toInt() ?? 0,
    mimeType: j['mimeType'] as String? ?? '',
    scanStatus: j['scanStatus'] as String? ?? 'CLEAN',
    uploadedAt: DateTime.tryParse(j['uploadedAt'] as String? ?? '') ?? DateTime.now(),
  );
}
