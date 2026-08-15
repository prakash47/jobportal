/// Forward progression of an application (terminal states REJECTED / WITHDRAWN
/// branch off from any stage). Drives the compact stepper.
const List<String> applicationForwardStages = [
  'APPLIED',
  'IN_REVIEW',
  'SHORTLISTED',
  'INTERVIEWED',
  'OFFERED',
  'HIRED',
];

String applicationStatusLabel(String s) => switch (s) {
  'APPLIED' => 'Applied',
  'IN_REVIEW' => 'In review',
  'SHORTLISTED' => 'Shortlisted',
  'INTERVIEWED' => 'Interviewed',
  'OFFERED' => 'Offered',
  'HIRED' => 'Hired',
  'REJECTED' => 'Not selected',
  'WITHDRAWN' => 'Withdrawn',
  'ALL' => 'All',
  _ => s,
};

/// One transition in an application's history (`statusHistory[]`).
class StatusEvent {
  const StatusEvent({required this.to, this.from, required this.at, this.by});

  final String to;
  final String? from;
  final DateTime at;

  /// CANDIDATE | RECRUITER | SYSTEM
  final String? by;

  factory StatusEvent.fromJson(Map<String, dynamic> j) => StatusEvent(
    from: j['from'] as String?,
    to: j['to'] as String? ?? 'APPLIED',
    at: DateTime.tryParse(j['at'] as String? ?? '') ?? DateTime(2000),
    by: j['by'] as String?,
  );
}

/// One application row from `GET /me/applications`. Carries the full
/// `statusHistory` (used for the timeline); rows may have an empty history for
/// legacy/seed data, so [timeline] always seeds the APPLIED step from
/// [appliedAt].
class Application {
  const Application({
    required this.id,
    required this.status,
    required this.appliedAt,
    required this.updatedAt,
    required this.jobTitle,
    required this.companyName,
    this.jobSlug = '',
    this.companyId = 0,
    this.companySlug = '',
    this.statusHistory = const [],
  });

  final int id;

  /// APPLIED | IN_REVIEW | SHORTLISTED | INTERVIEWED | OFFERED | HIRED |
  /// REJECTED | WITHDRAWN
  final String status;
  final DateTime appliedAt;
  final DateTime updatedAt;
  final String jobTitle;
  final String companyName;
  final String jobSlug;
  final int companyId;
  final String companySlug;
  final List<StatusEvent> statusHistory;

  /// Tap-through targets, present on the live list payload.
  String? get jobPath => jobSlug.isEmpty ? null : jobSlug;
  String? get companyHandle => (companyId > 0 && companySlug.isNotEmpty)
      ? '$companySlug-overview-$companyId'
      : null;

  /// Terminal states can't be withdrawn (mirrors the server state machine).
  bool get isTerminal =>
      status == 'HIRED' || status == 'REJECTED' || status == 'WITHDRAWN';

  /// The full journey to render as a timeline: always starts with APPLIED (from
  /// [appliedAt]), then every recorded transition. Newest last.
  List<StatusEvent> get timeline {
    final events = <StatusEvent>[
      StatusEvent(to: 'APPLIED', at: appliedAt, by: 'CANDIDATE'),
    ];
    for (final e in statusHistory) {
      if (e.to == 'APPLIED' && events.length == 1) continue; // avoid dup seed
      events.add(e);
    }
    return events;
  }

  Application copyWith({String? status}) => Application(
    id: id,
    status: status ?? this.status,
    appliedAt: appliedAt,
    updatedAt: updatedAt,
    jobTitle: jobTitle,
    companyName: companyName,
    jobSlug: jobSlug,
    companyId: companyId,
    companySlug: companySlug,
    statusHistory: statusHistory,
  );

  factory Application.fromJson(Map<String, dynamic> j) {
    final job = (j['job'] as Map?)?.cast<String, dynamic>() ?? const {};
    final company = (job['company'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Application(
      id: (j['id'] as num?)?.toInt() ?? 0,
      status: j['status'] as String? ?? 'APPLIED',
      appliedAt: DateTime.tryParse(j['appliedAt'] as String? ?? '') ?? DateTime(2000),
      updatedAt: DateTime.tryParse(j['updatedAt'] as String? ?? '') ?? DateTime(2000),
      jobTitle: job['title'] as String? ?? 'Job',
      companyName: company['name'] as String? ?? '',
      jobSlug: job['canonicalSlug'] as String? ?? '',
      companyId: (company['id'] as num?)?.toInt() ?? 0,
      companySlug: company['slug'] as String? ?? '',
      statusHistory: ((j['statusHistory'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => StatusEvent.fromJson(m.cast<String, dynamic>()))
          .toList(),
    );
  }
}

class ApplicationsPage {
  const ApplicationsPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
    this.counts = const {},
  });

  final List<Application> hits;
  final int total;
  final int page;
  final int pageSize;

  /// Per-status counts, independent of the current status filter (key 'ALL' =
  /// sum; zero-count statuses may be omitted). Drives the filter-chip badges.
  final Map<String, int> counts;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory ApplicationsPage.fromJson(Map<String, dynamic> j) {
    final rawCounts = (j['counts'] as Map?)?.cast<String, dynamic>() ?? const {};
    return ApplicationsPage(
      hits: ((j['hits'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => Application.fromJson(m.cast<String, dynamic>()))
          .toList(),
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
      counts: {
        for (final e in rawCounts.entries)
          if (e.value is num) e.key: (e.value as num).toInt(),
      },
    );
  }
}
