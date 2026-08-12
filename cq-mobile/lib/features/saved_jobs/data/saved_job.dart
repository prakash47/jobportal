/// One saved job, as returned by `GET /me/saved-jobs`. The API joins Job +
/// Company but (deliberately) doesn't include city/salary/logo, and there's no
/// public job-detail endpoint — so the app shows title, company, saved date,
/// and application state, without a tap-through to the full job yet.
class SavedJob {
  const SavedJob({
    required this.jobId,
    required this.savedAt,
    required this.title,
    required this.companyName,
    required this.jobStatus,
    required this.applied,
    this.appliedStatus,
  });

  final int jobId;
  final DateTime savedAt;
  final String title;
  final String companyName;

  /// 'ACTIVE' | 'CLOSED' | 'EXPIRED' | 'DRAFT' | 'PENDING_MODERATION'
  final String jobStatus;
  final bool applied;

  /// e.g. 'APPLIED' | 'IN_REVIEW' | 'SHORTLISTED' … when [applied] is true.
  final String? appliedStatus;

  bool get isActive => jobStatus == 'ACTIVE';

  factory SavedJob.fromJson(Map<String, dynamic> j) {
    final job = (j['job'] as Map?)?.cast<String, dynamic>() ?? const {};
    final company = (job['company'] as Map?)?.cast<String, dynamic>() ?? const {};
    return SavedJob(
      jobId: (j['jobId'] as num?)?.toInt() ?? 0,
      savedAt: DateTime.tryParse(j['savedAt'] as String? ?? '') ?? DateTime(2000),
      title: job['title'] as String? ?? 'Job',
      companyName: company['name'] as String? ?? '',
      jobStatus: job['status'] as String? ?? 'ACTIVE',
      applied: j['applied'] as bool? ?? false,
      appliedStatus: j['appliedStatus'] as String?,
    );
  }
}

/// One page of saved jobs.
class SavedJobsPage {
  const SavedJobsPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<SavedJob> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory SavedJobsPage.fromJson(Map<String, dynamic> j) {
    return SavedJobsPage(
      hits: ((j['hits'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => SavedJob.fromJson(m.cast<String, dynamic>()))
          .toList(),
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
    );
  }
}
