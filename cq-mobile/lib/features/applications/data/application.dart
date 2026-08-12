/// One application row from `GET /me/applications`. (Status history + per-status
/// counts aren't in this endpoint yet — those need a backend addition — so the
/// app shows the current status only.)
class Application {
  const Application({
    required this.id,
    required this.status,
    required this.appliedAt,
    required this.updatedAt,
    required this.jobTitle,
    required this.companyName,
  });

  final int id;

  /// APPLIED | IN_REVIEW | SHORTLISTED | INTERVIEWED | OFFERED | HIRED |
  /// REJECTED | WITHDRAWN
  final String status;
  final DateTime appliedAt;
  final DateTime updatedAt;
  final String jobTitle;
  final String companyName;

  /// Terminal states can't be withdrawn (mirrors the server state machine).
  bool get isTerminal =>
      status == 'HIRED' || status == 'REJECTED' || status == 'WITHDRAWN';

  Application copyWith({String? status}) => Application(
    id: id,
    status: status ?? this.status,
    appliedAt: appliedAt,
    updatedAt: updatedAt,
    jobTitle: jobTitle,
    companyName: companyName,
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
    );
  }
}

class ApplicationsPage {
  const ApplicationsPage({
    required this.hits,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<Application> hits;
  final int total;
  final int page;
  final int pageSize;

  int get totalPages => pageSize == 0 ? 1 : (total + pageSize - 1) ~/ pageSize;

  factory ApplicationsPage.fromJson(Map<String, dynamic> j) {
    return ApplicationsPage(
      hits: ((j['hits'] as List?) ?? const [])
          .whereType<Map>()
          .map((m) => Application.fromJson(m.cast<String, dynamic>()))
          .toList(),
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      pageSize: (j['pageSize'] as num?)?.toInt() ?? 20,
    );
  }
}
